'use client';
import {useMemo,useState} from 'react';
type Lead={id:string;company_name:string;country:string|null;description:string|null;website:string|null;email:string|null;hall:string|null;stand:string|null;profile_url:string|null;verification_status:string;outreach_opt_out?:boolean};
type Props={leads:Lead[];eventName:string};
function score(l:Lead){
 const details=(l.company_name+' '+(l.description||'')).toLowerCase();
 const fit=/exhibit|stand|display|brand|event|retail|product|hospitality|food|flour|beverage|machin|robot|manufactur/.test(details)?25:12;
 const participation=(l.hall?10:0)+(l.stand?10:0)+(l.profile_url?10:0);
 const research=(l.website?15:0)+(l.email?10:0)+(l.verification_status==='verified'?10:0);
 const total=Math.min(100,fit+participation+research);
 const priority=total>=70?'High':total>=45?'Medium':'Low';
 const service=/robot|machin|equip|technolog|industr/.test(details)?'Product demo stands & exhibition video':/food|flour|beverage|hospitality|hotel/.test(details)?'Exhibition stands & branded product displays':'Stand fabrication, branding & signage';
 const gaps=[!l.website?'Verify company website':null,!l.email?'Research business contact':null,l.verification_status!=='verified'?'Verify exhibitor details':null,!l.hall||!l.stand?'Confirm hall and stand':null].filter((x):x is string=>!!x);
 return {total,priority,service,gaps,fit,participation,research};
}
export default function LeadScoring({leads,eventName}:Props){
 const [term,setTerm]=useState(''),[priority,setPriority]=useState('all'),[sort,setSort]=useState('score');
 const rows=useMemo(()=>leads.map(l=>({lead:l,...score(l)})).filter(x=>x.lead.company_name.toLowerCase().includes(term.toLowerCase())&&(priority==='all'||x.priority===priority)).sort((a,b)=>sort==='name'?a.lead.company_name.localeCompare(b.lead.company_name):b.total-a.total||a.lead.company_name.localeCompare(b.lead.company_name)),[leads,term,priority,sort]);
 const high=leads.filter(l=>score(l).priority==='High').length;
 return <section className="panel scoring-panel"><div className="panelhead"><div><span className="eyebrow">SALES INTELLIGENCE / V2.6</span><h2>Lead scoring & prioritization</h2><p>Rank exhibitors in {eventName||'the selected exhibition'} using transparent, rule-based signals. No API credits required.</p></div><span className="score-tag">Rule-based · 0–100</span></div>
 <div className="metrics"><div className="metric"><span>Exhibitors assessed</span><strong>{leads.length}</strong><small>Saved exhibition records</small></div><div className="metric"><span>High priority</span><strong>{high}</strong><small>Estimated fit, not intent</small></div><div className="metric"><span>Need contact research</span><strong>{leads.filter(l=>!l.email).length}</strong></div><div className="metric"><span>Do Not Contact</span><strong>{leads.filter(l=>l.outreach_opt_out).length}</strong><small>Excluded from follow-up actions</small></div></div>
 <div className="score-controls"><label>Find company<input value={term} onChange={e=>setTerm(e.target.value)} placeholder="Search exhibitors"/></label><label>Priority<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="all">All priorities</option><option>High</option><option>Medium</option><option>Low</option></select></label><label>Sort by<select value={sort} onChange={e=>setSort(e.target.value)}><option value="score">Highest score first</option><option value="name">Company name</option></select></label></div>
 <div className="tablewrap"><table><thead><tr><th>Company</th><th>Score</th><th>Priority</th><th>Suggested HELIO service</th><th>Research gaps / next action</th></tr></thead><tbody>{rows.map(x=><tr key={x.lead.id}><td><b>{x.lead.company_name}</b><small className="score-meta">{[x.lead.country,x.lead.hall,x.lead.stand].filter(Boolean).join(' · ')||'Exhibitor record'}</small></td><td><strong className="score-number">{x.total}</strong><small className="score-meta">/ 100</small><div className="score-track"><span style={{width:x.total+'%'}}/></div></td><td><span className={'priority-pill priority-'+x.priority.toLowerCase()}>{x.priority}</span></td><td>{x.service}</td><td>{x.lead.outreach_opt_out?<strong>Do Not Contact — no outreach recommendation</strong>:x.gaps.length?x.gaps.join(' · '):'Review qualification and lawful outreach basis'}</td></tr>)}{!rows.length&&<tr><td colSpan={5} className="empty">No exhibitors match these filters.</td></tr>}</tbody></table></div>
 <p className="score-disclaimer">Scoring model: service fit 12–25 points; directory profile, hall and stand up to 30; website, email and verification up to 35. High ≥70, Medium ≥45. These are research-completeness and potential-service-fit indicators, not purchasing intent, consent or marketing eligibility. No data is modified.</p>
 </section>;
}