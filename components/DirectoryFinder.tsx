"use client";
import {useState} from 'react';
import {db} from '../lib/db';
type Candidate={url:string;label:string;score:number;status?:string;edition?:number|null};
export default function DirectoryFinder({exhibitionId,onSaved}:{exhibitionId:string;onSaved:()=>Promise<void>}){
 const [manualUrl,setManualUrl]=useState('');
 const [discoveryStatus,setDiscoveryStatus]=useState('');
 const [diagnostic,setDiagnostic]=useState('');
 const [searchSuggestions,setSearchSuggestions]=useState<string[]>([]);
 const [busy,setBusy]=useState(false),[results,setResults]=useState<Candidate[]>([]),[error,setError]=useState(''),[info,setInfo]=useState('');
 async function discover(){
  if(!exhibitionId)return;
  setBusy(true);setError('');setInfo('');setResults([]);setDiscoveryStatus('');setDiagnostic('');setSearchSuggestions([]);
  try{
   const {data:{session}}=await db().auth.getSession();
   if(!session)throw Error('Sign in again');
   const r=await fetch('/api/exhibitors/discover-directory',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({exhibitionId})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'Discovery failed');
   setResults(data.candidates||[]);setSearchSuggestions(data.suggestedSearches||[]);
   setInfo(`Checked ${data.pagesChecked??0} official pages across ${(data.checkedHosts||[]).length} approved hosts. ${(data.candidates||[]).length} directory candidates found. No exhibitors imported.`);
   const labels:Record<string,string>={current_directory_candidate:'Current-edition directory candidate found — verify before saving',current_exhibitor_section_found:'2026 exhibitor section found on the official event website; a complete directory URL has not been confirmed',historical_directory_only:'Only historical directory candidates found; do not import into the selected edition',current_directory_not_found:'No current-edition directory identified from the checked official pages'};
   setDiscoveryStatus(labels[data.discoveryStatus]||'Directory discovery completed; review source evidence.');
   if(!(data.candidates||[]).length)setDiagnostic('No directory found on supported sources. The event may use a separate platform or JavaScript directory. You can paste a reviewed official directory URL below, but unsupported hosts require a dedicated adapter.');
   if(data.errors?.length)setError(data.errors.join('; '));
   if(!(data.candidates||[]).length)setDiagnostic('No supported current-edition directory found. The official website may have a JavaScript-loaded directory, an unsupported host, or no published exhibitor list. This does not mean the exhibition has no exhibitors.');
   else if(!(data.candidates||[]).some((x:Candidate)=>x.status!=='historical'))setDiagnostic('Only historical directories were found. Do not import previous-year companies as current exhibitors.');
  }catch(e){setError(e instanceof Error?e.message:'Discovery failed')}finally{setBusy(false)}
 }
 async function save(url:string){
  let parsed:URL;
  try{parsed=new URL(url.trim());if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('Invalid URL')}catch{setError('Enter a valid HTTPS directory URL.');return}
  if(!confirm('Have you verified this is the official exhibitor directory for the selected exhibition?'))return;
  setBusy(true);setError('');
  const {error}=await db().from('exhibitions').update({directory_url:parsed.href}).eq('id',exhibitionId);
  setBusy(false);
  if(error)setError(error.message);else{setInfo('Directory URL saved. Exhibitor importing remains a separate review step.');await onSaved()}
 }
 return <div style={{margin:'16px 0'}}>
  <h3>Automatic official directory search (beta)</h3>
  <p>Find possible directory links from approved official sources. Review each link before saving.</p>
  <button type="button" disabled={busy||!exhibitionId} onClick={discover}>{busy?'Searching...':'Find official directory'}</button>
  {discoveryStatus&&<p role="status" style={{fontWeight:700}}>{discoveryStatus}</p>}
  {diagnostic&&<p role="status">{diagnostic}</p>}
  {searchSuggestions.length>0&&<div><h4>Search this exhibition edition</h4><p>These are manual search links, not verified directory results. Check the organizer and exhibition year before saving.</p>{searchSuggestions.map(q=><p key={q}><a href={'https://www.google.com/search?q='+encodeURIComponent(q)} target="_blank" rel="noopener noreferrer">{q} ↗</a></p>)}</div>}
  {error&&<p role="alert">{error}</p>}
  {info&&<p role="status">{info}</p>}
  <div style={{marginTop:18,padding:14,border:'1px solid #ccc',borderRadius:8}}>
   <h4>Enter directory URL manually</h4>
   <p>Paste the official exhibitor list or directory page for this exhibition, not a general venue or event homepage. Review it before saving.</p>
   <label htmlFor="manual-directory-url">Official exhibitor directory URL</label>
   <input id="manual-directory-url" type="url" value={manualUrl} onChange={e=>setManualUrl(e.target.value)} placeholder="https://official-event-site.com/exhibitors" style={{display:'block',width:'100%',padding:10,margin:'8px 0'}}/>
   <button type="button" disabled={busy||!exhibitionId||!manualUrl.trim()} onClick={()=>save(manualUrl.trim())}>Save reviewed directory URL</button>
   <p style={{fontSize:13}}>Saving a link does not verify its contents or guarantee automated extraction. Unsupported hosts may require a separate source adapter.</p>
  </div>
  {results.length>0&&<div className="tablewrap"><table><thead><tr><th>Suggested official directory</th><th>Review</th><th>Action</th></tr></thead><tbody>{results.map(c=><tr key={c.url}><td>{c.label||'Directory candidate'} {c.status==='historical'?'(Historical — wrong edition)':c.status==='unverified'?'(Edition unverified)':''}</td><td><a href={c.url} target="_blank" rel="noopener noreferrer">Open source ↗</a></td><td><button type="button" disabled={busy||c.status==='historical'} onClick={()=>save(c.url)}>{c.status==='historical'?'Historical only':'Save reviewed link'}</button></td></tr>)}</tbody></table></div>}
 </div>;
}
