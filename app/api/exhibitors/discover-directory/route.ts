import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const runtime='nodejs';
const APPROVED=new Set(['www.dwtc.com','dwtc.com','www.gulfhost.ae','gulfhost.ae','www.ism-me.com','ism-me.com','informaconnect.com','www.informaconnect.com','adnec.ae','www.adnec.ae','expocitydubai.com','www.expocitydubai.com']);
const MAX_BYTES=500000;
const DIRECTORY_TERMS=/exhibitors?|exhibiting.companies|company.directory|brand.directory|sponsors?.and.exhibitors|exhibitor.list/i;
function safe(raw:string){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&APPROVED.has(u.hostname.toLowerCase())?u:null}catch{return null}}
async function getHtml(url:URL){
 let current=url;
 for(let i=0;i<4;i++){
  if(!safe(current.href))throw Error('Host not approved');
  const robots=await fetch(new URL('/robots.txt',current.origin),{signal:AbortSignal.timeout(8000),redirect:'error',headers:{'User-Agent':'HELIOExhibitorResearch/1.0'}});
  if(!robots.ok)throw Error('Cannot confirm robots permissions');
  const rules=(await robots.text()).split(/\r?\n/);
  let active=false;const disallowed:string[]=[];
  for(const line of rules){const s=line.split('#')[0].trim();const p=s.indexOf(':');if(p<0)continue;const key=s.slice(0,p).toLowerCase(),value=s.slice(p+1).trim();if(key==='user-agent')active=value==='*'||value.toLowerCase()==='helioexhibitorresearch';if(key==='disallow'&&active&&value)disallowed.push(value)}
  if(disallowed.some(p=>current.pathname.startsWith(p)))throw Error('Directory path disallowed by robots.txt');
  const response=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'HELIOExhibitorResearch/1.0','Accept':'text/html'},cache:'no-store'});
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw Error('Invalid redirect');const next=safe(new URL(location,current).href);if(!next)throw Error('Redirect outside approved hosts');current=next;continue}
  if(!response.ok)throw Error('HTTP '+response.status);
  if(!(response.headers.get('content-type')||'').includes('text/html'))throw Error('Expected HTML');
  const declared=Number(response.headers.get('content-length')||0);if(declared>MAX_BYTES)throw Error('Page too large');
  const html=(await response.text()).slice(0,MAX_BYTES);
  return {html,url:current.href};
 }
 throw Error('Too many redirects');
}
function candidates(html:string,base:string){
 const result:{url:string;label:string;score:number}[]=[];
 for(const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  const label=match[2].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,120);
  const href=match[1].replace(/&amp;/g,'&');let url:URL;
  try{url=new URL(href,base)}catch{continue}
  if(!safe(url.href))continue;
  const path=(url.pathname+' '+label).toLowerCase();
  if(!DIRECTORY_TERMS.test(path))continue;
  if(/become an exhibitor|why exhibit|exhibitor manual|exhibitor services|exhibitor registration|exhibitor portal|exhibitor login|exhibitor enquiry/i.test(path))continue;
  const score=/\/exhibitors?\/?$/i.test(url.pathname)?100:/directory|exhibitor.list|exhibitors/i.test(path)?60:20;
  result.push({url:url.href,label,score});
 }
 return [...new Map(result.sort((a,b)=>b.score-a.score).map(x=>[x.url,x])).values()].slice(0,12);
}
export async function POST(req:NextRequest){
 try{
  const bearer=req.headers.get('authorization')||'';
  const token=bearer.startsWith('Bearer ')?bearer.slice(7):'';
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!token||!url||!key)return NextResponse.json({error:'Unauthorized'},{status:401});
  const db=createClient(url,key,{
  auth:{
    persistSession:false,
    autoRefreshToken:false
  },
  global:{
    headers:{
      Authorization:`Bearer ${token}`
    }
  }
});
  const {data:{user},error}=await db.auth.getUser(token);
  if(error||!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const body=await req.json() as {exhibitionId?:string};
  if(!body.exhibitionId||!/^[a-f0-9-]{36}$/i.test(body.exhibitionId))return NextResponse.json({error:'Invalid exhibition ID'},{status:400});
  const {data:event,error:lookup}=await db.from('exhibitions').select('id,name,edition_year,discovery_event_url,official_website,directory_url').eq('id',body.exhibitionId).eq('owner_id',user.id).single();
  if(lookup||!event)return NextResponse.json({error:'Exhibition not found'},{status:404});
  const isHr=/hr summit|hrse/i.test(event.name||'');
  const seeds=[event.discovery_event_url,event.official_website,event.directory_url,...(isHr?['https://informaconnect.com/hr-summit-expo/']:[])].filter((s):s is string=>!!s);
  const results:{url:string;label:string;score:number}[]=[];const errors:string[]=[];
  const suggestedSearches=[`\"${event.name}\" ${event.edition_year} exhibitor list`,`\"${event.name}\" ${event.edition_year} exhibitors directory`,`\"${event.name}\" ${event.edition_year} sponsors exhibitors`];
  const visited=new Set<string>();let pagesChecked=0;
  const unsupportedSeedHosts:string[]=[];
  const checkedHosts=new Set<string>();
  let currentYearEvidence=false;
  const evidenceUrls:string[]=[];
  for(const seed of [...new Set(seeds)].slice(0,3)){
   const target=safe(seed);if(!target){try{const host=new URL(seed).hostname;unsupportedSeedHosts.push(host);errors.push('Official event or directory host needs review and a supported adapter: '+host)}catch{errors.push('Invalid event website URL')}continue}
   try{const page=await getHtml(target);visited.add(page.url);checkedHosts.add(new URL(page.url).hostname);pagesChecked++;results.push(...candidates(page.html,page.url));
    // Inspect a bounded set of same-host candidate directory pages; never crawl arbitrary sites.
    const follow=candidates(page.html,page.url).filter(c=>c.score>=60).slice(0,5);
    for(const link of follow){if(visited.has(link.url))continue;visited.add(link.url);try{const nested=await getHtml(new URL(link.url));pagesChecked++;checkedHosts.add(new URL(nested.url).hostname);results.push(...candidates(nested.html,nested.url));}catch(e){errors.push('Directory candidate '+new URL(link.url).pathname+': '+(e instanceof Error?e.message:'Unavailable'));}}
    if(isHr&&Number(event.edition_year)===2026&&/(?:2026.{0,100}(?:sponsors|exhibitors)|(?:sponsors|exhibitors).{0,100}2026)/i.test(page.html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' '))){currentYearEvidence=true;evidenceUrls.push(page.url)}}catch(e){errors.push(e instanceof Error?e.message:'Source failed')}
  }
  // Informa Connect HR Summit historical list: offered as a dated research source, not current-year proof.
  if (/hr summit|hrse|hr summit & expo/i.test(event.name||'')) {
    results.push({url:'https://informaconnect.com/hr-summit-expo/2025-sponsors-and-exhibitors/#2025-exhibitor-list',label:'Historical 2025 sponsors and exhibitors — NOT a verified 2026 directory',score:15});
  }
  // Known official directory is a suggestion only, never auto-verified or imported.
  if(/gulf\s*host/i.test(event.name||''))results.push({url:'https://www.gulfhost.ae/exhibitors',label:'GulfHost official exhibitor directory candidate',score:110});
  const year=Number(event.edition_year);
  const tagged=results.map(item=>{
    const match=new URL(item.url).pathname.match(new RegExp('(?:^|/)(20[0-9]{2})(?:-|/|$)'));
    const listedYear=match?Number(match[1]):null;
    return {...item,edition:listedYear,status:listedYear&&listedYear!==year?'historical':listedYear===year?'current_candidate':'unverified'};
  });
  const unique=[...new Map(tagged.sort((a,b)=>b.score-a.score).map(x=>[x.url,x])).values()];
  // Follow only a few same-host candidate pages to check edition-specific headings.
  for(const item of unique.filter(x=>x.status==='unverified'&&/sponsors?-and-exhibitors|exhibitor-list/i.test(new URL(x.url).pathname)).slice(0,3)){
    try{
      const page=await getHtml(new URL(item.url));
      const headingText=(page.html.match(/<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>/gi)||[]).join(' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
      if(new RegExp('(?:^|\\W)'+year+'(?:\\W|$)').test(headingText)&&/exhibitors/i.test(headingText)){
        currentYearEvidence=true;evidenceUrls.push(page.url);
      }
    }catch(e){errors.push('Could not inspect candidate listing: '+(e instanceof Error?e.message:'Source unavailable'))}
  }
  const current=unique.some(x=>x.status==='current_candidate');
  const historical=unique.some(x=>x.status==='historical');
  const discoveryStatus=current?'current_directory_candidate':currentYearEvidence?'current_exhibitor_section_found':historical?'historical_directory_only':'current_directory_not_found';
  return NextResponse.json({candidates:unique.slice(0,12),discoveryStatus,currentYearEvidence,evidenceUrls,pagesChecked,checkedHosts:[...checkedHosts],unsupportedSeedHosts:[...new Set(unsupportedSeedHosts)],suggestedSearches,editionYear:year,existing:event.directory_url||null,errors,notice:'Candidate links and sections require review. A 2026 exhibitor section is not proof of a complete directory. No exhibitor records were imported.'});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Lookup failed'},{status:500})}
}
