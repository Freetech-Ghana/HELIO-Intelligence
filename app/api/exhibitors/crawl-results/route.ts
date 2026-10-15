import {NextRequest,NextResponse} from "next/server";
import {authenticateApi} from "../../../../lib/api-auth";
export const runtime="nodejs";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const s=(v:unknown,n=3000)=>typeof v==="string"?v.trim().slice(0,n):"";
export async function POST(request:NextRequest){
 const auth=await authenticateApi(request);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const body=await request.json().catch(()=>null);
 if(!body||!uuid.test(body.jobId||"")||!Array.isArray(body.candidates)||body.candidates.length>50)return NextResponse.json({error:"Expected jobId and up to 50 candidates"},{status:400});
 const {data:job,error:je}=await auth.db.from("helio_exhibitor_crawl_jobs").select("id,exhibition_id,directory_url,status").eq("id",body.jobId).eq("owner_id",auth.user.id).single();
 if(je||!job)return NextResponse.json({error:"Job not found"},{status:404});
 if(!["queued","running","partial"].includes(job.status))return NextResponse.json({error:"Job is not accepting candidates"},{status:409});
 const base=new URL(job.directory_url);
 const rows=[];
 for(const x of body.candidates){
  const company=s(x.company_name,250),profile=s(x.profile_url,2000);
  if(!company||!profile)return NextResponse.json({error:"Company name and profile URL required"},{status:400});
  let u:URL;try{u=new URL(profile);if(u.protocol!=="https:"||u.origin!==base.origin||u.username||u.password||u.port)throw Error();}catch{return NextResponse.json({error:"Profile URL must match saved directory origin"},{status:400});}
  rows.push({owner_id:auth.user.id,exhibition_id:job.exhibition_id,crawl_job_id:job.id,company_name:company,company_name_normalized:company.normalize("NFKC").replace(/\s+/g," ").toLowerCase(),profile_url:u.origin+u.pathname,country:s(x.country,150)||null,hall:s(x.hall,150)||null,stand_number:s(x.stand_number,150)||null,website:s(x.website,2000)||null,company_description:s(x.company_description,10000)||null,source_page:s(x.source_page,2000)||null,verification_status:"unverified"});
 }
 if(rows.length){
  const {error}=await auth.db.from("helio_exhibitor_candidates").upsert(rows,{onConflict:"owner_id,exhibition_id,profile_url",ignoreDuplicates:true});
  if(error)return NextResponse.json({error:error.message},{status:500});
 }
 const {count,error:ce}=await auth.db.from("helio_exhibitor_candidates").select("id",{count:"exact",head:true}).eq("owner_id",auth.user.id).eq("exhibition_id",job.exhibition_id);
 if(ce)return NextResponse.json({error:ce.message},{status:500});
 const nextStatus=body.finished===true?"partial":"running";
 const {error:ue}=await auth.db.from("helio_exhibitor_crawl_jobs").update({status:nextStatus,profiles_found:count||0,coverage_status:"partial_unverified",edition_verified:false,...(body.finished===true?{finished_at:new Date().toISOString()}:{started_at:new Date().toISOString()})}).eq("id",job.id).eq("owner_id",auth.user.id);
 if(ue)return NextResponse.json({error:ue.message},{status:500});
 return NextResponse.json({accepted:rows.length,stored:count,status:nextStatus,edition_verified:false});
}
