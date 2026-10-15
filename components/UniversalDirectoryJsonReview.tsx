"use client";
import { useEffect, useMemo, useState } from "react";
import { db } from "../lib/db";
import { inspectDirectoryJson, type DirectoryReview } from "../lib/exhibition-directory-adapters";

export default function UniversalDirectoryJsonReview({exhibitionId}:{exhibitionId:string}) {
  const [report, setReport] = useState<DirectoryReview | null>(null);
  const [finderBusy,setFinderBusy]=useState(false);
  const [finder,setFinder]=useState<{exhibition:string;editionYear:number;savedDirectoryUrl:string|null;searchLinks:{query:string;url:string}[];notice:string}|null>(null);
  async function findDirectory(){
    setFinderBusy(true);setError("");setFinder(null);
    try {
      const {data:{session}}=await db().auth.getSession();
      if(!session) throw Error("Please sign in first.");
      const response=await fetch("/api/exhibitors/find-directory",{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
        body:JSON.stringify({exhibitionId})
      });
      const result=await response.json();
      if(!response.ok) throw Error(result.error||"Directory search preparation failed");
      setFinder(result);
    }catch(e){setError(e instanceof Error?e.message:"Directory finder failed");}
    finally{setFinderBusy(false);}
  }

  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [autoBusy,setAutoBusy] = useState(false);
  const [inspectBusy,setInspectBusy]=useState(false);
  const [inspection,setInspection]=useState<{platform:string;status:string;count:number;message:string;coverage?:string;enriched?:number;profiles?:{company_name:string;country:string;hall:string;stand:string;profile_url:string;website?:string;description?:string;profile_status?:string}[]}|null>(null);
  async function inspectOfficialDirectory(){
    setInspectBusy(true);setError("");setInspection(null);
    try {
      const {data:{session}}=await db().auth.getSession();
      if (!session) throw Error("Please sign in first.");
      const response=await fetch("/api/exhibitors/preview-directory",{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
        body:JSON.stringify({exhibitionId})
      });
      const result=await response.json();
      if (!response.ok) {
        setInspection({platform:"Unverified",status:result.extractionStatus||"blocked",count:0,message:result.error||"Directory inspection failed"});
        return;
      }
      setInspection({
        platform:result.platformDetection?.platform||"unknown",
        status:result.extractionStatus||"unknown",
        count:Number(result.count||0),
        message:result.extractionDiagnostic||"Inspection completed. All candidates require manual verification.",
        coverage:result.coverage?.note||"Directory coverage has not been verified.",
        enriched:Number(result.enrichedCount||0),
        profiles:Array.isArray(result.enrichedProfiles)&&result.enrichedProfiles.length?result.enrichedProfiles:result.exhibitors||[]
      });
    } catch(e){setError(e instanceof Error?e.message:"Inspection failed");}
    finally{setInspectBusy(false);}
  }
  function downloadInspectionCsv(){
    if(!inspection?.profiles?.length)return;
    const keys=["company_name","country","hall","stand","website","description","profile_url","profile_status"] as const;
    const quote=(value:string)=>'"'+value.replace(/"/g,'""')+'"';
    const csv=[keys.join(","),...inspection.profiles.map(profile=>keys.map(key=>quote(String(profile[key]||""))).join(","))].join("\r\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="HELIO_exhibitor_candidates_review.csv";a.click();URL.revokeObjectURL(url);
  }
  const [editionStatus,setEditionStatus] = useState<{label:string;note:string;canAutomaticallyRead:boolean;selectedYear:number;status:string}|null>(null);
  useEffect(()=>{
    let active=true;
    setEditionStatus(null);
    if (!exhibitionId) return;
    void (async()=>{
      try {
        const {data:{session}}=await db().auth.getSession();
        if (!session) return;
        const response=await fetch("/api/exhibitors/edition-status",{
          method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
          body:JSON.stringify({exhibitionId})
        });
        if (!response.ok) return;
        const result=await response.json();
        if (active) setEditionStatus(result);
      } catch { /* Status unavailable; never assume verified */ }
    })();
    return ()=>{active=false;};
  },[exhibitionId]);
  async function autoRead() {
    setAutoBusy(true);setError("");setReport(null);
    try {
      const {data:{session}}=await db().auth.getSession();
      if (!session) throw new Error("Please sign in first.");
      const response=await fetch("/api/exhibitors/read-rx-algolia",{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
        body:JSON.stringify({exhibitionId})
      });
      const result=await response.json();
      if (!response.ok) throw new Error(result.error||"Automatic reader unavailable");
      setReport(result as DirectoryReview);
      setFiles(["Automatic read — "+result.fetchedPages+" pages"]);
    } catch(e) {setError(e instanceof Error?e.message:"Automatic read failed");}
    finally {setAutoBusy(false);}
  }

  async function onFiles(chosen: FileList | null) {
    if (!chosen?.length) return;
    setError(""); setReport(null);
    try {
      if (chosen.length > 20) throw new Error("Select no more than 20 JSON files.");
      const pages: unknown[] = [];
      for (const file of Array.from(chosen)) {
        if (file.size > 15_000_000) throw new Error(file.name + " exceeds the 15 MB file limit.");
        const raw = JSON.parse(await file.text());
        if (Array.isArray(raw)) pages.push(...raw);
        else if (Array.isArray(raw.pages)) pages.push(...raw.pages);
        else pages.push(raw);
      }
      const result = inspectDirectoryJson(pages);
      setFiles(Array.from(chosen).map(f => f.name)); setReport(result);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to read JSON."); }
  }
  const visible = useMemo(() => (report?.companies || []).filter(c =>
    [c.company_name,c.country,c.stand,c.email].some(v => v.toLowerCase().includes(filter.toLowerCase()))
  ), [report,filter]);
  function downloadCsv() {
    if (!report) return;
    const keys = ["source_id","company_name","display_name","country","hall","stand","website","email","phone","description","profile_url","edition_id","source_platform"] as const;
    const quote = (v: string) => '"' + v.replace(/"/g,'""') + '"';
    const csv = [keys.join(","),...report.companies.map(c => keys.map(k => quote(c[k])).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="HELIO_directory_review.csv"; a.click();
    URL.revokeObjectURL(url);
  }
  return <details style={{marginBottom:16,padding:12,border:"1px solid #ddd",borderRadius:8}}>
    <summary style={{cursor:"pointer",fontWeight:600}}>Universal Exhibition JSON Reader — review only</summary>
    <p>Upload one or more JSON pages from an authorized official exhibitor directory. The reader supports RX Global JSON and explicitly normalized MapYourShow/ExpoPlatform JSON. Inspect an official directory to detect its platform and preview public HTML profile candidates. Nothing is imported automatically.</p>
    <div style={{padding:12,marginBottom:12,border:"1px solid #ddd",borderRadius:6}}>
      <strong>Universal directory source finder — Stage 1</strong>
      <p>Generate official-directory searches for the selected exhibition and year, even when no directory URL is saved. Search results must be reviewed before reading or importing.</p>
      <button type="button" disabled={!exhibitionId||finderBusy} onClick={()=>void findDirectory()}>{finderBusy?"Preparing directory search...":"Find official directory sources"}</button>
      {finder && <div role="status" style={{marginTop:10}}>
        <p><strong>{finder.exhibition} ({finder.editionYear})</strong> — Saved directory: {finder.savedDirectoryUrl||"None"}</p>
        <ul>{finder.searchLinks.map(link=><li key={link.query}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.query}</a></li>)}</ul>
        <p>{finder.notice}</p>
      </div>}
    </div>
    {editionStatus && <div role="status" style={{padding:10,marginBottom:12,background:"#f5f6f8",borderRadius:6}}><strong>Edition verification ({editionStatus.selectedYear}): {editionStatus.label}</strong><p>{editionStatus.note}</p></div>}
    <p><button type="button" disabled={!exhibitionId||inspectBusy} onClick={()=>void inspectOfficialDirectory()}>{inspectBusy?"Inspecting official directory...":"Detect directory platform and preview candidates"}</button></p>
    {inspection && <div role="status" style={{padding:10,border:"1px solid #ddd",borderRadius:6,marginBottom:12}}>
      <strong>Platform: {inspection.platform} | Status: {inspection.status} | Candidate profiles: {inspection.count}</strong>
      <p>{inspection.message}</p>
      <p><strong>Coverage:</strong> {inspection.coverage||"Unknown"} </p>
      <p><strong>Profiles enriched for review:</strong> {inspection.enriched??0} (not independently verified)</p>
      {inspection.profiles?.length ? <div>
        <button type="button" onClick={downloadInspectionCsv}>Download extracted candidates CSV (review only)</button>
        <div style={{maxHeight:340,overflow:"auto",marginTop:10}}>
          <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
            <thead><tr>{["Company","Website","Description","Profile status"].map(label=><th key={label} style={{textAlign:"left",padding:6,borderBottom:"1px solid #ddd"}}>{label}</th>)}</tr></thead>
            <tbody>{inspection.profiles.map((profile,index)=><tr key={profile.profile_url+index}>
              <td style={{padding:6}}><a href={profile.profile_url} target="_blank" rel="noopener noreferrer">{profile.company_name}</a></td>
              <td style={{padding:6}}>{profile.website?<a href={profile.website} target="_blank" rel="noopener noreferrer">Website</a>:"—"}</td>
              <td style={{padding:6}}>{profile.description||"—"}</td>
              <td style={{padding:6}}>{profile.profile_status||"candidate only"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>:null}
      <p>Read-only inspection. Candidates are not verified exhibitors and nothing was imported.</p>
    </div>}
    <p><button type="button" disabled={!exhibitionId||autoBusy||!editionStatus?.canAutomaticallyRead} onClick={()=>void autoRead()}>{autoBusy?"Reading pages...":"Read supported directory automatically"}</button></p>
    {!editionStatus?.canAutomaticallyRead && <p>Automatic reading is paused until an authorized, edition-specific source is verified. You may still review JSON files manually.</p>}
    <input type="file" accept=".json,.txt,application/json" multiple onChange={e=>void onFiles(e.target.files)} aria-label="Upload directory JSON pages" />
    {error && <p role="alert" style={{color:"#b42318"}}>{error}</p>}
    {report && <div>
      <p><strong>Platform:</strong> {report.platform} | <strong>Unique companies:</strong> {report.companies.length} | <strong>Reported:</strong> {report.reported_total ?? "Unknown"} | <strong>Import:</strong> Disabled</p>
      <p><strong>Edition IDs:</strong> {report.edition_ids.join(", ") || "Unknown"}</p>
      <p><strong>Files:</strong> {files.join(", ")}</p>
      {report.warnings.map((w,i)=><p key={i} style={{color:"#8a4b00"}}>{w}</p>)}
      <button type="button" onClick={downloadCsv}>Download review CSV</button>
      <p><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search company, country, stand or email" aria-label="Search directory review" /></p>
      <div style={{maxHeight:420,overflow:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr>{["Company","Country","Stand","Website","Email"].map(h=><th key={h} style={{textAlign:"left",padding:6,borderBottom:"1px solid #ddd"}}>{h}</th>)}</tr></thead>
          <tbody>{visible.map(c=><tr key={c.source_platform+":"+c.source_id}>
            <td style={{padding:6}}>{c.company_name}</td><td style={{padding:6}}>{c.country}</td><td style={{padding:6}}>{c.stand}</td>
            <td style={{padding:6}}>{c.website ? <a href={c.website} target="_blank" rel="noopener noreferrer">Website</a> : "—"}</td>
            <td style={{padding:6}}>{c.email || "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>}
  </details>;
}
