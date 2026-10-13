"use client";
import {useState} from "react";
import {db} from "../lib/db";
import schedule from "../data/helio-exhibitions.json";
export default function ScheduleImport({onImported}:{onImported:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[result,setResult]=useState("");
 async function run(){setBusy(true);setResult("");try{
  const s=db();const {data:{user},error:authError}=await s.auth.getUser();if(authError||!user)throw Error("Sign in first");
  const {data:existing,error:readError}=await s.from("exhibitions").select("source_number").eq("source_document","Dubai Exhibition - Helio Advertising - 1Sep2026.pdf");if(readError)throw readError;
  const have=new Set((existing||[]).map(x=>x.source_number));const missing=schedule.filter(x=>!have.has(x.source_number));
  let inserted=0;for(let i=0;i<missing.length;i+=50){const batch=missing.slice(i,i+50).map(x=>({owner_id:user.id,name:x.name,edition_year:x.edition_year,source_number:x.source_number,source_date_text:x.date_text,hall:x.hall,venue:x.venue,source_document:"Dubai Exhibition - Helio Advertising - 1Sep2026.pdf",source_page:x.source_page,date_verified:false,research_status:"not_started"}));const {error}=await s.from("exhibitions").insert(batch);if(error)throw error;inserted+=batch.length;}
  setResult(`Imported ${inserted} new entries; ${have.size} already present. Source entries: ${schedule.length}. Dates not independently verified.`);await onImported();
 }catch(e){setResult(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 return <div className="scheduleimport"><button type="button" disabled={busy} onClick={run}>{busy?"Importing…":"Import HELIO PDF schedule (79 entries)"}</button><p>{result||"Imports the source schedule once per numbered entry. Run again safely to resume an interrupted import."}</p></div>
}
