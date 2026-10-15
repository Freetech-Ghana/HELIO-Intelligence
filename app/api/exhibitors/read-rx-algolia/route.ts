import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "../../../../lib/api-auth";
import { inspectDirectoryJson } from "../../../../lib/exhibition-directory-adapters";
import { getRxSource } from "../../../../lib/rx-source-registry";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGES = 20;
const PAGE_SIZE = 100;
// This adapter is opt-in: use only a search index and public search credentials
// supplied by the directory owner or authorized for this integration.
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApi(request);
    if (!auth.ok) return NextResponse.json({error:auth.error,code:auth.code},{status:auth.status});
    const {db,user} = auth;
    const body = await request.json();
    if (typeof body?.exhibitionId !== "string" || !UUID.test(body.exhibitionId)) return NextResponse.json({error:"Invalid exhibition ID"},{status:400});
    const {data:exhibition} = await db.from("exhibitions").select("id,name,edition_year,directory_url").eq("id",body.exhibitionId).eq("owner_id",user.id).single();
    if (!exhibition) return NextResponse.json({error:"Exhibition not found"},{status:404});
    let configured;
    try { configured=getRxSource(body.exhibitionId); }
    catch(e) {
      return NextResponse.json({error:e instanceof Error?e.message:"RX source verification failed",code:"edition_not_verified",canImport:false},{status:409});
    }
    if (!configured) {
      return NextResponse.json({
        error:"No verified RX source is mapped to this exhibition. Configure an authorized index and independently verified edition before automatic reading.",
        code:"adapter_not_configured",canImport:false
      },{status:409});
    }
    let directory:URL;
    try {directory=new URL(exhibition.directory_url);} catch {return NextResponse.json({error:"Missing saved directory URL"},{status:400});}
    if (directory.protocol !== "https:" || directory.hostname.toLowerCase() !== configured.directoryHost.toLowerCase() || directory.username || directory.password || directory.port) {
      return NextResponse.json({error:"Selected exhibition does not match the configured official directory host"},{status:409});
    }
    if (Number(exhibition.edition_year) !== configured.year) {
      return NextResponse.json({error:"Edition mismatch: configured RX source year does not match the selected HELIO exhibition. Nothing imported.",canImport:false},{status:409});
    }
    const endpoint = "https://" + configured.app.toLowerCase() + "-dsn.algolia.net/1/indexes/" + encodeURIComponent(configured.index) + "/query";
    const pages: unknown[] = [];
    let totalPages = 1;
    let totalHits: number | null = null;
    for (let page=0;page<Math.min(totalPages,MAX_PAGES);page++) {
      const params = new URLSearchParams({
        query:"",page:String(page),hitsPerPage:String(PAGE_SIZE),
        filters:"recordType:exhibitor AND locale:en-gb AND eventEditionId:"+configured.edition
      });
      const response = await fetch(endpoint,{
        method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12000),
        headers:{"Content-Type":"application/json","X-Algolia-Application-Id":configured.app,"X-Algolia-API-Key":configured.key},
        body:JSON.stringify({params:params.toString()})
      });
      if (!response.ok) return NextResponse.json({error:"Directory search returned HTTP "+response.status,canImport:false},{status:502});
      const size=Number(response.headers.get("content-length")||0);
      if (size>4_000_000) return NextResponse.json({error:"Directory page exceeds response size limit"},{status:413});
      const raw=await response.text();
      if (raw.length>4_000_000) return NextResponse.json({error:"Directory page exceeds response size limit"},{status:413});
      const data=JSON.parse(raw);
      if (!Array.isArray(data.hits) || data.page!==page || !Number.isInteger(data.nbPages) || data.nbPages<1) throw Error("Invalid directory pagination response");
      if (page===0) {totalPages=data.nbPages;totalHits=typeof data.nbHits==="number"?data.nbHits:null;}
      if (data.nbPages!==totalPages || data.nbHits!==totalHits) throw Error("Directory changed during pagination; retry later");
      if (data.hits.some((h:unknown)=>{const x=h as Record<string,unknown>;return x.recordType!=="exhibitor" || x.eventEditionId!==configured.edition;})) throw Error("Directory returned an unexpected record or edition");
      pages.push(data);
    }
    const review=inspectDirectoryJson(pages);
    const complete=totalPages<=MAX_PAGES && review.reported_total===review.companies.length && review.edition_ids.length===1 && review.edition_ids[0]===configured.edition;
    return NextResponse.json({
      ...review, source:directory.origin, sourceYear:configured.year, fetchedPages:pages.length,
      complete, canImport:false, editionEvidenceUrl:configured.evidenceUrl,
      warnings:[...review.warnings,...(!complete?["Automatic retrieval is incomplete or inconsistent; review manually."]:[])],
      notice:"Read-only preview. No exhibitors were saved to Supabase."
    });
  } catch(e) {
    return NextResponse.json({error:e instanceof Error?e.message:"Automatic directory read failed",canImport:false},{status:422});
  }
}
