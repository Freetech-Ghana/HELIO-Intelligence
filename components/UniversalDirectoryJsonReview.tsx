"use client";
import { useMemo, useState } from "react";
import { db } from "../lib/db";
import { inspectDirectoryJson, type DirectoryReview } from "../lib/exhibition-directory-adapters";

export default function UniversalDirectoryJsonReview({exhibitionId}:{exhibitionId:string}) {
  const [report, setReport] = useState<DirectoryReview | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [autoBusy,setAutoBusy] = useState(false);
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
    <p>Upload one or more JSON pages from an authorized official exhibitor directory. The adapter recognizes supported directory platforms; it never imports automatically.</p>
    <p><button type="button" disabled={!exhibitionId||autoBusy} onClick={()=>void autoRead()}>{autoBusy?"Reading pages...":"Read supported directory automatically"}</button></p>
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
