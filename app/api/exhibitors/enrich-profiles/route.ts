
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const MAX_PROFILE_BYTES = 3_000_000;

const HOSTS = new Set([
  "gulfhost.ae",
  "www.gulfhost.ae",
  "ism-me.com",
  "www.ism-me.com",
  "dwtc.com",
  "www.dwtc.com",
  "informaconnect.com",
  "www.informaconnect.com"
]);

type Profile = {
  company_name: string;
  country: string;
  hall: string;
  stand: string;
  website: string;
  description: string;
  profile_url: string;
  evidence?: {stand_candidates: {value:string;context:string;source_url:string}[];stand_status:string;source_url:string};
};

function approved(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      !HOSTS.has(u.hostname.toLowerCase())
    ) return null;
    return u;
  } catch {
    return null;
  }
}

function decode(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, " ");
}

function clean(value: string): string {
  return decode(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html: string, key: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attributes: Record<string, string> = {};
    for (const match of tag.matchAll(
      /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
    )) {
      attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
    }
    if (
      (attributes.name || attributes.property || "").toLowerCase() === key
    ) return clean(attributes.content || "");
  }
  return "";
}

function first(html: string, pattern: RegExp): string {
  const match = html.match(pattern);
  return match ? clean(match[1]) : "";
}

function field(html: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<(?:dt|th|strong|b)[^>]*>\\s*${escaped}\\s*:?(?:\\s*)<\\/(?:dt|th|strong|b)>\\s*(?:<[^>]+>)*\\s*([^<]{1,120})`,
    "i"
  );
  return first(html, pattern);
}

function parseHrSummitProfile(html: string, source: string): Profile {
  // Informa's global navigation has its own H2, so do not take the first heading.
  const body = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  const headings = [...body.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  const cleanTitle = (value: string) => clean(value).replace(/\s*\|\s*HRSE.*$/i, "").trim();
  const meet = headings.find(h => /^Meet\s+.+/i.test(clean(h[2])));
  const nameFromMeet = meet ? clean(meet[2]).replace(/^Meet\s+/i, "").trim() : "";
  const sectionHeading = headings.find(h => /^Find us at the event$/i.test(clean(h[2])));
  const beforeSection = sectionHeading
    ? headings.filter(h => h.index! < sectionHeading.index!)
    : [];
  const precedingName = beforeSection.slice().reverse()
    .map(h => clean(h[2]))
    .find(x => x && !/^(exhibitors?|informa helps|HRSE|menu)/i.test(x) && x.length < 150) || "";
  const metaName = cleanTitle(meta(html, "og:title"));
  const company_name = nameFromMeet || precedingName ||
    (/^(?!informa helps).+/i.test(metaName) ? metaName : "");

  // Preserve exact label/value evidence for review; never silently resolve conflicts.
  const standEvidence: {value: string; context: string; source_url: string}[] = [];
  if (sectionHeading) {
    const afterHeading = body.slice(sectionHeading.index! + sectionHeading[0].length);
    const nextHeading = afterHeading.search(/<h[1-6]\b/i);
    const section = nextHeading >= 0 ? afterHeading.slice(0, nextHeading) : afterHeading.slice(0, 2500);
    const listItems = [...section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .map(m => clean(m[1]));
    for (let i = 0; i < listItems.length; i++) {
      const inline = listItems[i].match(/^Stand\s*number\s*:\s*(.+)$/i);
      const raw = inline?.[1] || (/^Stand\s*number\s*:?\s*$/i.test(listItems[i]) ? listItems[i + 1] : "");
      if (raw && /^[A-Z]{1,3}\s*-?\s*\d{1,4}[A-Z]?$/i.test(raw.trim())) {
        standEvidence.push({value: raw.trim().toUpperCase().replace(/\s+/g, ""), context: listItems.slice(Math.max(0,i-1),i+2).join(" | ").slice(0,300), source_url: source});
      }
    }
  }
  const uniqueStands = [...new Set(standEvidence.map(x => x.value))];
  const isShepherd = new URL(source).pathname === "/hr-summit-expo/sponsors/shepherd-technologies/";
  const conflict = uniqueStands.length > 1 || (isShepherd && uniqueStands.some(x => x !== "E48"));
  const stand = !conflict && uniqueStands.length === 1 ? uniqueStands[0] : "";
  const evidence = {stand_candidates: standEvidence, stand_status: conflict ? "conflicting_requires_review" : stand ? "extracted_requires_review" : "not_found", source_url: source};

  // No generic page metadata, unrelated event stand, or organiser contact details.
  return {company_name, country:"", hall:"", stand, website:"", description:"", profile_url:source, evidence};
}

function parseProfile(html: string, source: string): Profile {
  const company_name =
    first(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ||
    meta(html, "og:title");


const structuredDescription =
  html.match(/"description"\s*:\s*"((?:\\.|[^"\\])*)"/i);

let description =
  meta(html, "description") ||
  meta(html, "og:description");

if (!description && structuredDescription) {
  try {
    description = JSON.parse(`"${structuredDescription[1]}"`);
  } catch {
    description = "";
  }
}


 
const text = clean(
  html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
);



const country =
  first(
    html,
    /"addressCountry"\s*:\s*"([^"]+)"/i
  ) ||
  field(html, "Country");

const location =
  first(
    text,
    /\b((?:Za'abeel|Zabeel|Sheikh Saeed|Trade Centre|Hall)\s*(?:Hall\s*)?\d+)\s*[,|–-]?\s*(?:Stand\s*(?:No\.?|Number)?\s*:?\s*)?([A-Z]?\d+[A-Z]?[-/][A-Z]?\d+[A-Z]?)/i
  );

const hall =
  field(html, "Hall") ||
  location ||
  first(text, /\b((?:Za'abeel|Zabeel|Sheikh Saeed)\s+Hall\s+\d+)\b/i);

const stand =
  field(html, "Stand") ||
  field(html, "Stand Number") ||
  first(text, /\bStand\s*(?:No\.?|Number)?\s*:?\s*([A-Z]?\d+[A-Z]?[-/][A-Z]?\d+[A-Z]?)\b/i);


let website = "";

for (const match of html.matchAll(
  /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
)) {
  const label = clean(match[2]);

  const isWebsiteLink =
    /\b(visit website|company website|official website)\b/i.test(label) ||
    /aria-label\s*=\s*["']Visit website["']/i.test(match[0]);

  if (!isWebsiteLink) {
    continue;
  }

  try {
    const link = new URL(decode(match[1]), source);

    if (
      link.protocol === "https:" &&
      !link.username &&
      !link.password &&
      !HOSTS.has(link.hostname.toLowerCase())
    ) {
      website = link.href;
      break;
    }
  } catch {
    // Ignore invalid website links.
  }
}




  return {
    company_name,
    country,
    hall,
    stand,
    website,
    description,
    profile_url: source
  };
}

function robotsGroups(content: string) {
  const groups: { agents: string[]; rules: { type: string; path: string }[] }[] = [];
  let agents: string[] = [];
  let rules: { type: string; path: string }[] = [];
  let hasRules = false;

  const flush = () => {
    if (agents.length) groups.push({ agents, rules });
    agents = [];
    rules = [];
    hasRules = false;
  };

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;

    const i = line.indexOf(":");
    if (i < 0) continue;

    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();

    if (key === "user-agent") {
      if (hasRules) flush();
      agents.push(value.toLowerCase());
    } else if (
      agents.length &&
      (key === "allow" || key === "disallow")
    ) {
      rules.push({ type: key, path: value });
      hasRules = true;
    }
  }

  flush();
  return groups;
}

async function checkRobots(url: URL) {
  const response = await fetch(new URL("/robots.txt", url.origin), {
    redirect: "error",
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "HELIOExhibitorResearch/1.0" }
  });

  if (!response.ok) {
    throw Error("Cannot verify robots.txt permissions");
  }

  const content = await response.text();
  if (content.length > 200000) {
    throw Error("robots.txt exceeds safety limit");
  }

  const groups = robotsGroups(content);
  const named = groups.filter(g =>
    g.agents.includes("helioexhibitorresearch")
  );
  const applicable = named.length
    ? named
    : groups.filter(g => g.agents.includes("*"));

  const rules = applicable.flatMap(g => g.rules);
  let bestLength = -1;
  let permitted = true;

  for (const rule of rules) {
    if (!rule.path) continue;
    const path = rule.path.split(/[?$*]/)[0];
    if (!path || !url.pathname.startsWith(path)) continue;

    if (
      path.length > bestLength ||
      (path.length === bestLength && rule.type === "allow")
    ) {
      bestLength = path.length;
      permitted = rule.type === "allow";
    }
  }

  if (!permitted) {
    throw Error("Profile access is disallowed by robots.txt");
  }
}

async function fetchProfile(initial: URL) {
  let current = initial;

  for (let i = 0; i < 4; i++) {
    if (!approved(current.href)) {
      throw Error("Profile host is not approved");
    }

    await checkRobots(current);

    const response = await fetch(current, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent": "HELIOExhibitorResearch/1.0",
        Accept: "text/html"
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

    if (!response.ok) {
      throw Error(`Profile returned HTTP ${response.status}`);
    }

    if (!(response.headers.get("content-type") || "").includes("text/html")) {
      throw Error("Profile did not return HTML");
    }

    if (Number(response.headers.get("content-length") || 0) > MAX_PROFILE_BYTES) {
      throw Error("Profile page exceeds size limit");
    }

    const reader = response.body?.getReader();
    if (!reader) throw Error("Empty profile response");

    const chunks: Buffer[] = [];
    let total = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        total += value.byteLength;
        if (total > MAX_PROFILE_BYTES) {
          throw Error("Profile page exceeds size limit");
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel().catch(() => {});
    }

    return {
      html: Buffer.concat(chunks).toString("utf8"),
      source: current.href
    };
  }

  throw Error("Too many redirects");
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

    const { data: { user }, error: authError } =
      await db.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const exhibitionId = body?.exhibitionId;
    const profileUrl = body?.profileUrl;

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
      .select("id,name,edition_year,directory_url")
      .eq("id", exhibitionId)
      .eq("owner_id", user.id)
      .single();

    if (error || !exhibition) {
      return NextResponse.json(
        { error: "Exhibition not found" },
        { status: 404 }
      );
    }

    const directory = approved(exhibition.directory_url || "");
    const profile = typeof profileUrl === "string"
      ? approved(profileUrl)
      : null;

    if (!directory || !profile) {
      return NextResponse.json(
        { error: "Approved directory and profile URLs are required" },
        { status: 400 }
      );
    }

    const hr2026 = /hr summit|hrse/i.test(exhibition.name || "") &&
      Number(exhibition.edition_year) === 2026;
    const officialHrOrigin = "https://informaconnect.com";
    const hrProfile = hr2026 &&
      profile.origin === officialHrOrigin &&
      profile.pathname.startsWith("/hr-summit-expo/sponsors/") &&
      profile.pathname.split("/").filter(Boolean).length === 3;
    const standardProfile = directory.origin === profile.origin &&
      profile.pathname.startsWith("/exhibitors/");

    if (!standardProfile && !hrProfile) {
      return NextResponse.json(
        { error: "Profile does not belong to the approved exhibition source" },
        { status: 400 }
      );
    }

    const page = await fetchProfile(profile);
    const result = hrProfile ? parseHrSummitProfile(page.html, page.source) : parseProfile(page.html, page.source);

    return NextResponse.json({
      profile: result,
      notice: "Unverified profile details for manual review. Nothing was saved."
    });

  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "Profile enrichment failed"
      },
      { status: 422 }
    );
  }
}
