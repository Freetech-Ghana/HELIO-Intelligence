'use client';
import {useMemo,useState} from 'react';

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
export default function LeadResearchAssistant({leads,eventName}:{leads:Lead[];eventName:string}){
 const [filter,setFilter]=useState('all'),[term,setTerm]=useState(''),[selected,setSelected]=useState<string|null>(null);
 const candidates=useMemo(()=>leads.filter(l=>(filter==='all'||(filter==='missing'?!l.email:filter==='unverified'?l.contact_research_status!=='verified':l.outreach_opt_out===true))&&l.company_name.toLowerCase().includes(term.toLowerCase())),[leads,filter,term]);
 const lead=leads.find(l=>l.id===selected);
 return <section className="panel"><h2>Company & Contact Research Assistant · v2.4</h2>
 <p>Research queue for imported exhibitors. Service suggestions and outreach drafts are generated from existing company information; they are not verified facts. No automatic emails are sent, and no contacts are approved by this tool.</p>
 <div className="formgrid"><label>Search companies<input value={term} onChange={e=>setTerm(e.target.value)} placeholder="Company name"/></label><label>Research queue<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All exhibitors</option><option value="missing">Missing email</option><option value="unverified">Contact not verified</option><option value="optout">Do Not Contact</option></select></label></div>
 <p>{candidates.length} companies in this queue · {leads.filter(l=>!l.email).length} missing emails · {leads.filter(l=>l.outreach_opt_out).length} Do Not Contact</p>
 <div className="tablewrap"><table><thead><tr><th>Company</th><th>Suggested service</th><th>Contact status</th><th>Research</th></tr></thead><tbody>
 {candidates.map(l=><tr key={l.id}><td><b>{l.company_name}</b><small style={{display:'block'}}>{[l.hall,l.stand,l.country].filter(Boolean).join(' · ')}</small></td><td>{suggest(l)}</td><td>{l.outreach_opt_out?'Do Not Contact':l.contact_research_status||'Not researched'}{l.email?' · Email recorded':' · Email missing'}</td><td><button type="button" onClick={()=>setSelected(l.id)}>Review</button></td></tr>)}
 {!candidates.length&&<tr><td colSpan={4}>No companies match these filters.</td></tr>}</tbody></table></div>
 {lead&&<div className="revieweditor"><h3>Research: {lead.company_name}</h3>
 <p><b>Suggested HELIO service:</b> {suggest(lead)}. Confirm relevance with the company before using this suggestion.</p>
 <p><b>Contact status:</b> {lead.contact_research_status||'Not researched'} · {lead.outreach_opt_out?'Do Not Contact':'No opt-out recorded'}. A published email does not establish marketing permission.</p>
 <div style={{display:'flex',flexWrap:'wrap',gap:12,marginBottom:14}}>
 {safeUrl(lead.website)&&<a className="button" href={safeUrl(lead.website)!} target="_blank" rel="noopener noreferrer">Company website ↗</a>}
 {safeUrl(lead.profile_url)&&<a className="button" href={safeUrl(lead.profile_url)!} target="_blank" rel="noopener noreferrer">Official directory profile ↗</a>}
 <a className="button" href={'https://www.google.com/search?q='+encodeURIComponent(lead.company_name+' official contact page')} target="_blank" rel="noopener noreferrer">Search official contact page ↗</a>
 </div>
 <p>Open and check official sources yourself. Record any verified contact URL, evidence and consent or other lawful basis separately in the Exhibitor Verification section below.</p>
 <label style={{display:'block'}}>Personalized draft — for internal review only<textarea readOnly rows={12} style={{display:'block',width:'100%',padding:12,marginTop:8}} value={lead.outreach_opt_out?'Draft disabled: exhibitor is marked Do Not Contact.':draft(lead,eventName)}/></label>
 <div style={{display:'flex',gap:10,marginTop:12}}><button type="button" disabled={lead.outreach_opt_out} onClick={()=>{void navigator.clipboard.writeText(draft(lead,eventName))}}>Copy draft for internal review</button><button type="button" className="ghost" onClick={()=>setSelected(null)}>Close</button></div>
 <p>Copying a draft does not authorize sending it. Marketing approval and opt-out safeguards still apply.</p></div>}
 </section>;
}
