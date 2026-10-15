import {NextRequest,NextResponse} from "next/server";
import {authenticateApi} from "../../../../lib/api-auth";
export const runtime="nodejs";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request:NextRequest){
 const auth=await authenticateApi(request);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const exhibitionId=new URL(request.url).searchParams.get("exhibitionId");
 if(!exhibitionId||!uuid.test(exhibitionId))return NextResponse.json({error:"Invalid exhibition ID"},{status:400});
 const {data:jobs,error:je}=await auth.db.from("helio_exhibitor_crawl_jobs").select("id,status,coverage_status,edition_verified,profiles_found,created_at,error_message").eq("owner_id",auth.user.id).eq("exhibition_id",exhibitionId).order("created_at",{ascending:false}).limit(10);
 if(je)return NextResponse.json({error:je.message},{status:500});
 const {data:candidates,error:ce}=await auth.db.from("helio_exhibitor_candidates").select("id,company_name,profile_url,stand_number,hall,country,website,company_description,review_decision,verification_status").eq("owner_id",auth.user.id).eq("exhibition_id",exhibitionId).order("company_name",{ascending:true}).limit(10000);
 if(ce)return NextResponse.json({error:ce.message},{status:500});
 return NextResponse.json({jobs,candidates});
}
export async function POST(request:NextRequest){
 const auth=await authenticateApi(request);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const body=await request.json().catch(()=>null);
 if(!body||!uuid.test(body.exhibitionId||""))return NextResponse.json({error:"Invalid exhibition ID"},{status:400});
 const {data:event,error:e}=await auth.db.from("exhibitions").select("id,directory_url").eq("id",body.exhibitionId).eq("owner_id",auth.user.id).single();
 if(e||!event?.directory_url)return NextResponse.json({error:"Save an official directory URL for this exhibition first."},{status:400});
 let url:URL;try{url=new URL(event.directory_url);if(url.protocol!=="https:"||url.username||url.password||url.port)throw Error();}catch{return NextResponse.json({error:"Valid HTTPS directory required"},{status:400});}
 const {data:job,error}=await auth.db.from("helio_exhibitor_crawl_jobs").insert({owner_id:auth.user.id,exhibition_id:event.id,directory_url:url.href,status:"queued"}).select("id,status").single();
 if(error)return NextResponse.json({error:error.message},{status:500});
 return NextResponse.json({job,notice:"Job queued. A configured crawler worker must pick up the job; queueing alone does not run the crawler."});
}
export async function PATCH(request:NextRequest){
 const auth=await authenticateApi(request);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const body=await request.json().catch(()=>null);
 if(!body||!uuid.test(body.id||"")||!["pending","keep_separate","group_company","reject","approved"].includes(body.decision))return NextResponse.json({error:"Invalid decision"},{status:400});
 if(body.decision==="approved")return NextResponse.json({error:"CRM approval is not enabled until edition verification is complete."},{status:409});
 const {data,error}=await auth.db.from("helio_exhibitor_candidates").update({review_decision:body.decision,updated_at:new Date().toISOString()}).eq("id",body.id).eq("owner_id",auth.user.id).select("id").maybeSingle();
 if(error||!data)return NextResponse.json({error:error?.message||"Record not found"},{status:400});
 return NextResponse.json({ok:true});
}
