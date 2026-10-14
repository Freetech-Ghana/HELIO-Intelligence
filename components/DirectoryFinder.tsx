"use client";
import {useState} from 'react';
import {db} from '../lib/db';
type Candidate={url:string;label:string;score:number};
export default function DirectoryFinder({exhibitionId,onSaved}:{exhibitionId:string;onSaved:()=>Promise<void>}){
 const [manualUrl,setManualUrl]=useState('');
 const [busy,setBusy]=useState(false),[results,setResults]=useState<Candidate[]>([]),[error,setError]=useState(''),[info,setInfo]=useState('');
 async function discover(){
  if(!exhibitionId)return;
  setBusy(true);setError('');setInfo('');setResults([]);
  try{
   const {data:{session}}=await db().auth.getSession();
   if(!session)throw Error('Sign in again');
   const r=await fetch('/api/exhibitors/discover-directory',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({exhibitionId})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'Discovery failed');
   setResults(data.candidates||[]);
   setInfo((data.candidates||[]).length?'Review the official source before saving. No companies have been imported.':'No approved directory links found. Use manual directory entry.');
   if(data.errors?.length)setError(data.errors.join('; '));
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
  {results.length>0&&<div className="tablewrap"><table><thead><tr><th>Suggested official directory</th><th>Review</th><th>Action</th></tr></thead><tbody>{results.map(c=><tr key={c.url}><td>{c.label||'Directory candidate'}</td><td><a href={c.url} target="_blank" rel="noopener noreferrer">Open source ↗</a></td><td><button type="button" disabled={busy} onClick={()=>save(c.url)}>Save reviewed link</button></td></tr>)}</tbody></table></div>}
 </div>;
}
