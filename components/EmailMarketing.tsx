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
type Campaign={id:string;name:string;subject:string;body:string;status:string};
type Activity={id:string;campaign_id:string;exhibitor_id:string;activity:string;created_at:string};
const csv=(rows:string[][])=>rows.map(row=>row.map(s=>'"'+String(s).replace(/"/g,'""')+'"').join(',')).join('\r\n');
export default function EmailMarketing({leads,exhibitionId}:{leads:Lead[];exhibitionId:string}){
 const [locallySuppressed,setLocallySuppressed]=useState<string[]>([]);
 const [campaigns,setCampaigns]=useState<Campaign[]>([]),[activities,setActivities]=useState<Activity[]>([]),[name,setName]=useState(''),[subject,setSubject]=useState(''),[body,setBody]=useState('Hello {{company}},\n\nWe help exhibitors with exhibition stand design, fabrication, printing and branding.\n\nWould you like a quotation?\n\nHELIO Advertising & Studio'),[campaign,setCampaign]=useState(''),[lead,setLead]=useState(''),[status,setStatus]=useState('prepared'),[err,setErr]=useState(''),[msg,setMsg]=useState(''),[tick,setTick]=useState(0);
 useEffect(()=>{setLocallySuppressed([]);setLead('')},[exhibitionId]);
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
);const selected=campaigns.find(c=>c.id===campaign);const chosen=eligible.find(l=>l.id===lead);const personalize=(s:string,l:Lead)=>s.replace(/{{company}}/g,l.company_name);
 function exportCsv(){if(!selected||eligible.length===0){setErr('No approved eligible contacts to export.');return;}const rows=[['Company','Email','Subject','Body'],...eligible.map(l=>[l.company_name,l.email||'',personalize(selected.subject,l),personalize(selected.body,l)])];const blob=new Blob(['\ufeff'+csv(rows)],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='HELIO_Email_Campaign_Draft.csv';a.click();URL.revokeObjectURL(a.href)}
 return <section className="panel" id="email-marketing"><h2>Email Marketing & Follow-Up</h2><p>Prepare personalized campaigns, export approved contact lists and log outreach. <b>Automatic sending is not enabled.</b></p>{err&&<p role="alert" style={{color:'#b42318'}}>{err} — run migration 009 if tables are missing.</p>}{msg&&<p role="status">{msg}</p>}<div className="leadstats"><div><b>{eligible.length}</b><span>Marketing-approved verified contacts (not opted out; review evidence before outreach)</span></div><div><b>{campaigns.length}</b><span>Campaign drafts</span></div><div><b>{activities.filter(a=>a.activity==='sent_manually').length}</b><span>Manually logged sends</span></div></div>
 <h3>1. Prepare campaign</h3><form onSubmit={e=>{e.preventDefault();save('helio_email_campaigns',{exhibition_id:exhibitionId,name,subject,body})}}><div className="formgrid"><label>Campaign name<input required value={name} onChange={e=>setName(e.target.value)}/></label><label>Subject<input required value={subject} onChange={e=>setSubject(e.target.value)}/></label></div><label>Email body (use {'{{company}}'} for personalization)<textarea required rows={7} value={body} onChange={e=>setBody(e.target.value)}/></label><p><button disabled={!exhibitionId}>+ Save campaign draft</button></p></form>
 <h3>2. Preview and export</h3><div className="formgrid"><label>Campaign<select value={campaign} onChange={e=>setCampaign(e.target.value)}><option value="">Choose campaign</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Eligible exhibitor<select value={lead} onChange={e=>setLead(e.target.value)}><option value="">Choose exhibitor</option>{eligible.map(l=><option key={l.id} value={l.id}>{l.company_name}</option>)}</select></label></div>{selected&&<><p><b>Subject:</b> {chosen?personalize(selected.subject,chosen):selected.subject}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{chosen?personalize(selected.body,chosen):selected.body}</pre><button type="button" disabled={!eligible.length} onClick={exportCsv}>↓ Export eligible campaign CSV</button> <button type="button" className="ghost" onClick={()=>{if(chosen){navigator.clipboard.writeText('Subject: '+personalize(selected.subject,chosen)+'\n\n'+personalize(selected.body,chosen)).then(()=>setMsg('Copied to clipboard')).catch(()=>setErr('Clipboard unavailable'))}}} disabled={!chosen}>Copy personalized email</button></>}
 <h3>3. Log outreach or response</h3><form className="formgrid" onSubmit={e=>{
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
