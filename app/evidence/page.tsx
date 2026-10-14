'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {db} from '../../lib/db';

type Evidence={id:string;exhibition_name:string;exhibition_year:number;company_name:string;field_name:string;extracted_value:string|null;source_url:string;verification_status:string;reviewer_notes:string|null;checked_at:string};
const fields=['company_name','country','hall','stand','website','description','email','phone'];
const statuses=['pending_review','verified','conflicting','rejected','not_found'];
export default function EvidencePage(){
 const [records,setRecords]=useState<Evidence[]>([]),[events,setEvents]=useState<{name:string;edition_year:number}[]>([]);
 const [eventName,setEventName]=useState(''),[year,setYear]=useState(2026),[company,setCompany]=useState(''),[field,setField]=useState('website'),[value,setValue]=useState(''),[source,setSource]=useState(''),[quote,setQuote]=useState('');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[filter,setFilter]=useState('');
 async function load(){
  const s=db();const [a,b]=await Promise.all([s.from('helio_research_evidence').select('*').order('created_at',{ascending:false}).limit(500),s.from('exhibitions').select('name,edition_year').order('name')]);
  if(a.error)setMessage(a.error.message);else setRecords(a.data||[]);
  if(!b.error)setEvents(b.data||[]);
 }
 useEffect(()=>{let live=true;db().auth.getUser().then(({data})=>{if(live){setReady(!!data.user);if(data.user)void load()}});return()=>{live=false}},[]);
 async function add(e:React.FormEvent){
  e.preventDefault();setBusy(true);setMessage('');
  try{
   const s=db();const {data:{user},error:authError}=await s.auth.getUser();if(authError||!user)throw Error('Sign in first');
   const u=new URL(source.trim());if(!['https:','http:'].includes(u.protocol))throw Error('Enter a valid source URL');
   const {error}=await s.from('helio_research_evidence').insert({user_id:user.id,exhibition_name:eventName.trim(),exhibition_year:year,company_name:company.trim(),field_name:field,extracted_value:value.trim()||null,source_url:u.toString(),evidence_text:quote.trim()||null,verification_status:'pending_review'});
   if(error)throw error;setMessage('Evidence saved for review; not yet verified.');setValue('');setSource('');setQuote('');await load();
  }catch(err){setMessage((err as Error).message)}finally{setBusy(false)}
 }
 async function review(r:Evidence,status:string){
  if(status==='verified'&&!r.extracted_value?.trim()){setMessage('Cannot verify a missing value.');return}
  setBusy(true);const {error}=await db().from('helio_research_evidence').update({verification_status:status,updated_at:new Date().toISOString()}).eq('id',r.id);
  setMessage(error?.message||'Review updated. This does not automatically change the exhibitor record.');if(!error)await load();setBusy(false);
 }
 const shown=records.filter(r=>[r.company_name,r.exhibition_name,r.field_name,r.extracted_value||''].join(' ').toLowerCase().includes(filter.toLowerCase()));
 return <main style={{maxWidth:1250,margin:'auto',padding:24,fontFamily:'Arial,sans-serif'}}>
 <p><Link href="/">← HELIO dashboard</Link> · <Link href="/research">Research status</Link></p><h1>Evidence & Verification Centre</h1>
 <p>Record the exact source behind each exhibitor detail. A saved claim is not automatically verified. Human review is required.</p>
 {!ready?<p>Please sign in through the HELIO dashboard to use the Evidence Centre.</p>:<>
 <section className="panel"><h2>Add research evidence</h2>
 <form onSubmit={add} className="formgrid">
 <label>Exhibition<select required value={eventName+'|'+year} onChange={e=>{const i=e.target.value.lastIndexOf('|');setEventName(e.target.value.slice(0,i));setYear(Number(e.target.value.slice(i+1)))}}><option value="|2026">Choose exhibition</option>{events.map((e,i)=><option key={i} value={e.name+'|'+e.edition_year}>{e.name} ({e.edition_year})</option>)}</select></label>
 <label>Company name<input required value={company} onChange={e=>setCompany(e.target.value)}/></label>
 <label>Field<select value={field} onChange={e=>setField(e.target.value)}>{fields.map(f=><option key={f}>{f}</option>)}</select></label>
 <label>Extracted value<input value={value} onChange={e=>setValue(e.target.value)} placeholder="Leave blank if not found"/></label>
 <label>Source URL<input type="url" required value={source} onChange={e=>setSource(e.target.value)} placeholder="https://..."/></label>
 <label>Supporting text / notes<input value={quote} onChange={e=>setQuote(e.target.value)} placeholder="Exact evidence or explanation"/></label>
 <button disabled={busy||!eventName||!company.trim()||!source.trim()} type="submit">Save evidence</button>
 </form></section>
 <section className="panel"><h2>Evidence review ({shown.length})</h2><label>Search evidence<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Company, exhibition or field"/></label>
 <div className="tablewrap"><table><thead><tr><th>Company / exhibition</th><th>Claim</th><th>Source</th><th>Status</th><th>Review action</th></tr></thead><tbody>
 {shown.map(r=><tr key={r.id}><td><b>{r.company_name}</b><small style={{display:'block'}}>{r.exhibition_name} ({r.exhibition_year})</small></td><td>{r.field_name}: {r.extracted_value||'Not found'}</td><td><a href={r.source_url} target="_blank" rel="noopener noreferrer">Inspect source ↗</a></td><td>{r.verification_status}</td><td><select disabled={busy} aria-label={'Review '+r.company_name+' '+r.field_name} value={r.verification_status} onChange={e=>void review(r,e.target.value)}>{statuses.map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select></td></tr>)}
 {!shown.length&&<tr><td colSpan={5}>No evidence records found.</td></tr>}</tbody></table></div></section>
 {message&&<p role="status">{message}</p>}</>}
 </main>
}