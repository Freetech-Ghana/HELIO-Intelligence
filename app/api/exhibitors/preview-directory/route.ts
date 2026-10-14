import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const ALLOWED_HOSTS = new Set([
  "gulfhost.ae",
  "www.gulfhost.ae",
  "ism-me.com",
  "www.ism-me.com",
  "dwtc.com",
  "www.dwtc.com"
]);

function approved(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !ALLOWED_HOSTS.has(url.hostname.toLowerCase())
    ) return null;
    return url;
  } catch {
    return null;
  }
}

function decodeHtml(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function clean(text: string) {
  return decodeHtml(
    text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")
  ).trim();
}

async function permitted(url: URL) {
  const response = await fetch(
    new URL("/robots.txt", url.origin),
    {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "HELIOExhibitorResearch/1.0" }
    }
  );

  if (!response.ok) throw Error("Cannot verify robots.txt permissions");

  const rules = (await response.text()).split(/\r?\n/);
  let active = false;
  const blocked: string[] = [];

  for (const line of rules) {
    const entry = line.split("#")[0].trim();
    const separator = entry.indexOf(":");
    if (separator < 0) continue;

    const name = entry.slice(0, separator).trim().toLowerCase();
    const value = entry.slice(separator + 1).trim();

    if (name === "user-agent") {
      active = value === "*" ||
        value.toLowerCase() === "helioexhibitorresearch";
    }

    if (name === "disallow" && active && value) {
      blocked.push(value);
    }
  }

  if (blocked.some(path => url.pathname.startsWith(path))) {
    throw Error("Directory access is disallowed by robots.txt");
  }
}

async function readPage(initial: URL) {
  let current = initial;

  for (let attempt = 0; attempt < 4; attempt++) {
    if (!approved(current.href)) throw Error("Unapproved directory host");

    await permitted(current);

    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
      headers: {
        "User-Agent": "HELIOExhibitorResearch/1.0",
        "Accept": "text/html"
      }
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw Error("Invalid redirect");

      const next = approved(new URL(location, current).href);
      if (!next) throw Error("Redirect outside approved hosts");

      current = next;
      continue;
    }

    if (!response.ok) throw Error(`Directory returned HTTP ${response.status}`);

    if (!(response.headers.get("content-type") || "").includes("text/html")) {
      throw Error("Directory did not return HTML");
    }

    const length = Number(response.headers.get("content-length") || 0);
    if (length > 500000) throw Error("Directory page exceeds size limit");

    const reader = response.body?.getReader();
    if (!reader) throw Error("Empty directory response");

    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        total += value.byteLength;
        if (total > 500000) {
          throw Error("Directory page exceeds size limit");
        }
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }

    const html = new TextDecoder().decode(
      Buffer.concat(chunks.map(chunk => Buffer.from(chunk)))
    );

    return { html, source: current.href };
  }

  throw Error("Too many redirects");
}

function extract(html: string, source: string) {
  const rows: {
    company_name: string;
    country: string;
    hall: string;
    stand: string;
    profile_url: string;
  }[] = [];

  const seen = new Set<string>();

  for (const match of html.matchAll(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  )) {
    const name = clean(match[2]);
    if (name.length < 3 || name.length > 150) continue;

    let url: URL;
    try {
      url = new URL(decodeHtml(match[1]), source);
    } catch {
      continue;
    }

    if (!approved(url.href)) continue;

    if (!/\/exhibitor(?:s)?\/[^/?#]+/i.test(url.pathname)) continue;

    if (/login|register|services|manual|contact|apply/i.test(url.pathname)) {
      continue;
    }

    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);

    rows.push({
      company_name: name,
      country: "",
      hall: "",
      stand: "",
      profile_url: url.href
    });

    if (rows.length >= 100) break;
  }

  return rows;
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!token || !supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: authError } = await db.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const exhibitionId = body?.exhibitionId;

    if (
      typeof exhibitionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(exhibitionId)
    ) {
      return NextResponse.json(
        { error: "Invalid exhibition ID" },
        { status: 400 }
      );
    }

    const { data: exhibition, error } = await db
      .from("exhibitions")
      .select("id,name,directory_url")
      .eq("id", exhibitionId)
      .eq("owner_id", user.id)
      .single();

    if (error || !exhibition) {
      return NextResponse.json(
        { error: "Exhibition not found" },
        { status: 404 }
      );
    }

    const url = approved(exhibition.directory_url || "");

    if (!url) {
      return NextResponse.json(
        { error: "No approved official directory saved for this exhibition" },
        { status: 400 }
      );
    }

    const page = await readPage(url);
    const exhibitors = extract(page.html, page.source);

    return NextResponse.json({
      exhibition: exhibition.name,
      source: page.source,
      exhibitors,
      count: exhibitors.length,
      notice: "Candidate records only. Verify each company and its participation before importing. No data was saved."
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Reader failed";

    return NextResponse.json(
      { error: message },
      { status: 422 }
    );
  }
}
