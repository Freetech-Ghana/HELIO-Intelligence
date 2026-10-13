"use client";
import {useState} from "react";
import * as XLSX from "xlsx";
import {db} from "../lib/db";

type Row=Record<string,string>;
const aliases:Record<string,string[]>={
 company_name:['company_name','company','exhibitor','exhibitor_name','company name','company name (as ism)','companyname','name'],
 country:['country','country (as ism)','location country'],
 website:['website','company_website','official website','url'],
 email:['email','general email','business email'],
 phone:['phone','telephone','mobile'],
 hall:['hall','hall name'],stand:['stand','stand_number','booth','booth number'],
 profile_url:['profile_url','profile','exhibitor profile','ism profile','directory_url'],
 description:['description','about'],
 contact_source_url:['contact_source_url','contact_source','contact source','source_url','ism list source'],
 notes:['notes','remarks'],outreach_opt_out:['outreach_opt_out','opt_out','do_not_contact']
};
const norm=(s:string)=>s.toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
function findField(keys:string[],field:string){const options=(aliases[field]||[]).map(norm);return keys.find(k=>options.includes(norm(k)))||'';}
function canonical(row:Row,mapping:Record<string,string>):Row{
 const r:Row={};for(const field of Object.keys(aliases)){const key=mapping[field];r[field]=key?String(row[key]??'').trim():'';}
 const audit=['Record ID','Source Page','Exhibitor Type','Sales / Export Email','Address','Contact Source','Roster QA Status','Contact Verification','Verified / Checked On'];
 const extras=audit.map(label=>{const key=Object.keys(row).find(k=>norm(k)===norm(label));return key&&String(row[key]??'').trim()?`${label}: ${String(row[key]).trim()}`:''}).filter(Boolean);
 r.notes=[r.notes,...extras].filter(Boolean).join(' | ');
 return r;
}
function keyFor(r:Row){if(r.profile_url)return 'url:'+r.profile_url.toLowerCase().replace(/\/$/,'');return 'name:'+norm(r.company_name)+'|'+norm(r.country)+'|'+norm(r.stand);}
function value(x:string){return x.trim()||null}
function validUrl(x:string){if(!x)return true;try{const u=new URL(x);return u.protocol==='https:'||u.protocol==='http:'}catch{return false}}
export default function LeadImport({exhibitionId,onImported}:{exhibitionId:string,onImported:()=>Promise<void>}){
 const [rawRows,setRawRows]=useState<Row[]>([]),[headers,setHeaders]=useState<string[]>([]),[mapping,setMapping]=useState<Record<string,string>>({}),[filename,setFilename]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false);
 const rows=rawRows.map(r=>canonical(r,mapping));
 async function readFile(file:File){setMessage('Reading file…');setRawRows([]);setHeaders([]);setMapping({});setFilename(file.name);setConsent(false);try{
  if(!/\.(csv|xlsx|xls)$/i.test(file.name))throw Error('Choose a CSV, XLSX or XLS file.');
  if(file.size>12*1024*1024)throw Error('Maximum file size is 12 MB.');
  const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});const sheet=workbook.Sheets[workbook.SheetNames[0]];
  if(!sheet)throw Error('The workbook has no sheets.');
  const raw=XLSX.utils.sheet_to_json<Row>(sheet,{defval:'',raw:false});
  if(!raw.length)throw Error('No data rows found.');
  if(raw.length>10000)throw Error('Maximum 10,000 rows per file. Split larger files.');
  const keys=Array.from(new Set(raw.flatMap(r=>Object.keys(r))));const detected=Object.fromEntries(Object.keys(aliases).map(f=>[f,findField(keys,f)]));
  setRawRows(raw);setHeaders(keys);setMapping(detected);setMessage(`Ready to review ${raw.length} rows from ${workbook.SheetNames[0]}. Check column mapping before importing.`);
 }catch(e){setMessage(e instanceof Error?e.message:String(e))}}
 async function importRows(){setBusy(true);let added=0,skipped=0,failed=0;const errors:string[]=[];try{
  if(!exhibitionId)throw Error('Select an exhibition first.');if(!mapping.company_name)throw Error('Select the company name column.');if(!consent)throw Error('Confirm that you are authorized to import this list.');
  const s=db();const {data:{user},error:authError}=await s.auth.getUser();if(authError||!user)throw Error('Sign in first.');
  const {data:event,error:eventError}=await s.from('exhibitions').select('id').eq('id',exhibitionId).single();if(eventError||!event)throw Error('Selected exhibition could not be found.');
  // Paginate existing entries; PostgREST typically caps individual SELECT responses.
  const known=new Set<string>();let offset=0;
  while(true){const {data,error}=await s.from('exhibitors').select('company_name,country,stand,profile_url').eq('exhibition_id',exhibitionId).range(offset,offset+499);if(error)throw error;
   for(const r of data||[])known.add(keyFor({company_name:r.company_name||'',country:r.country||'',stand:r.stand||'',profile_url:r.profile_url||''}));
   if(!data||data.length<500)break;offset+=500;
  }
  for(let i=0;i<rows.length;i++){
   const r=rows[i];if(!r.company_name||!validUrl(r.profile_url)||!validUrl(r.website)||!validUrl(r.contact_source_url)){skipped++;continue}
   const key=keyFor(r);if(known.has(key)){skipped++;continue}
   const payload={owner_id:user.id,exhibition_id:exhibitionId,company_name:r.company_name,country:value(r.country),website:value(r.website),email:value(r.email),phone:value(r.phone),hall:value(r.hall),stand:value(r.stand),profile_url:value(r.profile_url),description:value(r.description),contact_source_url:value(r.contact_source_url),verification_status:'pending',participation_status:'directory_listing',outreach_opt_out:/^(yes|true|1)$/i.test(r.outreach_opt_out),notes:[value(r.notes),`Imported from ${filename}; source and contacts require verification`].filter(Boolean).join(' | ')};
   const {error}=await s.from('exhibitors').insert(payload);
   if(error){failed++;if(errors.length<4)errors.push(`Row ${i+2}: ${error.message}`)}else{added++;known.add(key)}
   if(i%25===0)setMessage(`Importing ${i+1}/${rows.length}… added ${added}, skipped ${skipped}, errors ${failed}`);
  }
  setMessage(`Finished: ${added} added, ${skipped} skipped, ${failed} errors. ${errors.join(' | ')}`);await onImported();
 }catch(e){setMessage(`Stopped: ${e instanceof Error?e.message:String(e)}. Added ${added} before stopping.`)}finally{setBusy(false)}}
 return <div className="scheduleimport"><h3>Universal Exhibitor Import Centre</h3><p>Select any exhibition above, then upload a CSV or Excel workbook. The first sheet is read. Supported columns include company, country, website, email, phone, hall, stand, profile, description, contact_source and opt_out. Missing profile links are allowed; duplicate matching then uses company + country + stand.</p>
 <input type="file" accept=".csv,.xlsx,.xls" disabled={busy||!exhibitionId} onChange={e=>{const f=e.target.files?.[0];if(f)void readFile(f);e.currentTarget.value=''}}/>
 {rawRows.length>0&&<><h4>Column matching</h4><p>Confirm the detected headings or choose the correct column manually.</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:10,marginBottom:14}}>{Object.keys(aliases).map(field=><label key={field} style={{display:'grid',gap:4}}><span>{field.replace(/_/g,' ')}{field==='company_name'?' *':''}</span><select value={mapping[field]||''} disabled={busy} onChange={e=>{setMapping(old=>({...old,[field]:e.target.value}));setConsent(false)}}><option value=''>Not mapped</option>{headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>)}</div>{!mapping.company_name&&<p role='alert'>Choose the company name column to continue.</p>}<p><b>Preview:</b> {rows.length} rows · {rows.filter(r=>!!r.company_name).length} with company names · {rows.filter(r=>!!r.profile_url).length} with profile links</p><div className="tablewrap"><table><thead><tr><th>Company</th><th>Country</th><th>Stand</th><th>Profile</th></tr></thead><tbody>{rows.slice(0,8).map((r,i)=><tr key={i}><td>{r.company_name||'Missing'}</td><td>{r.country||'—'}</td><td>{r.stand||'—'}</td><td>{r.profile_url?'Provided':'Not provided'}</td></tr>)}</tbody></table></div><label style={{display:'block',margin:'12px 0'}}><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/> I am authorized to use this data for this exhibition and will verify contact details before outreach.</label><button type="button" disabled={busy||!consent||!exhibitionId||!mapping.company_name} onClick={()=>void importRows()}>{busy?'Importing…':`Import ${rows.length} rows into selected exhibition`}</button></>}
 <p role="status">{message||'Choose an exhibition to enable file upload.'}</p></div>
}
