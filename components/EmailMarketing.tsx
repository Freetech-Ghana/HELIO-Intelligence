'use client';
import {useEffect,useState} from 'react';
import {db} from '../lib/db';
type Lead={marketing_approval_status?:string|null;
 id:string;
 company_name:string;
 email:string|null;
 outreach_opt_out?:boolean;
 contact_research_status?:string|null;
};
type Campaign={id:string;name:string;subject:string;body:string;status:string;scheduled_for?:string|null};
type Activity={id:string;campaign_id:string;exhibitor_id:string;activity:string;created_at:string};
const templates=[
 {id:"stand",name:"Exhibition Stand Design",subject:"Exhibition stand support for {{company}}",body:"Hello {{company}},\n\nHELIO Advertising & Studio supports exhibitors with exhibition stand design, fabrication, installation and on-site branding in Dubai and across the UAE.\n\nIf you are preparing for an upcoming exhibition, we would be happy to discuss your stand requirements and provide a quotation.\n\nKind regards,\nHELIO Advertising & Studio\ninfo@helio.ae\nhttps://www.helio.ae"},
 {id:"branding",name:"Printing & Branding",subject:"Printing and branding solutions for {{company}}",body:"Hello {{company}},\n\nHELIO Advertising & Studio provides exhibition graphics, large-format printing and event branding solutions.\n\nWould you like to discuss branding or printing requirements for your next exhibition?\n\nKind regards,\nHELIO Advertising & Studio\ninfo@helio.ae\nhttps://www.helio.ae"},
 {id:"followup",name:"Polite Follow-Up",subject:"Following up with {{company}}",body:"Hello {{company}},\n\nI wanted to follow up on our earlier message about HELIO's exhibition and branding services.\n\nIf you have upcoming requirements, we would be glad to discuss them. If this is not relevant, please let us know and we will update our contact preferences.\n\nKind regards,\nHELIO Advertising & Studio\ninfo@helio.ae\nhttps://www.helio.ae"}
];
const csv=(rows:string[][])=>rows.map(row=>row.map(value=>{const safe=/^[\\s]*[=+@-]/.test(value)?"'"+value:value;return '"'+String(safe).replace(/"/g,'""')+'"'}).join(',')).join('\\r\\n');
export default function EmailMarketing({leads,exhibitionId}:{leads:Lead[];exhibitionId:string}){
 const [locallySuppressed,setLocallySuppressed]=useState<string[]>([]);
 const [scheduleAt,setScheduleAt]=useState(''),[reviewOpen,setReviewOpen]=useState(false),[scheduling,setScheduling]=useState(false);
 const [template,setTemplate]=useState('custom'),[previewLead,setPreviewLead]=useState('');
 const [search,setSearch]=useState(''),[audience,setAudience]=useState<'all'|'selected'>('all'),[selectedIds,setSelectedIds]=useState<string[]>([]);
 const [campaigns,setCampaigns]=useState<Campaign[]>([]),[activities,setActivities]=useState<Activity[]>([]),[name,setName]=useState(''),[subject,setSubject]=useState(''),[body,setBody]=useState('Hello {{company}},\n\nWe help exhibitors with exhibition stand design, fabrication, printing and branding.\n\nWould you like a quotation?\n\nHELIO Advertising & Studio'),[campaign,setCampaign]=useState(''),[lead,setLead]=useState(''),[status,setStatus]=useState('prepared'),[err,setErr]=useState(''),[msg,setMsg]=useState(''),[tick,setTick]=useState(0);
 useEffect(()=>{setLocallySuppressed([]);setLead('');setSelectedIds([]);setSearch('');setAudience('all')},[exhibitionId]);
 useEffect(()=>{let active=true;if(!exhibitionId){setCampaigns([]);setActivities([]);return}Promise.all([db().from('helio_email_campaigns').select('*').eq('exhibition_id',exhibitionId).order('created_at',{ascending:false}),db().from('helio_email_activity').select('*').order('created_at',{ascending:false})]).then(([c,a])=>{if(!active)return;if(c.error||a.error){setErr(c.error?.message||a.error?.message||'Load error');return}setCampaigns((c.data||[]) as Campaign[]);setActivities((a.data||[]) as Activity[])});return()=>{active=false}},[exhibitionId,tick]);
 async function save(table:string,payload:Record<string,unknown>){setErr('');setMsg('');const r=await db().from(table).insert(payload);if(r.error)setErr(r.error.message);else{setMsg('Saved. No email has been sent.');setTick(x=>x+1)}}
  async function saveUnsubscribe(){
  setErr('');
  setMsg('');

  if(!campaign || !lead){
   setErr('Select a campaign and exhibitor first.');
   return;
  }

  const unsubscribedId=lead;
  const {data:updated,error:updateError}=await db()
   .from('exhibitors')
   .update({outreach_opt_out:true})
   .eq('id',lead)
   .eq('exhibition_id',exhibitionId)
   .select('id');

  if(updateError || !updated?.length){
   setErr('Could not activate Do Not Contact: '+(updateError?.message||'No exhibitor updated'));
   return;
  }

  setLocallySuppressed(ids=>ids.includes(unsubscribedId)?ids:[...ids,unsubscribedId]);
  setLead('');
  const {error:logError}=await db()
   .from('helio_email_activity')
   .insert({
    campaign_id:campaign,
    exhibitor_id:lead,
    activity:'unsubscribed'
   });

  if(logError){
   setErr('Do Not Contact was activated, but the unsubscribe activity could not be logged: '+logError.message);
   return;
  }

  setMsg('Unsubscribe recorded. Do Not Contact activated.');
  setTick(x=>x+1);
 }
const eligible=leads.filter(l=>
 Boolean(l.email?.trim()) &&
 l.outreach_opt_out!==true &&
 !locallySuppressed.includes(l.id) &&
 l.contact_research_status==='verified' &&
 l.marketing_approval_status==='approved'
);const filteredEligible=eligible.filter(l=>(l.company_name+' '+(l.email||'')).toLowerCase().includes(search.trim().toLowerCase()));
const recipients=audience==='selected'?filteredEligible.filter(l=>selectedIds.includes(l.id)):filteredEligible;
const excluded={missingEmail:leads.filter(l=>!l.email?.trim()).length,optedOut:leads.filter(l=>l.outreach_opt_out||locallySuppressed.includes(l.id)).length,unverified:leads.filter(l=>l.email?.trim()&&!l.outreach_opt_out&&l.contact_research_status!=='verified').length,notApproved:leads.filter(l=>l.email?.trim()&&!l.outreach_opt_out&&l.contact_research_status==='verified'&&l.marketing_approval_status!=='approved').length};
const selected=campaigns.find(c=>c.id===campaign);
async function saveSchedule(){
 setErr('');setMsg('');
 if(!selected||!exhibitionId){setErr('Choose a saved campaign first.');return;}
 if(!scheduleAt||!Number.isFinite(new Date(scheduleAt).getTime())||new Date(scheduleAt).getTime()<=Date.now()+60000){setErr('Choose a future date and time (at least one minute ahead).');return;}
 if(!recipients.length){setErr('Select at least one eligible recipient before reviewing.');return;}
 setScheduling(true);
 try {
  const {data:current,error:checkError}=await db().from('exhibitors').select('id,email,outreach_opt_out,contact_research_status,marketing_approval_status').eq('exhibition_id',exhibitionId).in('id',recipients.map(l=>l.id));
  if(checkError)throw new Error(checkError.message);
  const approved=(current||[]).filter(l=>Boolean(l.email?.trim())&&!l.outreach_opt_out&&l.contact_research_status==='verified'&&l.marketing_approval_status==='approved');
  if(approved.length!==recipients.length)throw new Error('Some recipients are no longer eligible. Refresh and review your audience again.');
  const {error}=await db().from('helio_email_campaigns').update({scheduled_for:new Date(scheduleAt).toISOString(),status:'draft',approved_at:null}).eq('id',selected.id).eq('exhibition_id',exhibitionId);
  if(error)throw new Error(error.message);
  setMsg('Schedule saved for review only. Campaign remains a draft. No emails will be sent. The audience selection is not yet saved; reselect recipients before activation.');
  setReviewOpen(false);setTick(x=>x+1);
 }catch(e){setErr(e instanceof Error?e.message:'Could not save schedule')}finally{setScheduling(false)}
}const chosen=recipients.find(l=>l.id===lead);const personalize=(s:string,l:Lead)=>s.replace(/{{company}}/g,()=>l.company_name);
 async function exportCsv(){
  setErr('');
  if(!selected||recipients.length===0){setErr('No approved eligible contacts to export.');return;}
  const {data:current,error}=await db().from('exhibitors')
   .select('id,company_name,email,outreach_opt_out,contact_research_status,marketing_approval_status')
   .eq('exhibition_id',exhibitionId)
   .in('id',recipients.map(l=>l.id));
  if(error){setErr('Could not recheck recipient eligibility: '+error.message);return;}
  const allowed=(current||[]).filter(l=>
   Boolean(l.email?.trim()) && l.outreach_opt_out!==true &&
   l.contact_research_status==='verified' && l.marketing_approval_status==='approved' &&
   !locallySuppressed.includes(l.id)
  );
  if(!allowed.length){setErr('No currently approved contacts to export.');return;} if(!window.confirm('Export '+allowed.length+' currently eligible contact(s) for external review? No email will be sent.'))return;
  const rows=[['Company','Email','Subject','Body'],...allowed.map(l=>[l.company_name,l.email||'',personalize(selected.subject,l),personalize(selected.body,l)])];const blob=new Blob(['\ufeff'+csv(rows)],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='HELIO_Email_Campaign_Draft.csv';a.click();URL.revokeObjectURL(a.href)}
 return <section className="panel" id="email-marketing"><h2>Email Marketing & Follow-Up</h2><p>Prepare personalized campaigns, export approved contact lists and log outreach. <b>Automatic sending is not enabled.</b></p>{err&&<p role="alert" style={{color:'#b42318'}}>{err} — run migration 009 if tables are missing.</p>}{msg&&<p role="status">{msg}</p>}<div className="leadstats"><div><b>{eligible.length}</b><span>Marketing-approved verified contacts (not opted out; review evidence before outreach)</span></div><div><b>{campaigns.length}</b><span>Campaign drafts</span></div><div><b>{activities.filter(a=>a.activity==='sent_manually').length}</b><span>Manually logged sends</span></div></div>
 <h3>1. Prepare campaign</h3><label>Start from a professional HELIO template<select value={template} onChange={e=>{const id=e.target.value;setTemplate(id);const t=templates.find(x=>x.id===id);if(t){setSubject(t.subject);setBody(t.body);if(!name.trim())setName(t.name)}}}><option value="custom">Custom message</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><p>Templates are editable drafts. Review your claims, recipient permissions and content before exporting.</p><form onSubmit={e=>{e.preventDefault();save('helio_email_campaigns',{exhibition_id:exhibitionId,name,subject,body})}}><div className="formgrid"><label>Campaign name<input required value={name} onChange={e=>setName(e.target.value)}/></label><label>Subject<input required value={subject} onChange={e=>setSubject(e.target.value)}/></label></div><label>Email body (use {'{{company}}'} for personalization)<textarea required rows={7} value={body} onChange={e=>setBody(e.target.value)}/></label><p><button disabled={!exhibitionId}>+ Save campaign draft</button></p></form>
 <h3>2. Build your audience</h3><p>Only verified, marketing-approved contacts who have not opted out can be included. Export is a draft, not an email send.</p><div className="formgrid"><label>Search company or email<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter eligible exhibitors"/></label><label>Audience<select value={audience} onChange={e=>setAudience(e.target.value as 'all'|'selected')}><option value="all">All matching eligible contacts</option><option value="selected">Only manually selected contacts</option></select></label></div><p><b>{recipients.length}</b> recipients in current audience · {excluded.missingEmail} missing email · {excluded.optedOut} opted out · {excluded.unverified} unverified · {excluded.notApproved} awaiting marketing approval</p>{audience==='selected'&&<><button type="button" className="ghost" onClick={()=>setSelectedIds(filteredEligible.map(l=>l.id))}>Select all filtered</button> <button type="button" className="ghost" onClick={()=>setSelectedIds([])}>Clear selection</button><div className="tablewrap" style={{maxHeight:260,overflowY:'auto'}}><table><thead><tr><th>Select</th><th>Company</th><th>Email</th></tr></thead><tbody>{filteredEligible.map(l=><tr key={l.id}><td><input type="checkbox" aria-label={'Select '+l.company_name} checked={selectedIds.includes(l.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...new Set([...ids,l.id])]:ids.filter(id=>id!==l.id))}/></td><td>{l.company_name}</td><td>{l.email}</td></tr>)}</tbody></table></div></>}
 <h3>3. Preview and export</h3><p><b>Sender identity:</b> HELIO Advertising &amp; Studio · info@helio.ae (branding only; sending not configured)</p><div className="formgrid"><label>Campaign<select value={campaign} onChange={e=>setCampaign(e.target.value)}><option value="">Choose campaign</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Eligible exhibitor<select value={lead} onChange={e=>setLead(e.target.value)}><option value="">Choose exhibitor</option>{recipients.map(l=><option key={l.id} value={l.id}>{l.company_name}</option>)}</select></label></div>{selected&&<><p><b>Subject:</b> {chosen?personalize(selected.subject,chosen):selected.subject}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{chosen?personalize(selected.body,chosen):selected.body}</pre><button type="button" disabled={!recipients.length} onClick={exportCsv}>↓ Export eligible campaign CSV</button> <button type="button" className="ghost" onClick={()=>{if(chosen){navigator.clipboard.writeText('Subject: '+personalize(selected.subject,chosen)+'\n\n'+personalize(selected.body,chosen)).then(()=>setMsg('Copied to clipboard')).catch(()=>setErr('Clipboard unavailable'))}}} disabled={!chosen}>Copy personalized email</button></>}
 <h3>4. Schedule and review (no sending)</h3><p>Choose a future date in your local time zone. Scheduling stores a planned date on the campaign but does not approve or send it.</p><div className="formgrid"><label>Planned sending date and time<input type="datetime-local" value={scheduleAt} onChange={e=>setScheduleAt(e.target.value)}/></label><div><p><b>Campaign:</b> {selected?.name||'Choose a saved campaign above'}</p><p><b>Audience:</b> {recipients.length} currently eligible contacts</p><p><b>Existing planned date:</b> {selected?.scheduled_for?new Date(selected.scheduled_for).toLocaleString():'Not scheduled'}</p></div></div><button type="button" disabled={!selected||!recipients.length||!scheduleAt} onClick={()=>setReviewOpen(true)}>Review schedule →</button>{reviewOpen&&<section className="panel"><h3>Final review — draft only</h3><p><b>Campaign:</b> {selected?.name}</p><p><b>Subject:</b> {selected?.subject}</p><p><b>Planned date:</b> {scheduleAt?new Date(scheduleAt).toLocaleString():'—'}</p><p><b>Audience:</b> {recipients.length} eligible contact(s) currently selected</p><p><b>Note:</b> Recipient selections are not stored with the schedule yet. No emails will be sent automatically.</p><button type="button" disabled={scheduling} onClick={saveSchedule}>{scheduling?'Saving...':'Save planned date (draft only)'}</button> <button type="button" className="ghost" onClick={()=>setReviewOpen(false)}>Cancel</button></section>}
 <h3>5. Log outreach or response</h3><form className="formgrid" onSubmit={e=>{
 e.preventDefault();
 if(status==='unsubscribed'){
  void saveUnsubscribe();
 }else{
  void save('helio_email_activity',{
   campaign_id:campaign,
   exhibitor_id:lead,
   activity:status
  });
 }
}}><label>Activity<select value={status} onChange={e=>setStatus(e.target.value)}>{['prepared','sent_manually','replied','bounced','unsubscribed'].map(s=><option key={s} value={s}>{s}</option>)}</select></label><button disabled={!campaign||!lead}>+ Save activity</button></form><div className="tablewrap"><table><thead><tr><th>Date</th><th>Campaign</th><th>Exhibitor</th><th>Activity</th></tr></thead><tbody>{activities.filter(a=>campaigns.some(c=>c.id===a.campaign_id)).slice(0,50).map(a=><tr key={a.id}><td>{new Date(a.created_at).toLocaleDateString()}</td><td>{campaigns.find(c=>c.id===a.campaign_id)?.name}</td><td>{leads.find(l=>l.id===a.exhibitor_id)?.company_name||'—'}</td><td>{a.activity}</td></tr>)}</tbody></table></div><p className="leadnotice">Respect consent, suppression lists and applicable anti-spam/privacy rules. A published business email is not proof of marketing consent. Recording an unsubscribe sets Do Not Contact and immediately suppresses the contact from this session. Review each recipient before any external sending.</p></section>
}
