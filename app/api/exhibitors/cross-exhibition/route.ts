import {NextRequest,NextResponse} from "next/server";
import {authenticateApi} from "../../../../lib/api-auth";
export const runtime="nodejs";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Candidate={id:string;exhibition_id:string;company_name:string;website:string|null;profile_url:string;hall:string|null;stand_number:string|null};
const normalize=(v:string)=>v.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
function domain(raw:string|null){if(!raw)return null;try{const u=new URL(raw);const h=u.hostname.toLowerCase().replace(/^www\./,"");return ["http:","https:"].includes(u.protocol)&&h.includes(".")?h:null;}catch{return null;}}
export async function GET(request:NextRequest){
 const auth=await authenticateApi(request);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const exhibitionId=new URL(request.url).searchParams.get("exhibitionId");
 if(!exhibitionId||!uuid.test(exhibitionId))return NextResponse.json({error:"Invalid exhibition ID"},{status:400});
 const {data:target,error:te}=await auth.db.from("exhibitions").select("id,name,edition_year").eq("id",exhibitionId).eq("owner_id",auth.user.id).maybeSingle();
 if(te||!target)return NextResponse.json({error:"Exhibition not found"},{status:404});
 const {data:exhibitions,error:ee}=await auth.db.from("exhibitions").select("id,name,edition_year").eq("owner_id",auth.user.id).limit(1000);
 if(ee)return NextResponse.json({error:ee.message},{status:500});
 const all:Candidate[]=[];let truncated=false;
 for(let offset=0;offset<10000;offset+=1000){
  const {data,error}=await auth.db.from("helio_exhibitor_candidates").select("id,exhibition_id,company_name,website,profile_url,hall,stand_number").eq("owner_id",auth.user.id).order("id",{ascending:true}).range(offset,offset+999);
  if(error)return NextResponse.json({error:error.message},{status:500});
  all.push(...((data||[]) as Candidate[]));if((data||[]).length<1000)break;if(offset===9000)truncated=true;
 }
 const meta=new Map((exhibitions||[]).map(e=>[e.id,e]));
 const byName=new Map<string,Candidate[]>(),byDomain=new Map<string,Candidate[]>();
 for(const x of all){const n=normalize(x.company_name);if(n)byName.set(n,[...(byName.get(n)||[]),x]);const d=domain(x.website);if(d)byDomain.set(d,[...(byDomain.get(d)||[]),x]);}
 const matches=all.filter(x=>x.exhibition_id===exhibitionId).map(x=>{
  const nameMatches=byName.get(normalize(x.company_name))||[];
  const d=domain(x.website);const domainMatches=d?(byDomain.get(d)||[]):[];
  const other=new Map<string,{candidate:Candidate;reasons:string[]}>();
  for(const y of nameMatches){if(y.exhibition_id!==exhibitionId)other.set(y.id,{candidate:y,reasons:["Exact normalized company name"]});}
  for(const y of domainMatches){if(y.exhibition_id===exhibitionId)continue;const prior=other.get(y.id);if(prior)prior.reasons.push("Same listed website hostname");else other.set(y.id,{candidate:y,reasons:["Same listed website hostname"]});}
  return {id:x.id,company_name:x.company_name,profile_url:x.profile_url,other_exhibitions:[...other.values()].map(({candidate:y,reasons})=>({company_name:y.company_name,exhibition_id:y.exhibition_id,exhibition_name:meta.get(y.exhibition_id)?.name||"Exhibition",edition_year:meta.get(y.exhibition_id)?.edition_year||null,hall:y.hall,stand_number:y.stand_number,profile_url:y.profile_url,reasons})),review_required:true};
 }).filter(x=>x.other_exhibitions.length>0);
 return NextResponse.json({exhibitionId,compared_candidates:all.length,limited:truncated,matches,notice:"Possible matches only. No companies have been merged or verified. Comparisons currently cover staged candidate profiles."});
}
