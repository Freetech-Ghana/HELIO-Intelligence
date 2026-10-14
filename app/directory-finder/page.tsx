"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {db} from '../../lib/db';
import DirectoryFinder from '../../components/DirectoryFinder';
import ExhibitorReviewPreview from '../../components/ExhibitorReviewPreview';
type Event={id:string;name:string;edition_year:number;directory_url:string|null};
export default function DirectoryFinderPage(){
 const [events,setEvents]=useState<Event[]>([]),[selected,setSelected]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(true);
 async function refresh(){
  const {data,error}=await db().from('exhibitions').select('id,name,edition_year,directory_url').order('name');
  if(error)setMessage(error.message);
  else {setEvents((data||[]) as Event[]);setSelected(v=>v||(data?.[0]?.id||''))}
 }
 useEffect(()=>{db().auth.getSession().then(async({data})=>{if(!data.session)setMessage('Please sign in first');else await refresh();setLoading(false)})},[]);
 const current=events.find(e=>e.id===selected);
 return <main style={{maxWidth:1000,margin:'24px auto',padding:24}}>
  <p><Link href="/find-exhibitors">← Back to Find Exhibitors</Link></p>
  <h1>Automatic Directory Finder · v2.1 beta</h1>
  <p>Search approved official event sources for exhibitor directories. Review suggestions before saving.</p>
  {loading?<p>Loading...</p>:<><label>Exhibition <select value={selected} onChange={e=>setSelected(e.target.value)} style={{display:'block',width:'100%',padding:12,marginTop:8}}>{events.map(e=><option key={e.id} value={e.id}>{e.name} ({e.edition_year||'Year unknown'})</option>)}</select></label>
  {current?.directory_url&&<p>Saved directory: <a href={current.directory_url} target="_blank" rel="noopener noreferrer">{current.directory_url}</a></p>}
  <DirectoryFinder exhibitionId={selected} onSaved={refresh}/>
  </>}
  {message&&<p role="alert">{message}</p>}
  <ExhibitorReviewPreview exhibitionId={selected} />
<p>Exhibitor extraction and bulk importing are not enabled in this beta. Continue using the reviewed CSV import tool.</p>
 </main>;
}
