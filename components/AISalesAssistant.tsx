'use client';
import {useMemo,useState} from 'react';
import {db} from '../lib/db';
type Lead={id:string;company_name:string;country:string|null;description:string|null;website:string|null;email:string|null;hall:string|null;stand:string|null;outreach_opt_out?:boolean};
type Props={leads:Lead[];eventName:string};
function recommendation(l:Lead){
 const t=(l.company_name+' '+(l.description||'')).toLowerCase();
 if(/food|flour|bakery|hospitality|hotel|restaurant|beverage/.test(t))return 'Exhibition stand design, branded product displays and event photography';
 if(/robot|technolog|machin|equip|industr/.test(t))return 'Product demonstration stand, signage and exhibition video production';
 return 'Exhibition stand design, fabrication and brand signage';
}
export default function AISalesAssistant({leads,eventName}:Props){
 const [term,setTerm]=useState(''),[selected,setSelected]=useState(''),[view,setView]=useState('overview');
 const [aiBusy,setAiBusy]=useState(false),[aiAnswer,setAiAnswer]=useState(''),[aiError,setAiError]=useState('');
 async function generate(id:string){setAiBusy(true);setAiError('');setAiAnswer('');try{const {data}=await db().auth.getSession();if(!data.session)throw Error('Sign in required');const res=await fetch('/api/ai/sales-assistant',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({exhibitorId:id})});const json=await res.json();if(!res.ok)throw Error(json.error||'AI request failed');setAiAnswer(json.answer||'')}catch(e){setAiError(e instanceof Error?e.message:'AI request failed')}finally{setAiBusy(false)}}
 const eligible=useMemo(()=>leads.filter(l=>!l.outreach_opt_out),[leads]);
 const matches=eligible.filter(l=>l.company_name.toLowerCase().includes(term.toLowerCase())).slice(0,100);
 const lead=eligible.find(l=>l.id===selected);
 const missing=leads.filter(l=>!l.email).length;
 const draft=lead?`Subject: Exhibition support for ${lead.company_name}

Hello ${lead.company_name} team,

HELIO Advertising & Studio provides exhibition stand design, fabrication, branding and event production services.

We noticed your listing in the ${eventName||'exhibition'} directory. Based on your publicly listed business profile, our team could explore ${recommendation(lead).toLowerCase()} for your exhibition needs.

If your team is considering exhibition support, we would be pleased to discuss your requirements.

Kind regards,
HELIO Advertising & Studio`:'';
 return <section className="panel"><h2>HELIO AI Sales Assistant · v2.5</h2>
 <p><b>AI-powered analysis is available on demand.</b> The summary and basic drafts use local rules; clicking Generate AI Analysis sends limited company and exhibition information to OpenAI. No email addresses, phone numbers or contact notes are sent. Nothing is saved or sent to exhibitors.</p>
 <div className="metrics"><div className="metric"><span>Exhibitors</span><strong>{leads.length}</strong></div><div className="metric"><span>Missing email</span><strong>{missing}</strong></div><div className="metric"><span>Do Not Contact</span><strong>{leads.length-eligible.length}</strong></div></div>
 <label>Assistant view<select value={view} onChange={e=>setView(e.target.value)} style={{display:'block',padding:10,marginTop:8}}><option value="overview">Exhibition summary</option><option value="leads">Lead recommendations & draft</option></select></label>
 {view==='overview'?<div><h3>{eventName||'Selected exhibition'} — research overview</h3><p>{leads.length} exhibitors are recorded. {missing} have no saved email. {leads.filter(l=>!l.website).length} have no saved website. {leads.length-eligible.length} are marked Do Not Contact.</p><p>Suggested next action: prioritize company website verification and contact research. A discovered email is not evidence of marketing permission.</p><button type="button" onClick={()=>setView('leads')}>Review exhibitors →</button></div>:<div>
 <label>Find exhibitor<input value={term} onChange={e=>setTerm(e.target.value)} placeholder="Search company name"/></label>
 <label>Choose exhibitor<select value={selected} onChange={e=>{setSelected(e.target.value);setAiAnswer('');setAiError('')}} style={{display:'block',width:'100%',padding:10,marginTop:8}}><option value="">Select company</option>{matches.map(l=><option key={l.id} value={l.id}>{l.company_name}</option>)}</select></label>
 {lead?<div className="revieweditor"><h3>{lead.company_name}</h3><p><b>Suggested HELIO services:</b> {recommendation(lead)}. This is an unverified sales suggestion.</p><p><b>Research gaps:</b> {!lead.website?'Official website missing. ':''}{!lead.email?'Email missing. ':''}{lead.website&&lead.email?'Review verification and lawful marketing basis before outreach.':''}</p><h3>OpenAI analysis — for internal review only</h3><button type="button" disabled={aiBusy} onClick={()=>void generate(lead.id)}>{aiBusy?'Generating…':'Generate AI Analysis & Draft'}</button>{aiError&&<p role="alert">{aiError}</p>}{aiAnswer&&<div><textarea readOnly rows={18} style={{width:'100%',padding:12,marginTop:12}} value={aiAnswer}/><button type="button" onClick={()=>void navigator.clipboard.writeText(aiAnswer)}>Copy AI analysis</button></div>}<h3>Basic draft — not approved for sending</h3><textarea readOnly rows={13} style={{width:'100%',padding:12}} value={draft}/><button type="button" onClick={()=>void navigator.clipboard.writeText(draft)}>Copy for internal review</button></div>:<p>Select a company to see a suggested service and internal draft. Do Not Contact records are excluded.</p>}
 </div>}
 <p>Marketing approval and unsubscribe protections remain in the existing workflow. This assistant cannot send emails or change approval status.</p>
 </section>;
}