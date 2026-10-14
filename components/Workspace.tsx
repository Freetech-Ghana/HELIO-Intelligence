"use client";
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import {db} from '../lib/db';
import ScheduleImport from './ScheduleImport';
import ExhibitionDiscovery from './ExhibitionDiscovery';
import LeadImport from './LeadImport';
import LeadQualification from './LeadQualification';
import OutreachCentre from './OutreachCentre';
import CampaignReporting from './CampaignReporting';
import SalesPipeline from './SalesPipeline';
import CustomerProjects from './CustomerProjects';
import EmailMarketing from './EmailMarketing';
import ResendTest from './ResendTest';
import CampaignManager from './CampaignManager';
import ResearchControl from './ResearchControl';
import LeadResearchAssistant from './LeadResearchAssistant';
import AISalesAssistant from './AISalesAssistant';
import LeadScoring from './LeadScoring';
import SalesCommandCentre from './SalesCommandCentre';
import GlobalExhibitorSearch from './GlobalExhibitorSearch';
import OpportunityRadar from './OpportunityRadar';

type Event={id:string;name:string;edition_year:number;directory_url:string|null;directory_total:number|null;source_number?:number|null;source_date_text?:string|null;venue?:string|null;hall?:string|null;date_verified?:boolean;research_status?:string;discovery_start_date?:string|null;discovery_end_date?:string|null;discovery_city?:string|null;discovery_event_url?:string|null;discovery_source_url?:string|null};
type Lead={id:string;exhibition_id:string;company_name:string;country:string|null;description:string|null;website:string|null;email:string|null;phone:string|null;hall:string|null;stand:string|null;profile_url:string|null;contact_source_url:string|null;verification_status:string;participation_status:string;notes:string|null;outreach_opt_out?:boolean};
const menu=[
 {id:"dashboard",label:"Dashboard",href:"/"},
 {id:"exhibitions",label:"Exhibition Database",href:"/exhibitions"},
 {id:"discovery",label:"Exhibition Scanner",href:"/discovery"},
 {id:"opportunity-radar",label:"Opportunity Radar",href:"/opportunity-radar"},
 {id:"find-exhibitors",label:"Find Exhibitors",href:"/find-exhibitors"},
 {id:"directory-finder",label:"Automatic Exhibitor Import",href:"/directory-finder"},
 {id:"leads",label:"Exhibitor Database & Search",href:"/leads"},
 {id:"global-search",label:"Global Exhibitor Search",href:"/global-search"},
 {id:"qualification",label:"Lead Qualification",href:"/qualification"},
 {id:"outreach",label:"Outreach & Follow-Up",href:"/outreach"},
 {id:"reports",label:"Reports & Analytics",href:"/reports"},
 {id:"pipeline",label:"Sales Pipeline",href:"/pipeline"},
 {id:"projects",label:"Customers & Projects",href:"/projects"},
 {id:"email-marketing",label:"Email Marketing",href:"/email-marketing"},
 {id:"campaigns",label:"Legacy Drafts",href:"/campaigns"},
 {id:"research",label:"Research & Verification",href:"/research"},
 {id:"ai-assistant",label:"AI Sales Assistant",href:"/ai-assistant"},
 {id:"lead-scoring",label:"Lead Scoring & Qualification",href:"/lead-scoring"}
];
// Consolidated navigation; legacy routes remain accessible for existing links and saved data.
const menuGroups=[
 {label:"Exhibition Management",ids:["discovery","exhibitions","directory-finder"]},
 {label:"Lead Intelligence",ids:["leads","lead-scoring","research"]},
 {label:"Sales & CRM",ids:["pipeline","projects","ai-assistant"]},
 {label:"Marketing",ids:["outreach","email-marketing"]},
 {label:"Reports",ids:["reports"]}
];
export default function Workspace({module}:{module:string}){
 const router=useRouter();
 const searchParams=useSearchParams();
 const requestedExhibitionId=searchParams.get('exhibition');
 const[session,setSession]=useState<any>(null),[loading,setLoading]=useState(true);
 const[events,setEvents]=useState<Event[]>([]),[leads,setLeads]=useState<Lead[]>([]),[selected,setSelected]=useState('');
 const[msg,setMsg]=useState(''),[query,setQuery]=useState(''),[countryFilter,setCountryFilter]=useState('all'),[statusFilter,setStatusFilter]=useState('all');
 const[name,setName]=useState(''),[year,setYear]=useState(2026),[url,setUrl]=useState(''),[total,setTotal]=useState('');
 const[company,setCompany]=useState(''),[country,setCountry]=useState(''),[email,setEmail]=useState(''),[website,setWebsite]=useState('');
 const[directoryInput,setDirectoryInput]=useState(''),[savingDirectory,setSavingDirectory]=useState(false);
 async function refresh(){
  const s=db();const[a,b]=await Promise.all([s.from('exhibitions').select('*').order('edition_year',{ascending:false}),s.from('exhibitors').select('*').order('created_at',{ascending:false})]);
  if(a.error||b.error){setMsg(a.error?.message||b.error?.message||'Could not load records');return;}
  setEvents(([...(a.data||[])] as Event[]).sort((x,y)=>x.name.localeCompare(y.name,undefined,{sensitivity:'base',numeric:true})||y.edition_year-x.edition_year));setLeads((b.data||[]) as Lead[]);
   setSelected(v=>{
  const available=a.data||[];
  if(
   requestedExhibitionId &&
   available.some(x=>x.id===requestedExhibitionId)
  ){
   return requestedExhibitionId;
  }
  return v&&available.some(x=>x.id===v)
   ?v
   :(available[0]?.id||'');
 });
 }
 useEffect(()=>{let active=true;const s=db();s.auth.getSession().then(async({data})=>{if(!active)return;setSession(data.session);setLoading(false);if(data.session)await refresh()});const{data:{subscription}}=s.auth.onAuthStateChange((_e,ss)=>setSession(ss));return()=>{active=false;subscription.unsubscribe()};},[]);
 const current=events.find(e=>e.id===selected);
 useEffect(()=>{setDirectoryInput(current?.directory_url||'')},[current?.id,current?.directory_url]);
 const selectedLeads=useMemo(()=>leads.filter(l=>l.exhibition_id===selected),[leads,selected]);
 const countries=useMemo(()=>[...new Set(selectedLeads.map(l=>l.country).filter((v):v is string=>!!v))].sort(),[selectedLeads]);
 const visible=useMemo(()=>selectedLeads.filter(l=>[l.company_name,l.country,l.email,l.website,l.hall,l.stand].join(' ').toLowerCase().includes(query.toLowerCase())&&(countryFilter==='all'||l.country===countryFilter)&&(statusFilter==='all'||(statusFilter==='email'?!!l.email:statusFilter==='no-email'?!l.email:l.verification_status===statusFilter))),[selectedLeads,query,countryFilter,statusFilter]);
 async function addEvent(e:React.FormEvent){e.preventDefault();const{error}=await db().from('exhibitions').insert({name,edition_year:year,directory_url:url||null,directory_total:total?Number(total):null});setMsg(error?.message||'Exhibition saved');if(!error)await refresh()}
 async function addLead(e:React.FormEvent){e.preventDefault();if(!selected)return;const{error}=await db().from('exhibitors').insert({exhibition_id:selected,company_name:company.trim(),country:country||null,email:email||null,website:website||null,verification_status:'pending',participation_status:'directory_listing'});setMsg(error?.message||'Exhibitor saved');if(!error){setCompany('');setCountry('');setEmail('');setWebsite('');await refresh()}}
 async function saveDirectory(e:React.FormEvent){e.preventDefault();if(!selected)return;const v=directoryInput.trim();if(v){try{const u=new URL(v);if(u.protocol!=='https:')throw Error('Use HTTPS');}catch{setMsg('Enter a valid HTTPS directory URL');return}}setSavingDirectory(true);const{error}=await db().from('exhibitions').update({directory_url:v||null}).eq('id',selected);setSavingDirectory(false);setMsg(error?.message||'Directory URL saved');if(!error)await refresh()}
 async function exportAll(){try{const{data}=await db().auth.getSession();if(!data.session)throw Error('Please sign in');const r=await fetch('/api/export'+(selected?'?exhibition='+encodeURIComponent(selected):''),{headers:{Authorization:`Bearer ${data.session.access_token}`}});if(!r.ok)throw Error(await r.text());const blob=await r.blob();const a=document.createElement('a');const link=URL.createObjectURL(blob);a.href=link;a.download='HELIO_Exhibitor_Research.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(link),1000)}catch(e){setMsg((e as Error).message)}}
 if(loading)return <main className="auth">Loading…</main>;
 if(!session)return <main className="auth"><img className="login-logo" src="/helio-logo.png" alt="HELIO Advertising & Studio"/><h1>HELIO Intelligence</h1><p>Secure exhibition research workspace</p><Link className="button" href="/login">Staff sign in</Link></main>;
 const heading=menu.find(m=>m.id===module)?.label||'Dashboard';
 const picker=<section className="panel"><label><b>Selected exhibition</b><select style={{display:'block',width:'100%',padding:12,marginTop:8}} value={selected} onChange={e=>{setSelected(e.target.value);setQuery('');setCountryFilter('all');setStatusFilter('all')}}>{events.map(e=><option value={e.id} key={e.id}>{e.name} ({e.edition_year||'Year unknown'})</option>)}</select></label>{current?.discovery_start_date&&<p>Discovered dates: {current.discovery_start_date} – {current.discovery_end_date||'End not recorded'} · {current.date_verified?'Verified':'Not yet verified'}</p>}</section>;
 const leadsTable=<div className="tablewrap"><table><thead><tr><th>Company</th><th>Country</th><th>Website</th><th>Email</th><th>Verification</th><th>Official profile</th></tr></thead><tbody>{visible.map(l=><tr key={l.id}><td><b>{l.company_name}</b>{l.hall||l.stand?<small> · {l.hall||''} {l.stand||''}</small>:null}</td><td>{l.country||'—'}</td><td>{l.website?<a href={l.website} target="_blank" rel="noopener noreferrer">Website ↗</a>:'—'}</td><td>{l.email||'Not found'}</td><td><span className="pill">{l.verification_status}</span></td><td>{l.profile_url?<a href={l.profile_url} target="_blank" rel="noopener noreferrer">Profile ↗</a>:'—'}</td></tr>)}{visible.length===0&&<tr><td colSpan={6} className="empty">No matching exhibitors for this exhibition.</td></tr>}</tbody></table></div>;
 const filters=<div className="formgrid"><label>Find company, email, stand<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search exhibitors..."/></label><label>Country<select value={countryFilter} onChange={e=>setCountryFilter(e.target.value)}><option value="all">All countries</option>{countries.map(c=><option key={c}>{c}</option>)}</select></label><label>Contact / verification<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All exhibitors</option><option value="email">Has email</option><option value="no-email">Email missing</option><option value="verified">Verified</option><option value="pending">Pending</option><option value="directory_only">Directory only</option><option value="conflict">Conflict</option></select></label></div>;
 return <div className="shell"><aside><div className="brand"><img className="brand-logo" src="/helio-logo.png" alt="HELIO Advertising & Studio"/><small>EXHIBITION INTELLIGENCE</small></div><nav className="workspace-nav">{menu.filter(m=>m.id==='dashboard').map(m=><Link key={m.id} href={m.href} aria-current={module===m.id?'page':undefined} className={module===m.id?'active':''}>{m.label}</Link>)}{menuGroups.map(group=><details key={group.label} className="nav-group" open={group.ids.includes(module)||undefined}><summary>{group.label}</summary><div className="nav-group-items">{menu.filter(m=>group.ids.includes(m.id)).map(m=><Link key={m.id} href={m.href} aria-current={module===m.id?'page':undefined} className={module===m.id?'active':''}>{m.label}</Link>)}</div></details>)}</nav><div className="asidefoot">HELIO v3.0 · Opportunity Radar</div></aside><main><header><div><span className="eyebrow">HELIO / LEAD GENERATION</span><h1>{heading}</h1><p>Research exhibitors. Verify contacts. Build opportunities.</p></div><button className="ghost" onClick={async()=>{await db().auth.signOut();router.push('/login')}}>Sign out</button></header>
 {module==='dashboard'&&<SalesCommandCentre leads={leads} events={events}/>}
 {module==='global-search'&&<GlobalExhibitorSearch leads={leads} events={events}/>}
 {module==='discovery'&&<><ExhibitionDiscovery events={events}/><OpportunityRadar events={events} leads={leads}/></>}
 {module==='opportunity-radar'&&<OpportunityRadar events={events} leads={leads}/>}
 {module==='exhibitions'&&<><section className="panel"><h2>Exhibition Manager</h2><p>Import a schedule or add an exhibition manually. Discovered dates remain separate until verified.</p><ScheduleImport onImported={refresh}/><form className="formgrid" onSubmit={addEvent}><label>Exhibition name<input required value={name} onChange={e=>setName(e.target.value)}/></label><label>Edition year<input required type="number" value={year} onChange={e=>setYear(Number(e.target.value))}/></label><label>Directory URL<input type="url" value={url} onChange={e=>setUrl(e.target.value)}/></label><label>Directory total<input type="number" min="0" value={total} onChange={e=>setTotal(e.target.value)}/></label><button type="submit">+ Add exhibition</button></form></section>{picker}<section className="panel"><h2>Tracked exhibitions</h2><div className="eventlist">{events.map(e=><button key={e.id} className={selected===e.id?'selected':''} onClick={()=>setSelected(e.id)}>{e.name} · {e.edition_year||'—'}{e.discovery_start_date?<small> · {e.discovery_start_date} to {e.discovery_end_date||'—'}</small>:null}</button>)}</div></section></>}
 {module==='find-exhibitors'&&<>{picker}<section className="panel"><div className="panelhead"><div><h2>Identify exhibitors</h2><p>Search existing companies, identify missing contact details, and review official directory profiles.</p></div></div><div className="metrics"><div className="metric"><span>Identified</span><strong>{selectedLeads.length}</strong></div><div className="metric"><span>With email</span><strong>{selectedLeads.filter(l=>!!l.email).length}</strong></div><div className="metric"><span>Verified</span><strong>{selectedLeads.filter(l=>l.verification_status==='verified').length}</strong></div></div><form onSubmit={saveDirectory} className="formgrid"><label>Official exhibitor directory<input type="url" value={directoryInput} onChange={e=>setDirectoryInput(e.target.value)} placeholder="https://..."/></label><button type="submit" disabled={savingDirectory}>{savingDirectory?'Saving...':'Save directory URL'}</button>{current?.directory_url&&<a className="button" target="_blank" rel="noopener noreferrer" href={current.directory_url}>Open Official Directory ↗</a>}</form>{filters}<p>{visible.length} matching exhibitors · {selectedLeads.filter(l=>!l.email).length} missing email · {selectedLeads.filter(l=>l.outreach_opt_out).length} opted out</p>{leadsTable}</section><section className="panel"><h2>Import exhibitors</h2><p><Link className="button" href="/directory-finder">Open Automatic Exhibitor Import →</Link></p><p>Use the existing import tool for approved directory data. Importing is not an automatic web crawler.</p><LeadImport key={selected} exhibitionId={selected} onImported={refresh}/></section></>}
 {module==='leads'&&<>{picker}<section className="panel"><h2>Global Exhibitor Search</h2><GlobalExhibitorSearch leads={leads} events={events}/></section><section className="panel"><div className="panelhead"><div><h2>Exhibitor Database</h2><p>{visible.length} records in selected exhibition</p></div><button onClick={exportAll}>↓ Export selected exhibition Excel</button></div>{filters}{leadsTable}<h3>Add exhibitor (manual entry)</h3><form className="formgrid" onSubmit={addLead}><label>Company<input required value={company} onChange={e=>setCompany(e.target.value)}/></label><label>Country<input value={country} onChange={e=>setCountry(e.target.value)}/></label><label>Website<input type="url" value={website} onChange={e=>setWebsite(e.target.value)}/></label><label>Published business email<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><button disabled={!selected}>+ Save exhibitor</button></form></section><section className="panel"><LeadImport key={selected} exhibitionId={selected} onImported={refresh}/></section></>}
 {module==='qualification'&&<>{picker}<LeadQualification leads={selectedLeads} exhibitionId={selected}/></>}
 {module==='outreach'&&<>{picker}<OutreachCentre leads={selectedLeads} exhibitionId={selected}/></>}
 {module==='reports'&&<>{picker}<CampaignReporting leads={selectedLeads} exhibitionId={selected} exhibitionName={current?.name||''}/></>}
 {module==='pipeline'&&<>{picker}<SalesPipeline leads={selectedLeads} exhibitionId={selected}/></>}
 {module==='projects'&&<CustomerProjects leads={leads}/>}
 {module==='email-marketing'&&<>{picker}<EmailMarketing leads={selectedLeads} exhibitionId={selected}/><ResendTest/></>}
 {module==='campaigns'&&<CampaignManager leads={selectedLeads.filter(l=>!l.outreach_opt_out)}/>}
 {module==='lead-scoring'&&<>{picker}<LeadScoring leads={selectedLeads} eventName={current?.name||''} eventDate={current?.discovery_start_date} exhibitionId={selected}/><LeadQualification leads={selectedLeads} exhibitionId={selected}/></>}
 {module==='ai-assistant'&&<>{picker}<AISalesAssistant leads={selectedLeads} eventName={current?.name||''}/></>}
 {module==='research'&&<>{picker}<section className="panel"><h2>Evidence & Verification</h2><p><Link className="button" href="/evidence">Open Evidence Centre →</Link> <Link className="button" href="/auto-research">Automatic Profile Research →</Link></p></section><LeadResearchAssistant leads={selectedLeads} eventName={current?.name||''} exhibitionId={selected} onChanged={refresh}/><ResearchControl event={current} leads={selectedLeads} onChanged={refresh}/><section className="panel"><h2>Research Coverage</h2><p>Counts reflect saved records, not automated directory coverage.</p><div className="coverage"><div><span>Published directory total</span><strong>{current?.directory_total??'Not provided'}</strong></div><div><span>Saved records</span><strong>{selectedLeads.length}</strong></div><div><span>Difference</span><strong>{current?.directory_total!=null?Math.max(0,current.directory_total-selectedLeads.length):'Unknown'}</strong></div></div></section></>}
 {msg&&<div className="toast" role="status">{msg}<button onClick={()=>setMsg('')}>×</button></div>}</main></div>;
}
