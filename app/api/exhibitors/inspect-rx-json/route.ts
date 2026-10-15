import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "../../../../lib/api-auth";

export const runtime = "nodejs";

// Read-only inspection of a browser-captured public RX Global response.
// This is NOT an exhibitor-directory crawler or an import endpoint.
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApi(request);
    if (!auth.ok) return NextResponse.json({error:auth.error,code:auth.code},{status:auth.status});
    const {db,user} = auth;
    const body = await request.json();
    if (typeof body?.exhibitionId !== "string" || typeof body?.rawJson !== "string" || body.rawJson.length > 1500000) {
      return NextResponse.json({error:"An exhibition ID and JSON response (up to 1.5 MB) are required."}, {status:400});
    }
    const {data: exhibition} = await db.from("exhibitions").select("id,name,edition_year").eq("id",body.exhibitionId).eq("owner_id",user.id).single();
    if (!exhibition) return NextResponse.json({error:"Exhibition not found"}, {status:404});
    let parsed: any;
    try { parsed = JSON.parse(body.rawJson); } catch { return NextResponse.json({error:"Invalid JSON"}, {status:400}); }
    const organisation = parsed?.data?.exhibitingOrganisation;
    if (!organisation || typeof organisation.companyName !== "string" || typeof organisation.eventEditionId !== "string") {
      return NextResponse.json({error:"This is not an RX exhibitingOrganisation response. No exhibitor imported."}, {status:422});
    }
    const products = Array.isArray(organisation.products) ? organisation.products : [];
    const displayName = Array.isArray(organisation.multilingual) ?
      organisation.multilingual.find((x:any)=>x?.locale?.toLowerCase()==="en-gb")?.displayName : undefined;
    const knownEditionId = "eve-14c3658b-f854-4550-81a6-7bdca68b6ce7";
    const editionEvidence = organisation.eventEditionId === knownEditionId ? "AIRS-26 (from separately observed RX edition metadata; dates not independently verified)" : "Unknown edition";
    return NextResponse.json({
      source:"User-provided RX Global GraphQL response",
      exhibition:{name:exhibition.name,year:exhibition.edition_year},
      organisation:{companyName:organisation.companyName,displayName:displayName||null,organisationId:organisation.organisationId||null,eventEditionId:organisation.eventEditionId},
      editionEvidence,
      productCount:products.length,
      products:products.slice(0,150).map((p:any)=>({id:p.id||null,title:Array.isArray(p.multilingual)?(p.multilingual.find((x:any)=>x?.locale?.toLowerCase()==="en-gb")?.title||null):null,isPublished:p.isPublished===true})),
      canImport:false,
      warning:"A single organisation response does not verify a full directory or the event dates. Do not count products as exhibitors. No records were saved."
    });
  } catch { return NextResponse.json({error:"Unable to inspect RX response"}, {status:422}); }
}
