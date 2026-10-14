import {createClient} from '@supabase/supabase-js';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
export const runtime='nodejs';
function publicIP(ip:string){if(isIP(ip)===4){const p=ip.split('.').map(Number);return !(p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]===100&&p[1]>=64&&p[1]<=127||p[0]===192&&p[1]===0||p[0]===198&&[18,19].includes(p[1]));}return isIP(ip)===6&&!(/^(::1|::|f[cd]|fe[89ab]|ff|2001:db8)/i.test(ip));}
function clean(s:string){return s.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/g,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim();}
function meta(html:string,name:string){const tags=html.match(/<meta\b[^>]*>/gi)||[];for(const tag of tags){if(new RegExp('(?:name|property)\\s*=\\s*["\\\']'+name+'["\\\']','i').test(tag)){const m=tag.match(/content\s*=\s*["']([^"']*)["']/i);if(m)return clean(m[1]);}}return '';}
export async function POST(request:Request){
 try{
 const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');if(!token)return Response.json({error:'Sign in required'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;if(!url||!key)return Response.json({error:'Supabase configuration missing'},{status:500});
 const s=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}}});
 const {data:{user},error:authError}=await s.auth.getUser(token);if(authError||!user)return Response.json({error:'Invalid session'},{status:401});
 const body=await request.json();if(typeof body.exhibitorId!=='string')return Response.json({error:'Select an exhibitor'},{status:400});
 const {data:lead,error}=await s.from('exhibitors').select('id,company_name,profile_url,exhibition_id').eq('id',body.exhibitorId).single();if(error||!lead)return Response.json({error:'Exhibitor not accessible'},{status:404});
 const {data:event}=await s.from('exhibitions').select('name,edition_year').eq('id',lead.exhibition_id).single();if(!event)return Response.json({error:'Exhibition not accessible'},{status:404});
 if(!lead.profile_url)return Response.json({error:'Exhibitor has no official profile URL'},{status:400});
 const target=new URL(lead.profile_url);if(target.protocol!=='https:'||target.username||target.password||target.port&&target.port!=='443')return Response.json({error:'Only public HTTPS profiles are supported'},{status:400});
 if(target.hostname==='localhost'||target.hostname.endsWith('.local')||isIP(target.hostname))return Response.json({error:'Invalid public profile host'},{status:400});
 const addresses=await lookup(target.hostname,{all:true});if(!addresses.length||addresses.some(a=>!publicIP(a.address)))return Response.json({error:'Private network addresses are blocked'},{status:400});
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000);
 let response:Response;try{response=await fetch(target.toString(),{redirect:'manual',signal:controller.signal,headers:{'User-Agent':'HELIO-Research/1.0 (manual verification; no bulk scraping)','Accept':'text/html'}})}finally{clearTimeout(timer)}
 if(!response.ok)return Response.json({error:'Source returned HTTP '+response.status+' (redirects are not followed)'},{status:422});
 if(!(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return Response.json({error:'Source is not HTML'},{status:422});
 if(Number(response.headers.get('content-length')||0)>500000)return Response.json({error:'Source is too large'},{status:422});
 const html=(await response.text()).slice(0,500000);
 const title=clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
 const description=meta(html,'description')||meta(html,'og:description');
 const emails=[...new Set((html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).filter(v=>!v.includes('example.')).slice(0,8))];
 const candidates=[{field_name:'description',extracted_value:description,evidence_text:'HTML meta description'},{field_name:'email',extracted_value:emails[0]||'',evidence_text:'Email-like text found on page (unverified)'}].filter(x=>x.extracted_value);
 return Response.json({company:lead.company_name,exhibition:event.name,year:event.edition_year,source_url:target.toString(),page_title:title,candidates,notice:'Candidates are unverified. Check the source before saving or approving. Dynamic/blocked sites may not expose data.'});
 }catch(e){return Response.json({error:(e as Error).name==='AbortError'?'Source timed out':'Could not research this profile: '+(e as Error).message},{status:422})}
}
