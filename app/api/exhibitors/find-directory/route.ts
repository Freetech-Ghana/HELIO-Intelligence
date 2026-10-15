import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "../../../../lib/api-auth";

export const runtime = "nodejs";

// Source discovery is separate from authorization to crawl or import.
// Search suggestions are NOT evidence that a directory belongs to the edition.
export async function POST(request:NextRequest) {
  const auth=await authenticateApi(request);
  if (!auth.ok) return NextResponse.json({error:auth.error,code:auth.code},{status:auth.status});
  const body=await request.json().catch(()=>null);
  const id=body?.exhibitionId;
  if (typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({error:"Invalid exhibition ID"},{status:400});
  const {data,error}=await auth.db.from("exhibitions").select("name,edition_year,directory_url").eq("id",id).eq("owner_id",auth.user.id).single();
  if(error||!data) return NextResponse.json({error:"Exhibition not found"},{status:404});
  const name=String(data.name||"").trim();
  const year=Number(data.edition_year);
  if(!name||!Number.isInteger(year)||year<2000||year>2100) return NextResponse.json({error:"Exhibition name or year is missing"},{status:422});
  const queries=[
    name+" "+year+" official exhibitor directory",
    name+" "+year+" exhibitor directory floorplan",
    name+" "+year+" exhibitors sponsors directory"
  ];
  const searchLinks=queries.map(query=>({query,url:"https://www.google.com/search?q="+encodeURIComponent(query)}));
  return NextResponse.json({
    exhibition:name,editionYear:year,savedDirectoryUrl:data.directory_url||null,
    searchLinks,status:"source_candidates_require_review",
    notice:"These are search links, not automatically verified directories. Confirm the official domain, exhibitor edition and permission before authorizing any reader or import."
  });
}
