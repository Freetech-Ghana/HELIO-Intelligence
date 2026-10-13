"use client";
import {useState} from 'react';import {db} from '../lib/db';
type Lead={id:string;company_name:string;email:string|null;profile_url:string|null};
export default function CampaignManager({leads}:{leads:Lead[]}){
 const[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 async function create(){setBusy(true);setMsg('');try{
  const s=db();const {data:{user},error}=await s.auth.getUser();if(error||!user)throw Error('Sign in first');
  let made=0,failed=0;for(const lead of leads){
   if(!lead.email)continue;
   const subject='Exhibition stand design support | HELIO Advertising & Studio';
   const body=`Hello ${lead.company_name} team,\n\nI’m reaching out from HELIO Advertising & Studio. We provide exhibition stand design, production and branding services.\n\nIf your company is planning an upcoming exhibition, we would be happy to discuss your requirements and share relevant design ideas.\n\nWould you be the right contact for exhibition planning?\n\nKind regards,\nHELIO Advertising & Studio\n\nPlease reply if you prefer not to receive further business outreach.`;
   const {data:prior,error:checkError}=await s.from('helio_campaign_drafts').select('id').eq('exhibitor_id',lead.id).eq('campaign_key','ISM_2026_Introduction').limit(1);if(checkError){failed++;if(failed===1)setMsg(checkError.message);continue}if(prior?.length)continue;const {error:e}=await s.from('helio_campaign_drafts').insert({owner_id:user.id,exhibitor_id:lead.id,campaign_key:'ISM_2026_Introduction',subject,body,status:'draft'});if(e){failed++;if(failed===1)setMsg(e.message)}else made++;
  }
  setMsg(`Draft processing complete: ${made} accepted (new drafts only), ${failed} errors. No emails were sent.`);
 }catch(e){setMsg(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 return <section className="panel" id="campaigns"><h2>Email Campaign Drafts</h2><p>Creates unsent drafts only for exhibitors with email addresses. Does not send or schedule emails. Review contacts, consent and opt-outs before outreach.</p><button disabled={busy||!leads.length} onClick={create}>{busy?'Preparing…':'Prepare introduction drafts'}</button><p role="status">{msg}</p></section>
}
