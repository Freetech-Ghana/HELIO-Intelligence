"use client";
import {useMemo,useState} from "react";
import {db} from "../lib/db";
type Candidate={company_name:string;profile_url:string;website?:string|null;country?:string|null;hall?:string|null;stand_number?:string|null;company_description?:string|null;details_status?:string;verification_status?:string};
const norm=(s:string)=>s.normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
export default function CompanyReviewCentre({exhibitionId}:{exhibitionId:string}){
 const [records,setRecords]=useState<Candidate[]>([]);
 const [stored,setStored]=useState<(Candidate&{id:string;review_decision:string})[]>([]);
 const [jobs,setJobs]=useState<{id:string;status:string;profiles_found:number;coverage_status:string}[]>([]);
 const [busy,setBusy]=useState(false);
 async function request(method:"GET"|"POST"|"PATCH",payload?:unknown){const {data:{session}}=await db().auth.getSession();if(!session)throw Error("Sign in first");const response=await fetch("/api/exhibitors/crawl-jobs"+(method==="GET"?"?exhibitionId="+encodeURIComponent(exhibitionId):""),{method,headers:{Authorization:"Bearer "+session.access_token,...(method==="GET"?{}:{"Content-Type":"application/json"})},...(method==="GET"?{}:{body:JSON.stringify(payload)})});const result=await response.json();if(!response.ok)throw Error(result.error||"Request failed");return result;}
 async function refresh(){setBusy(true);setError("");try{const r=await request("GET");setStored(r.candidates||[]);setJobs(r.jobs||[]);}catch(e){setError(e instanceof Error?e.message:"Unable to load saved candidates");}finally{setBusy(false);}}
 async function queue(){setBusy(true);setError("");try{await request("POST",{exhibitionId});await refresh();}catch(e){setError(e instanceof Error?e.message:"Could not queue job");}finally{setBusy(false);}}
 async function decide(id:string,decision:string){try{await request("PATCH",{id,decision});setStored(prev=>prev.map(x=>x.id===id?{...x,review_decision:decision}:x));}catch(e){setError(e instanceof Error?e.message:"Review update failed");}}

 const [error,setError]=useState("");
 const [search,setSearch]=useState("");
 const [mode,setMode]=useState("all");
 const [decisions,setDecisions]=useState<Record<string,string>>({});
 async function load(file:File|undefined){
  setError("");setRecords([]);setDecisions({});
  if(!file)return;
  if(file.size>20_000_000){setError("File exceeds 20 MB.");return;}
  try{
   const raw=JSON.parse(await file.text());
   if(!Array.isArray(raw.candidates)||raw.candidates.length>20000)throw Error("Expected crawler JSON with a candidates array (maximum 20,000).");
   const parsed:Candidate[]=raw.candidates.map((x:unknown)=>{
    if(!x||typeof x!=="object")throw Error("Invalid candidate");
    const v=x as Record<string,unknown>;
    if(typeof v.company_name!=="string"||typeof v.profile_url!=="string")throw Error("Missing company or profile URL");
    const url=new URL(v.profile_url);
    if(url.protocol!=="https:")throw Error("Only HTTPS profile URLs accepted");
    const str=(k:string)=>typeof v[k]==="string"?(v[k] as string).slice(0,3000):null;
    return {company_name:v.company_name.slice(0,250),profile_url:url.href,website:str("website"),country:str("country"),hall:str("hall"),stand_number:str("stand_number"),company_description:str("company_description"),details_status:str("details_status"),verification_status:str("verification_status")};
   });
   setRecords(parsed);
  }catch(e){setError(e instanceof Error?e.message:"Invalid JSON");}
 }
 const groups=useMemo(()=>{const m=new Map<string,Candidate[]>();for(const r of records){const k=norm(r.company_name);m.set(k,[...(m.get(k)||[]),r]);}return [...m.entries()].map(([key,items])=>({key,items}));},[records]);
 const repeated=groups.filter(g=>g.items.length>1);
 const shown=groups.filter(g=>(mode!=="repeated"||g.items.length>1)&&(mode!=="missing"||g.items.some(x=>!x.country||!x.hall||!x.stand_number))&&g.items.some(x=>[x.company_name,x.country,x.hall,x.stand_number].some(v=>norm(v||"").includes(norm(search)))));
 function exportReview(){
  const rows=records.map(r=>({company_name:r.company_name,profile_url:r.profile_url,stand:r.stand_number||"",hall:r.hall||"",country:r.country||"",decision:decisions[r.profile_url]||"pending",verification_status:"unverified"}));
  const blob=new Blob([JSON.stringify({review_only:true,records:rows},null,2)],{type:"application/json"});
  const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download="HELIO_company_review_decisions.json";a.click();URL.revokeObjectURL(u);
 }
 return <section style={{border:"1px solid #ddd",borderRadius:8,padding:14,marginTop:14}}>
  <h3>Company Review Centre — local review only</h3>
  <p>Upload the crawler's exhibitor-candidates-review.json. Company names are grouped for inspection; each exhibitor profile and stand remains separate. No automatic merging, verification, or database import.</p>
  <div style={{padding:10,border:"1px solid #ddd",borderRadius:6,marginBottom:12}}><strong>Supabase crawler staging</strong><p>Queued jobs require a separately running crawler worker. Results appear here after the worker submits them; CRM import remains disabled.</p><button type="button" disabled={busy||!exhibitionId} onClick={()=>void queue()}>Queue exhibitor discovery</button> <button type="button" disabled={busy||!exhibitionId} onClick={()=>void refresh()}>Refresh saved candidates</button>{jobs.map(j=><p key={j.id}>Job {j.id} — {j.status} · {j.profiles_found} stored · {j.coverage_status}</p>)}<p>{stored.length} saved candidate profiles</p><div style={{maxHeight:350,overflow:"auto"}}>{stored.map(x=><div key={x.id} style={{padding:5,borderBottom:"1px solid #eee"}}><a href={x.profile_url} target="_blank" rel="noopener noreferrer">{x.company_name}</a> — {x.hall||"Hall unknown"} / {x.stand_number||"Stand unknown"} <select aria-label={"Review saved "+x.company_name} value={x.review_decision} onChange={e=>void decide(x.id,e.target.value)}><option value="pending">Pending</option><option value="keep_separate">Keep separate</option><option value="group_company">Group company</option><option value="reject">Reject</option></select></div>)}</div></div>
  <input type="file" accept=".json,application/json" aria-label="Choose crawler candidate JSON" onChange={e=>void load(e.target.files?.[0])}/>
  {error&&<p role="alert" style={{color:"#b42318"}}>{error}</p>}
  {records.length>0&&<div>
   <p><strong>{records.length}</strong> profiles · <strong>{groups.length}</strong> name groups · <strong>{repeated.length}</strong> repeated-name groups · <strong>{records.filter(r=>!r.country||!r.hall||!r.stand_number).length}</strong> missing location</p>
   <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search company, hall, stand, country" aria-label="Search companies"/>
   <select aria-label="Filter company groups" value={mode} onChange={e=>setMode(e.target.value)}><option value="all">All companies</option><option value="repeated">Repeated names</option><option value="missing">Missing location</option></select>
   <button type="button" onClick={exportReview}>Export review decisions JSON</button>
   <div style={{maxHeight:520,overflow:"auto",marginTop:12}}>
   {shown.map(g=><details key={g.key} style={{borderBottom:"1px solid #ddd",padding:"8px 0"}}>
    <summary style={{cursor:"pointer"}}><strong>{g.items[0].company_name}</strong> — {g.items.length} profile{g.items.length===1?"":"s"} {g.items.length>1?"· review repeated name":""}</summary>
    <table style={{width:"100%",fontSize:12}}><thead><tr><th>Stand</th><th>Hall</th><th>Country</th><th>Profile</th><th>Review decision</th></tr></thead><tbody>{g.items.map(r=><tr key={r.profile_url}><td>{r.stand_number||"Unknown"}</td><td>{r.hall||"Unknown"}</td><td>{r.country||"Unknown"}</td><td><a href={r.profile_url} target="_blank" rel="noopener noreferrer">Official profile</a></td><td><select aria-label={"Review "+r.company_name+" "+r.profile_url} value={decisions[r.profile_url]||"pending"} onChange={e=>setDecisions(prev=>({...prev,[r.profile_url]:e.target.value}))}><option value="pending">Pending</option><option value="keep_separate">Keep separate</option><option value="group_company">Group company (retain profiles)</option><option value="reject">Reject candidate</option></select></td></tr>)}</tbody></table>
   </details>)}
   </div>
   <p>Decisions are kept in this browser view until exported. Export is not an approval to import into the CRM.</p>
  </div>}
 </section>;
}
