import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "../../../../lib/api-auth";
import { getRxSource } from "../../../../lib/rx-source-registry";
export const runtime="nodejs";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request:NextRequest) {
  try {
    const auth=await authenticateApi(request);
    if (!auth.ok) return NextResponse.json({error:auth.error},{status:auth.status});
    const body=await request.json();
    if (typeof body?.exhibitionId!=="string" || !uuid.test(body.exhibitionId)) return NextResponse.json({error:"Invalid exhibition ID"},{status:400});
    const {data:exhibition}=await auth.db.from("exhibitions").select("id,name,edition_year,directory_url").eq("id",body.exhibitionId).eq("owner_id",auth.user.id).single();
    if (!exhibition) return NextResponse.json({error:"Exhibition not found"},{status:404});
    let source;
    try { source=getRxSource(exhibition.id); }
    catch { source=null; }
    let host="";
    try {host=new URL(exhibition.directory_url).hostname.toLowerCase();}catch{}
    const rx=/^(?:www\.)?theairportshow\.com$/.test(host) || Boolean(source);
    const verified=Boolean(source && source.year===Number(exhibition.edition_year) && source.directoryHost.toLowerCase()===host);
    const airport2027=/^(?:www\.)?theairportshow\.com$/.test(host) && Number(exhibition.edition_year)===2027;
    return NextResponse.json({
      exhibition:exhibition.name,selectedYear:Number(exhibition.edition_year),
      platform:rx?"rx_global":"other",
      status:verified?"verified_source_configured":airport2027?"awaiting_2027_data":"source_not_verified",
      label:verified?"Edition-specific source configured":airport2027?"Awaiting verified 2027 exhibitor data":"Source and edition verification required",
      canAutomaticallyRead:verified,canImport:false,
      sourceEditionId:verified?source!.edition:null,
      evidenceUrl:verified?source!.evidenceUrl:null,
      note:airport2027&&!verified
        ?"The publicly displayed directory has been observed showing 2026 exhibitors. Do not treat them as 2027 participants. No live source has been independently verified for 2027."
        :"This status checks saved source configuration, not whether the live directory content currently matches the selected edition. Manual verification remains required."
    });
  } catch(e) {return NextResponse.json({error:e instanceof Error?e.message:"Edition status failed"},{status:422});}
}
