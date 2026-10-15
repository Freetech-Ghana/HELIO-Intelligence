
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ApprovedExhibitor = {
  company_name: string;
  country?: string;
  description?: string;
  website?: string;
  hall?: string;
  stand?: string;
  profile_url: string;
};

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!token || !supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const db = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: { Authorization: `Bearer ${token}` }
      }
    });

    const {
      data: { user },
      error: authError
    } = await db.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const exhibitionId = body?.exhibitionId;
    const exhibitors = body?.exhibitors;

    if (
      typeof exhibitionId !== "string" ||
      !UUID.test(exhibitionId)
    ) {
      return NextResponse.json(
        { error: "Invalid exhibition ID" },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(exhibitors) ||
      exhibitors.length < 1 ||
      exhibitors.length > 50
    ) {
      return NextResponse.json(
        { error: "Select between 1 and 50 exhibitors" },
        { status: 400 }
      );
    }

    const { data: exhibition, error: exhibitionError } =
      await db
        .from("exhibitions")
        .select("id,name,edition_year,directory_url")
        .eq("id", exhibitionId)
        .eq("owner_id", user.id)
        .single();

    if (exhibitionError || !exhibition) {
      return NextResponse.json(
        { error: "Exhibition not found" },
        { status: 404 }
      );
    }

    let directory: URL;

    try {
      directory = new URL(exhibition.directory_url);
      if (directory.protocol !== "https:") {
        throw new Error("HTTPS required");
      }
    } catch {
      return NextResponse.json(
        { error: "Valid saved directory URL required" },
        { status: 400 }
      );
    }

    // RX reuses its public Airport Show directory URL across editions.
    // The current page identifies 2027; an archived 2026 source must be used
    // for 2026 records. Fail closed rather than mixing event editions.
    if (/^(?:www\\.)?theairportshow\\.com$/i.test(directory.hostname) &&
        /\\/en-gb\\/exhibitor-directory\\.html$/i.test(directory.pathname) &&
        Number(exhibition.edition_year) === 2026) {
      return NextResponse.json({
        error: "The live Airport Show directory currently identifies the 2027 edition. Use a verified 2026 archive before importing into Airport Show 2026."
      }, { status: 409 });
    }

    const prepared: ApprovedExhibitor[] = [];
    const seen = new Set<string>();

    for (const item of exhibitors) {
      const company_name = text(item?.company_name, 250);
      const profile_url = text(item?.profile_url, 2000);

      if (!company_name || !profile_url) {
        return NextResponse.json(
          { error: "Company name and profile URL required" },
          { status: 400 }
        );
      }

      let profile: URL;

      try {
        profile = new URL(profile_url);

        if (
          profile.protocol !== "https:" ||
          profile.origin !== directory.origin ||
          !(
            /^\\/exhibitors?\\/[^/]+/i.test(profile.pathname) ||
            /^\\/en-gb\\/exhibitor-details(?:\\.|\\/)[^/]+/i.test(profile.pathname) ||
            /^\\/en\\/sites\\/exhibitors\\/[^/]+/i.test(profile.pathname) ||
            /^\\/hr-summit-expo\\/sponsors\\/[^/]+/i.test(profile.pathname)
          ) ||
          profile.username ||
          profile.password
        ) {
          throw new Error("Invalid profile URL");
        }
      } catch {
        return NextResponse.json(
          { error: `Invalid profile URL for ${company_name}` },
          { status: 400 }
        );
      }

      const key = company_name.toLowerCase();

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      prepared.push({
        company_name,
        profile_url: profile.href,
        country: text(item.country, 150),
        description: text(item.description, 10000),
        website: text(item.website, 2000),
        hall: text(item.hall, 150),
        stand: text(item.stand, 150)
      });
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const item of prepared) {
      const { error } = await db.from("exhibitors").insert({
        owner_id: user.id,
        exhibition_id: exhibitionId,
        ...item,
        verification_status: "directory_only",
        participation_status: "directory_listing",
        date_checked: new Date().toISOString().slice(0, 10)
      });

      if (!error) {
        imported++;
      } else if (error.code === "23505") {
        skipped++;
      } else {
        errors.push(`${item.company_name}: ${error.message}`);
      }
    }

    return NextResponse.json({
      imported,
      skipped,
      errors,
      notice:
        "Only approved directory listings were imported. Participation is not confirmed."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Import failed"
      },
      { status: 422 }
    );
  }
}
