import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {lookup} from 'node:dns/promises';
import https from 'node:https';
import {isIP} from 'node:net';

export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function publicAddress(ip:string){
 if(isIP(ip)===4){
  const [a,b]=ip.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===192&&b===0||a===198&&b>=18&&b<=19||a===198&&b===51||a===203&&b===0);
 }
 if(isIP(ip)===6){const v=ip.toLowerCase();return !(v==='::'||v==='::1'||v.startsWith('fc')||v.startsWith('fd')||v.startsWith('fe')||v.startsWith('ff')||v.startsWith('2001:db8')||v.startsWith('::ffff:'))}
 return false;
}
function validWebsite(raw:string){
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname==='localhost'||isIP(u.hostname)||!u.hostname.includes('.')||u.hostname.length>253)return null;return u}catch{return null}
}
async function getPage(url:URL){
 const ips=await lookup(url.hostname,{all:true,verbatim:true});
 if(!ips.length||ips.some(i=>!publicAddress(i.address)))throw Error('Website DNS is not publicly routable');
 const chosen=ips[0];
 return await new Promise<string>((resolve,reject)=>{
  const req=https.request(url,{method:'GET',timeout:8000,headers:{'User-Agent':'HELIOContactResearch/1.0','Accept':'text/html,text/plain'},lookup:(_host,_opts,cb)=>cb(null,chosen.address,chosen.family)},res=>{
   if(res.statusCode!==200){res.resume();reject(Error('Website returned HTTP '+res.statusCode));return}
   const type=String(res.headers['content-type']||'');
   if(!/text\/(html|plain)/i.test(type)){res.resume();reject(Error('Not an HTML or text page'));return}
   if(Number(res.headers['content-length']||0)>250000){res.resume();reject(Error('Page exceeds 250 KB'));return}
   let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;if(text.length>250000){req.destroy(Error('Page exceeds 250 KB'))}});res.on('end',()=>resolve(text));res.on('error',reject);
  });req.on('timeout',()=>req.destroy(Error('Website timed out')));req.on('error',reject);req.end();
 });
}
function allowed(robots:string,path:string){
 const lines=robots.split(/\r?\n/);let agent='';const rules:{path:string;allow:boolean}[]=[];
 for(const line of lines){const clean=line.split('#')[0].trim();const i=clean.indexOf(':');if(i<0)continue;const k=clean.slice(0,i).trim().toLowerCase(),v=clean.slice(i+1).trim();
 if(k==='user-agent')agent=v.toLowerCase();if((k==='allow'||k==='disallow')&&(agent==='*'||agent==='heliocontactresearch')&&v)rules.push({path:v,allow:k==='allow'});}
 const matches=rules.filter(r=>path.startsWith(r.path)).sort((a,b)=>b.path.length-a.path.length||Number(b.allow)-Number(a.allow));return !matches.length||matches[0].allow;
}
function decode(s:string){return s.replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&amp;/gi,'&').replace(/&#64;|&commat;/gi,'@')}
function emails(html:string){const text=decode(html);return [...new Set((text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)||[]).map(x=>x.toLowerCase()).filter(x=>x.length<=150&&!/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(x)))].slice(0,10)}
export async function POST(req:NextRequest){
 try{
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(!token||!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)return NextResponse.json({error:'Unauthorized'},{status:401});
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
  const {data:{user}}=await db.auth.getUser(token);if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const body=await req.json();if(typeof body?.exhibitorId!=='string'||!UUID.test(body.exhibitorId))return NextResponse.json({error:'Invalid exhibitor ID'},{status:400});
  const {data:lead,error}=await db.from('exhibitors').select('id,website,owner_id,outreach_opt_out').eq('id',body.exhibitorId).eq('owner_id',user.id).single();
  if(error||!lead)return NextResponse.json({error:'Exhibitor not found'},{status:404});
  if(lead.outreach_opt_out)return NextResponse.json({error:'Do Not Contact: automated research disabled'},{status:403});
  const base=validWebsite(lead.website||'');if(!base)return NextResponse.json({error:'Save a valid public HTTPS company website first'},{status:400});
  const robotsUrl=new URL('/robots.txt',base);let robots:string;
  try{robots=await getPage(robotsUrl)}catch{return NextResponse.json({error:'Could not verify robots.txt; no pages fetched'},{status:422})}
  const paths=[base.pathname,'/contact','/contact-us','/en/contact'].filter((v,i,a)=>a.indexOf(v)===i);
  const results:{source_url:string;emails:string[]}[]=[];
  for(const path of paths.slice(0,4)){if(!allowed(robots,path))continue;try{const url=new URL(path,base);const html=await getPage(url);const found=emails(html);if(found.length)results.push({source_url:url.href,emails:found})}catch{/* skip inaccessible pages */}}
  return NextResponse.json({results,notice:'Unverified public email candidates. Review sources manually. Nothing saved or approved; no email sent.'});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Research failed'},{status:422})}
}
