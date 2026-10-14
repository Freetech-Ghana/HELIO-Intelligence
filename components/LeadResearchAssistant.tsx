'use client';
import {useMemo,useState} from 'react';
import {db} from '../lib/db';

type Lead={id:string;company_name:string;country:string|null;description:string|null;website:string|null;email:string|null;profile_url:string|null;hall:string|null;stand:string|null;contact_source_url:string|null;contact_research_status?:string;outreach_opt_out?:boolean};
const services=[
 {name:'Exhibition stand design & fabrication',terms:/exhibit|trade show|stand|booth|pavilion|expo/i},
 {name:'Branding, signage & print production',terms:/brand|packag|retail|display|signage|print|product/i},
 {name:'Event photography & video production',terms:/event|launch|hospitality|food|beverage|conference/i}
];
function safeUrl(raw:string|null|undefined){try{const u=new URL(raw||'');return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u.href:null}catch{return null}}
function suggest(l:Lead){const text=[l.description,l.company_name].filter(Boolean).join(' ');return services.find(s=>s.terms.test(text))?.name||'Exhibition stand design & event branding (research suggestion)'}
function draft(l:Lead,eventName:string){const service=suggest(l);return `Subject: Exhibition support for ${l.company_name}

Hello ${l.company_name} team,

I am reaching out from HELIO Advertising & Studio. We provide ${service.toLowerCase()} services.

We came across your company in the ${eventName||'exhibition'} directory and would welcome a conversation about your upcoming exhibition requirements.

If relevant, please let us know the best contact for exhibition or marketing projects.

Kind regards,
HELIO Advertising & Studio`}
export default function LeadResearchAssistant({leads,eventName,exhibitionId,onChanged}:{leads:Lead[];eventName:string;exhibitionId:string;onChanged:()=>Promise<void>}){
 const [filter,setFilter]=useState('all'),[term,setTerm]=useState(''),[selected,setSelected]=useState<string|null>(null);
 const [websiteCandidate,setWebsiteCandidate]=useState(''),[websiteMessage,setWebsiteMessage]=useState(''),[websiteBusy,setWebsiteBusy]=useState(false);
 const [busy,setBusy]=useState(false),[researchError,setResearchError]=useState(''),[researchCompleted,setResearchCompleted]=useState(false),[findings,setFindings]=useState<{source_url:string;emails:string[]}[]>([]);
 async function researchContact(id:string){setBusy(true);setResearchError('');setFindings([]);setResearchCompleted(false);try{const {data}=await db().auth.getSession();if(!data.session)throw Error('Sign in required');const res=await fetch('/api/exhibitors/research-contact',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({exhibitorId:id})});const json=await res.json();if(!res.ok)throw Error(json.error||'Research failed');setFindings(json.results||[]);setResearchCompleted(true)}catch(e){setResearchError(e instanceof Error?e.message:'Research failed')}finally{setBusy(false)}}
 async function discoverWebsite(lead:Lead){
  setWebsiteBusy(true);setWebsiteCandidate('');setWebsiteMessage('');
  try{
   if(!lead.profile_url||!exhibitionId)throw Error('An approved exhibition directory profile is required.');
   const {data}=await db().auth.getSession();if(!data.session)throw Error('Sign in required');
   const res=await fetch('/api/exhibitors/enrich-profiles',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({exhibitionId,profileUrl:lead.profile_url})});
   const json=await res.json();if(!res.ok)throw Error(json.error||'Could not read directory profile');
   const candidate=safeUrl(json.profile?.website);
   if(!candidate){setWebsiteMessage('No official website link was found in this directory profile. Review the profile or search manually.');return}
   setWebsiteCandidate(candidate);
   setWebsiteMessage('Candidate extracted from the directory. Open it and confirm it belongs to this company before saving.');
  }catch(e){setWebsiteMessage(e instanceof Error?e.message:'Website discovery failed')}finally{setWebsiteBusy(false)}
 }
 async function saveWebsite(lead:Lead){
  if(!websiteCandidate||!safeUrl(websiteCandidate))return;
  setWebsiteBusy(true);setWebsiteMessage('');
  try{
   const {data:userData}=await db().auth.getUser();if(!userData.user)throw Error('Sign in required');
   let query=db().from('exhibitors').update({website:websiteCandidate}).eq('id',lead.id).eq('owner_id',userData.user.id);
   query=lead.website?query.eq('website',lead.website):query.is('website',null);
   const {data,error}=await query.select('id');
   if(error)throw error;
   if(!data?.length)throw Error('Website was not saved. The record may have changed; refresh and try again.');
   setWebsiteCandidate('');setWebsiteMessage('Confirmed website saved. You can now run Research Contact.');await onChanged();
  }catch(e){setWebsiteMessage(e instanceof Error?e.message:'Save failed')}finally{setWebsiteBusy(false)}
 }
 const candidates=useMemo(()=>leads.filter(l=>(filter==='all'||(filter==='missing'?!l.email:filter==='unverified'?l.contact_research_status!=='verified':l.outreach_opt_out===true))&&l.company_name.toLowerCase().includes(term.toLowerCase())),[leads,filter,term]);
 const lead=leads.find(l=>l.id===selected);
 return <section className="panel"><h2>Company & Contact Research Assistant · v2.4</h2>
 <p>Research queue for imported exhibitors. Service suggestions and outreach drafts are generated from existing company information; they are not verified facts. No automatic emails are sent, and no contacts are approved by this tool.</p>
 <div className="formgrid"><label>Search companies<input value={term} onChange={e=>setTerm(e.target.value)} placeholder="Company name"/></label><label>Research queue<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All exhibitors</option><option value="missing">Missing email</option><option value="unverified">Contact not verified</option><option value="optout">Do Not Contact</option></select></label></div>
 <p>{candidates.length} companies in this queue · {leads.filter(l=>!l.email).length} missing emails · {leads.filter(l=>l.outreach_opt_out).length} Do Not Contact</p>
 <div className="tablewrap"><table><thead><tr><th>Company</th><th>Suggested service</th><th>Contact status</th><th>Research</th></tr></thead><tbody>
 {candidates.map(l=><tr key={l.id}><td><b>{l.company_name}</b><small style={{display:'block'}}>{[l.hall,l.stand,l.country].filter(Boolean).join(' · ')}</small></td><td>{suggest(l)}</td><td>{l.outreach_opt_out?'Do Not Contact':l.contact_research_status||'Not researched'}{l.email?' · Email recorded':' · Email missing'}</td><td><button type="button" onClick={()=>{setSelected(l.id);setFindings([]);setResearchError('');setResearchCompleted(false);setWebsiteCandidate('');setWebsiteMessage('')}}>Review</button></td></tr>)}
 {!candidates.length&&<tr><td colSpan={4}>No companies match these filters.</td></tr>}</tbody></table></div>
 {lead&&<div className="revieweditor"><h3>Research: {lead.company_name}</h3>
 <p><b>Suggested HELIO service:</b> {suggest(lead)}. Confirm relevance with the company before using this suggestion.</p>
 <p><b>Contact status:</b> {lead.contact_research_status||'Not researched'} · {lead.outreach_opt_out?'Do Not Contact':'No opt-out recorded'}. A published email does not establish marketing permission.</p>
 <div style={{display:'flex',flexWrap:'wrap',gap:12,marginBottom:14}}>
 {safeUrl(lead.website)&&<a className="button" href={safeUrl(lead.website)!} target="_blank" rel="noopener noreferrer">Company website ↗</a>}
 {safeUrl(lead.profile_url)&&<a className="button" href={safeUrl(lead.profile_url)!} target="_blank" rel="noopener noreferrer">Official directory profile ↗</a>}
 <a className="button" href={'https://www.google.com/search?q='+encodeURIComponent(lead.company_name+' official contact page')} target="_blank" rel="noopener noreferrer">Search official contact page ↗</a>
 </div>
 <div style={{marginBottom:16}}>{!safeUrl(lead.website)&&<div><button type="button" disabled={websiteBusy||!lead.profile_url} onClick={()=>void discoverWebsite(lead)}>{websiteBusy?'Checking profile…':'Find Website in Directory Profile'}</button>{websiteMessage&&<p role="status">{websiteMessage}</p>}{websiteCandidate&&<div><a href={websiteCandidate} target="_blank" rel="noopener noreferrer">Review candidate website ↗</a><p>{websiteCandidate}</p><button type="button" disabled={websiteBusy} onClick={()=>void saveWebsite(lead)}>I Confirm This Is the Official Website — Save</button></div>}</div>}<button type="button" disabled={busy||!safeUrl(lead.website)||lead.outreach_opt_out} onClick={()=>void researchContact(lead.id)}>{busy?'Researching…':'Research Contact'}</button>{!safeUrl(lead.website)&&<p>Add the official HTTPS company website in Exhibitor Verification before running research.</p>}{researchError&&<p role="alert">{researchError}</p>}{findings.length>0?<div><h3>Public email candidates — not verified</h3>{findings.map(f=><div key={f.source_url}><a href={f.source_url} target="_blank" rel="noopener noreferrer">Source page ↗</a><p>{f.emails.join(' · ')}</p></div>)}</div>:null}{researchCompleted&&findings.length===0&&<p role="status">Research completed — no public email addresses found on the checked pages. Try another official source or review manually.</p>}{!researchCompleted&&!busy&&!researchError&&<p>Click Research Contact to scan a few public pages. Results are not saved automatically.</p>}</div><p>Open and check official sources yourself. Record any verified contact URL, evidence and consent or other lawful basis separately in the Exhibitor Verification section below.</p>
 <label style={{display:'block'}}>Personalized draft — for internal review only<textarea readOnly rows={12} style={{display:'block',width:'100%',padding:12,marginTop:8}} value={lead.outreach_opt_out?'Draft disabled: exhibitor is marked Do Not Contact.':draft(lead,eventName)}/></label>
 <div style={{display:'flex',gap:10,marginTop:12}}><button type="button" disabled={lead.outreach_opt_out} onClick={()=>{void navigator.clipboard.writeText(draft(lead,eventName))}}>Copy draft for internal review</button><button type="button" className="ghost" onClick={()=>setSelected(null)}>Close</button></div>
 <p>Copying a draft does not authorize sending it. Marketing approval and opt-out safeguards still apply.</p></div>}
 </section>;
}
