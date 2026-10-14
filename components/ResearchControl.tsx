'use client';
import {useEffect,useState} from 'react';
import {db} from '../lib/db';
type Event={id:string;name:string;edition_year:number;directory_url:string|null;directory_total:number|null;research_status?:string};
type Lead={id:string;company_name:string;verification_status:string;profile_url:string|null;email:string|null;phone:string|null;contact_source_url:string|null;notes:string|null;participation_status:string;outreach_opt_out?:boolean|null;
contact_research_status?:string;
contact_verified_at?:string|null;
contact_research_notes?:string|null;
website?:string|null;
marketing_approval_status?:string|null;
marketing_approval_notes?:string|null;
marketing_approved_at?:string|null;
marketing_evidence_type?:string|null;
};
type Run={id:string;status:string;cursor:string|null;pages_processed:number;profiles_processed:number;duplicates_removed:number;gaps:any;updated_at:string};
export default function ResearchControl({event,leads,onChanged}:{event:Event|null|undefined;leads:Lead[];onChanged:()=>Promise<void>}){
 const[url,setUrl]=useState(''),[total,setTotal]=useState(''),[runs,setRuns]=useState<Run[]>([]),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[edit,setEdit]=useState<string|null>(null),[draft,setDraft]=useState<any>({});
 useEffect(()=>{setUrl(event?.directory_url||'');setTotal(event?.directory_total==null?'':String(event.directory_total));setStatus('');setEdit(null);if(event)void loadRuns(event.id);else setRuns([])},[event?.id]);
 async function loadRuns(id:string){const{data,error}=await db().from('research_runs').select('*').eq('exhibition_id',id).order('created_at',{ascending:false}).limit(10);if(error)setStatus(error.message);else setRuns(data||[])}
 async function saveDirectory(){if(!event)return;setBusy(true);try{const{error}=await db().from('exhibitions').update({directory_url:url.trim()||null,directory_total:total.trim()?Number(total):null}).eq('id',event.id);if(error)throw error;setStatus('Directory settings saved. No automated research has been performed.');await onChanged()}catch(e:any){setStatus(e.message)}finally{setBusy(false)}}
 async function createRun(){if(!event)return;setBusy(true);try{const{error}=await db().from('research_runs').insert({exhibition_id:event.id,status:'queued',cursor:null});if(error)throw error;setStatus('Research job recorded as queued. A collector worker must be connected before it can run.');await loadRuns(event.id)}catch(e:any){setStatus(e.message)}finally{setBusy(false)}}
 async function updateRun(id:string,newStatus:string){if(!event)return;setBusy(true);try{const{error}=await db().from('research_runs').update({status:newStatus,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;await loadRuns(event.id);setStatus('Research job status updated.')}catch(e:any){setStatus(e.message)}finally{setBusy(false)}}
 async function saveLead(){if(!edit)return;

if(
 draft.contact_research_status==='verified' &&
 (
  !String(draft.email||'').trim() ||
  !String(draft.contact_source_url||'').trim()
 )
){
 setStatus('Contact verification requires an email address and contact source URL.');
 return;
}
if(
 draft.contact_research_status==='verified' &&
 !String(draft.contact_research_notes||'').trim()
){
 setStatus('Contact verification requires research notes explaining the evidence.');
 return;
}
if(draft.contact_research_status==='verified'){
 try{
  const source=new URL(String(draft.contact_source_url).trim());
  if(!['https:','http:'].includes(source.protocol)){
   throw new Error('Invalid protocol');
  }
 }catch{
  setStatus('Contact verification requires a valid HTTP or HTTPS source URL.');
  return;
 }
}
const approvalStatus =
 draft.marketing_approval_status || 'not_reviewed';

if(!['not_reviewed','rejected','approved'].includes(approvalStatus)){
 setStatus('Invalid marketing approval status.');
 return;
}

if(approvalStatus==='approved'){
 if(draft.contact_research_status!=='verified'){
  setStatus('Marketing approval requires a verified contact.');
  return;
 }

 if(draft.outreach_opt_out===true){
  setStatus('Cannot approve an exhibitor marked Do Not Contact.');
  return;
 }

 if(!String(draft.marketing_approval_notes||'').trim()){
  setStatus('Marketing approval requires documented evidence and a reviewed lawful basis.');
  return;
 }

 // Keep approval disabled until the separate evidence review is implemented.
 setStatus('Marketing approval is not enabled yet. Record evidence and complete the approval review first.');
 return;
}
setBusy(true);try{const fields=[
 'verification_status',
 'participation_status',
 'profile_url',
 'contact_source_url',
 'email',
 'phone',
 'notes',
 'website',
 'outreach_opt_out',
 'contact_research_status',
 'contact_research_notes',
 'marketing_approval_notes'
];;;const patch:any={};for(const k of fields)patch[k]=typeof draft[k]==='string'?(draft[k].trim()||null):draft[k];patch.verification_status=draft.verification_status;patch.participation_status=draft.participation_status;
if(draft.contact_research_status==='verified'){
  patch.contact_verified_at =
    draft.contact_research_status === 'verified' &&
    leads.find(l=>l.id===edit)?.contact_research_status === 'verified' &&
    leads.find(l=>l.id===edit)?.contact_verified_at
      ? leads.find(l=>l.id===edit)?.contact_verified_at
      : new Date().toISOString();
}else{
  patch.contact_verified_at=null;
}
patch.marketing_approval_status =
 draft.marketing_approval_status || 'not_reviewed';

patch.marketing_approved_at = null;
const{error}=await db().from('exhibitors').update(patch).eq('id',edit);if(error)throw error;setEdit(null);setStatus('Exhibitor review saved. Mark verified only after confirming source evidence.');await onChanged()}catch(e:any){setStatus(e.message)}finally{setBusy(false)}}
 if(!event)return <section className="panel"><h2>Research Control Centre</h2><p>Select an exhibition first.</p></section>;
 const withEmail=leads.filter(x=>!!x.email).length,verified=leads.filter(x=>x.verification_status==='verified').length,missing=event.directory_total==null?null:Math.max(0,event.directory_total-leads.length);
 return <section className="panel" id="research-control"><h2>Research Control Centre</h2><p><b>{event.name} ({event.edition_year})</b> — research configuration and human verification. No crawler is running in this release.</p>
 <div className="formgrid"><label>Official exhibitor directory URL<input type="url" placeholder="https://organiser.example/exhibitors" value={url} onChange={e=>setUrl(e.target.value)}/></label><label>Published exhibitor total<input type="number" min="0" value={total} onChange={e=>setTotal(e.target.value)}/></label><button disabled={busy} onClick={saveDirectory}>Save directory settings</button><button disabled={busy||!url.trim()} onClick={createRun}>+ Queue research job</button></div>
 <div className="coverage"><div><span>Saved exhibitors</span><strong>{leads.length}</strong></div><div><span>Published emails</span><strong>{withEmail}</strong></div><div><span>Reviewed / verified</span><strong>{verified}</strong></div><div><span>Uncollected vs total</span><strong>{missing??'Unknown'}</strong></div></div>
 <h3>Research job history</h3><div className="tablewrap"><table><thead><tr><th>Status</th><th>Pages</th><th>Profiles</th><th>Checkpoint</th><th>Action</th></tr></thead><tbody>{runs.map(r=><tr key={r.id}><td>{r.status}</td><td>{r.pages_processed}</td><td>{r.profiles_processed}</td><td>{r.cursor||'Not started'}</td><td>{['queued','paused'].includes(r.status)?<button disabled={busy} onClick={()=>updateRun(r.id,'paused')}>Mark paused</button>:'—'}</td></tr>)}{!runs.length&&<tr><td colSpan={5}>No research jobs created.</td></tr>}</tbody></table></div>
 <h3>Exhibitor verification</h3><p>Review the identity, published contact information and source URLs before marking a record verified.</p><div className="tablewrap"><table><thead><tr><th>Company</th><th>Review</th><th>Contact Research</th><th>Evidence</th><th>Action</th></tr></thead><tbody>{leads.map(l=><tr key={l.id}><td>{l.company_name}</td><td>{l.verification_status}</td><td>
 {({
  not_researched:'Not Researched',
  found_unverified:'Contact Found — Unverified',
  verified:'Contact Verified',
  not_found:'No Public Contact Found'
 } as Record<string,string>)[l.contact_research_status || 'not_researched'] || 'Unknown'}
</td><td><a
 href={'https://www.google.com/search?q='+encodeURIComponent(
  l.company_name+' official website contact email'
 )}
 target="_blank"
 rel="noopener noreferrer"
>
 Search Contact Page ↗
</a>{' '}{l.website?.startsWith('https://')?
 <a href={l.website} target="_blank" rel="noopener noreferrer">
  Company Website ↗
 </a>:null}{' '}{l.profile_url?<a href={l.profile_url} target="_blank" rel="noreferrer">Directory ↗</a>:'No profile'} {l.contact_source_url?<a href={l.contact_source_url} target="_blank" rel="noreferrer">Contact source ↗</a>:''}</td><td><button onClick={()=>{setEdit(l.id);setDraft({...l})}}>Review</button></td></tr>)}{!leads.length&&<tr><td colSpan={5}>No exhibitor records for this event.</td></tr>}</tbody></table></div>
 {edit&&<div className="revieweditor"><h3>Review exhibitor</h3><div className="formgrid">{(['profile_url','website','contact_source_url','email','phone','notes'] as const).map(k=><label key={k}>{k.replaceAll('_',' ')}<input value={draft[k]||''} onChange={e=>setDraft({...draft,[k]:e.target.value})}/></label>)}<label>Verification<select value={draft.verification_status} onChange={e=>setDraft({...draft,verification_status:e.target.value})}>{['pending','verified','directory_only','conflict','not_found'].map(v=><option key={v}>{v}</option>)}</select></label><label>Participation<select value={draft.participation_status} onChange={e=>setDraft({...draft,participation_status:e.target.value})}>{['directory_listing','historical','confirmed_current'].map(v=><option key={v}>{v}</option>)}</select></label>
<label>
  <input
    type="checkbox"
    checked={draft.outreach_opt_out === true}
    onChange={e => setDraft({
      ...draft,
      outreach_opt_out: e.target.checked
    })}
  />
  Do Not Contact — exclude this exhibitor from email marketing
</label>
<label>
 Contact Research Status
 <select
  value={draft.contact_research_status || 'not_researched'}
  onChange={e=>setDraft({
   ...draft,
   contact_research_status:e.target.value
  })}
 >
  <option value="not_researched">Not Researched</option>
  <option value="found_unverified">Contact Found — Unverified</option>
  <option value="verified">Contact Verified</option>
  <option value="not_found">No Public Contact Found</option>
 </select>
</label>
<label>
 Contact Research Notes
 <textarea
  rows={3}
  placeholder="Record contact source, research findings, and verification evidence."
  value={draft.contact_research_notes || ''}
  onChange={e=>setDraft({
   ...draft,
   contact_research_notes:e.target.value
  })}
 />
</label>
<label>
  Marketing Approval Status
  <select
    value={draft.marketing_approval_status || 'not_reviewed'}
    onChange={e=>setDraft({
      ...draft,
      marketing_approval_status:e.target.value
    })}
  >
    <option value="not_reviewed">Not Reviewed</option>
<option value="rejected">Not Approved</option>
<option value="approved">Approved — Evidence Required</option>
  </select>
</label>
<label>
  Marketing Evidence Type
  <select
    value={draft.marketing_evidence_type || 'none'}
    onChange={e=>setDraft({
      ...draft,
      marketing_evidence_type:e.target.value
    })}
  >
    <option value="none">No Evidence Recorded</option>
    <option value="explicit_consent">Explicit Consent</option>
    <option value="documented_other_basis">
      Documented Other Basis
    </option>
  </select>
</label>
<label>
  Marketing Approval Evidence / Notes
  <textarea
    rows={3}
    placeholder="Record consent, applicable legal basis, evidence source and review findings."
    value={draft.marketing_approval_notes || ''}
    onChange={e=>setDraft({
      ...draft,
      marketing_approval_notes:e.target.value
    })}
  />
</label>

<button type="button" disabled={busy} onClick={saveLead}>
  Save review
</button><button type="button" onClick={()=>setEdit(null)}>Cancel</button></div></div>}
 {status&&<p role="status">{status}</p>}</section>
}
