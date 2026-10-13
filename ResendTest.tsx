'use client';
import {useState} from 'react';
import {db} from '../lib/db';
export default function ResendTest(){
 const [subject,setSubject]=useState('HELIO Intelligence v1.6 — Resend test');
 const [message,setMessage]=useState('This is a secure test email from HELIO Intelligence. No marketing campaign was sent.');
 const [busy,setBusy]=useState(false),[result,setResult]=useState('');
 async function send(){setBusy(true);setResult('');try{
  const {data:{session}}=await db().auth.getSession();if(!session)throw new Error('Please sign in again');
  const r=await fetch('/api/email/test',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({subject,message})});
  const j=await r.json();if(!r.ok)throw new Error(j.error||'Test failed');setResult(`Accepted by Resend. Message ID: ${j.id}. Check your inbox and Resend dashboard for delivery.`);
 }catch(e){setResult(e instanceof Error?e.message:'Test failed')}finally{setBusy(false)}}
 return <section className="panel" id="resend-test"><h2>Resend — secure test sending</h2><p>Test mode only. This sends solely to the verified account email configured in RESEND_TEST_RECIPIENT. No exhibitor or campaign emails are sent.</p><div className="formgrid"><label>Test subject<input value={subject} maxLength={180} onChange={e=>setSubject(e.target.value)}/></label></div><label>Test message<textarea rows={4} value={message} maxLength={5000} onChange={e=>setMessage(e.target.value)}/></label><p><button type="button" disabled={busy||!subject.trim()||!message.trim()} onClick={send}>{busy?'Sending…':'Send one test email'}</button></p>{result&&<p role="status">{result}</p>}</section>
}
