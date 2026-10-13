export type FoundEvent={name:string;start:string;end:string|null;venue:string|null;city:string;url:string;source:string;key:string};
const UAE=/dubai|abu dhabi|sharjah|ajman|ras al khaimah|fujairah|umm al quwain|united arab emirates|\buae\b/i;
const BLOCKED_HOSTS=/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$)/i;
const ALLOWED_HOSTS=new Set(['dwtc.com','www.dwtc.com','adnec.ae','www.adnec.ae','expocitydubai.com','www.expocitydubai.com']);
function safeUrl(s:string){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!BLOCKED_HOSTS.test(u.hostname)&&!u.hostname.endsWith('.local')?u:null}catch{return null}}
function dateString(s:unknown){if(typeof s!=='string')return null;const d=new Date(s);return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10)}
function strings(x:unknown):string[]{if(!x)return[];if(typeof x==='string')return[x];if(Array.isArray(x))return x.flatMap(strings);if(typeof x==='object'){const o=x as Record<string,unknown>;return strings(o.name).concat(strings(o.addressLocality),strings(o.addressRegion),strings(o.addressCountry))}return[]}
function flatten(o:unknown):Record<string,unknown>[]{if(Array.isArray(o))return o.flatMap(flatten);if(!o||typeof o!=='object')return[];const x=o as Record<string,unknown>;return [x,...flatten(x['@graph'])]}
function eventFrom(x:Record<string,unknown>,source:string,base:string):FoundEvent|null{
 const types=strings(x['@type']);if(!types.some(t=>t==='Event'||t.endsWith('/Event')||t==='ExhibitionEvent'))return null;
 const name=typeof x.name==='string'?x.name.trim():'';const start=dateString(x.startDate);const end=dateString(x.endDate);if(!name||!start)return null;
 const now=new Date();now.setUTCHours(0,0,0,0);const horizon=new Date(now);horizon.setUTCFullYear(horizon.getUTCFullYear()+1);
 if(new Date((end||start)+'T00:00:00Z')<now||new Date(start+'T00:00:00Z')>horizon)return null;
 const location=strings(x.location);const venue=location[0]||null;const all=[...location,...strings(x.address)].join(' ');
 if(!UAE.test(all))return null; // Fail closed: never guess country from source URL.
 const city=location.find(s=>/dubai|abu dhabi|sharjah|ajman|ras al khaimah|fujairah|umm al quwain/i.test(s))||'UAE';
 const raw=typeof x.url==='string'?x.url:base;const eventUrl=safeUrl(new URL(raw,base).href);if(!eventUrl)return null;
 const canonical=eventUrl.origin+eventUrl.pathname.replace(/\/$/,'').toLowerCase();
 const key=canonical+'|'+start;return{name:name.slice(0,250),start,end,venue,city,url:eventUrl.href,source,key};
}
async function fetchWithDiagnostics(url:URL, stage:string, options:RequestInit):Promise<Response>{
 try { return await fetch(url, options); }
 catch(error){
  const e=error as Error & {cause?:{code?:string;message?:string}};
  const code=e.cause?.code || e.name || 'UNKNOWN';
  const detail=e.cause?.message || e.message || 'Unknown network error';
  throw new Error(`${stage} failed for ${url.hostname}: ${code} - ${detail}`);
 }
}
// Follow only HTTPS redirects to explicitly approved official hosts.
// Fetch handles redirects manually so a source cannot redirect to arbitrary URLs.
async function approvedFetch(initial:URL, stage:string, options:RequestInit):Promise<{response:Response;finalUrl:URL}>{
 let current=initial;
 for(let hop=0;hop<=5;hop++){
  if(!safeUrl(current.href)||!ALLOWED_HOSTS.has(current.hostname))throw Error(`${stage}: redirect destination is not approved: ${current.hostname}`);
  const response=await fetchWithDiagnostics(current,stage,{...options,redirect:'manual'});
  if(![301,302,303,307,308].includes(response.status))return {response,finalUrl:current};
  const location=response.headers.get('location');
  if(!location)throw Error(`${stage}: redirect HTTP ${response.status} has no Location header`);
  const next=safeUrl(new URL(location,current).href);
  if(!next||!ALLOWED_HOSTS.has(next.hostname))throw Error(`${stage}: blocked redirect to an unapproved destination`);
  current=next;
 }
 throw Error(`${stage}: too many redirects`);
}
async function permitted(url:URL){
 const robots=new URL('/robots.txt',url.origin);
 const {response,finalUrl}=await approvedFetch(robots,'robots.txt request',{headers:{'User-Agent':'HELIOExhibitionDiscovery/1.0 (respectful event metadata monitor)'},signal:AbortSignal.timeout(10000)});
 if(!response.ok)return false;
 const lines=(await response.text()).split(/\r?\n/);
 let active=false;const disallows:string[]=[];
 for(const raw of lines){
  const line=raw.split('#')[0].trim();if(!line)continue;
  const [k,...rest]=line.split(':');const v=rest.join(':').trim();
  if(k.toLowerCase()==='user-agent')active=v==='*'||v.toLowerCase()==='helioexhibitiondiscovery';
  if(k.toLowerCase()==='disallow'&&active&&v)disallows.push(v);
 }
 // If robots.txt was redirected to another approved host, it still must govern the target path.
 return !disallows.some(d=>url.pathname.startsWith(d)||finalUrl.pathname.startsWith(d));
}

// DWTC exposes many event details as visible HTML rather than JSON-LD.
// Only pages under the official /en/events/ path are considered.
const DWTC_EVENT_PATH=/^\/en\/events\/[^/]+\/?$/i;
const MONTHS='January|February|March|April|May|June|July|August|September|October|November|December';
const MONTH_NUM:Record<string,number>={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
function unescapeHtml(s:string){return s.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(_,code:string)=>{
 const c=code.toLowerCase();if(c.startsWith('#x'))return String.fromCodePoint(parseInt(c.slice(2),16));
 if(c.startsWith('#'))return String.fromCodePoint(parseInt(c.slice(1),10));
 return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '} as Record<string,string>)[c]||' ';});}
function plainText(html:string){return unescapeHtml(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')).replace(/\s+/g,' ').trim()}
function validDate(y:number,m:number,d:number){const dt=new Date(Date.UTC(y,m-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?dt.toISOString().slice(0,10):null}
function isUpcoming(start:string,end:string|null){const today=new Date();today.setUTCHours(0,0,0,0);const horizon=new Date(today);horizon.setUTCFullYear(horizon.getUTCFullYear()+1);return new Date((end||start)+'T00:00:00Z')>=today&&new Date(start+'T00:00:00Z')<=horizon}
function field(text:string,label:string,next:string[]){const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const stops=next.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');const re=new RegExp('(?:^|\\s)'+escaped+'\\s+([\\s\\S]*?)(?=\\s+(?:'+stops+')\\b|$)','i');return text.match(re)?.[1]?.trim()||null}
function fromDwtc(html:string,url:URL,source:string):FoundEvent|null{
 const t=plainText(html);
 const name=t.match(/(?:^|\s)Dubai World Trade Centre\s*-\s*(.+?)\s+(?:عربي\s+)?Events\b/i)?.[1]?.trim()
   ||t.match(/\bEvents\s+Free Zone\s+Real Estate\s+Corporate\s+Events\s+Free Zone\s+Real Estate\s+Corporate\s+(.+?)\s+Back to event list\b/i)?.[1]?.trim();
 const dateText=field(t,'Time & Date',['Location','Event Type','Industry','Audience','Organised By']);
 if(!name||!dateText)return null;
 // e.g. '3 - 5 Nov 2026', '30 Oct - 2 Nov 2026', '3 Nov 2026'
 const monthPattern='('+MONTHS+')';
 const shortMonth='(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';
 const month='(?:'+monthPattern+'|'+shortMonth+')';
 const dateRe=new RegExp('\\b(\\d{1,2})\\s*(?:[-–—]\\s*(\\d{1,2})\\s*)?('+MONTHS+'|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\s+(20\\d{2})\\b','i');
 const crossRe=new RegExp('\\b(\\d{1,2})\\s+('+MONTHS+'|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\s*[-–—]\\s*(\\d{1,2})\\s+('+MONTHS+'|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\s+(20\\d{2})\\b','i');
 const monthNumber=(x:string)=>MONTH_NUM[x.toLowerCase()]||MONTH_NUM[({jan:'january',feb:'february',mar:'march',apr:'april',jun:'june',jul:'july',aug:'august',sep:'september',sept:'september',oct:'october',nov:'november',dec:'december'} as Record<string,string>)[x.toLowerCase()]];
 let start:string|null=null,end:string|null=null;
 const c=dateText.match(crossRe);
 if(c){const y=Number(c[5]),m1=monthNumber(c[2]),m2=monthNumber(c[4]);start=validDate(m1>m2?y-1:y,m1,Number(c[1]));end=validDate(y,m2,Number(c[3]));}
 else {const m=dateText.match(dateRe);if(m){const y=Number(m[4]),mo=monthNumber(m[3]);start=validDate(y,mo,Number(m[1]));end=m[2]?validDate(y,mo,Number(m[2])):null;}}
 if(!start||!isUpcoming(start,end)||end&&end<start)return null;
 const location=field(t,'Location',['Event Type','Industry','Audience','Organised By']);
 const eventType=field(t,'Event Type',['Industry','Audience','Organised By']);
 if(!location||!eventType||!/exhibition|trade show|conference|expo|summit/i.test(eventType))return null;
 const canonical=url.origin+url.pathname.replace(/\/$/,'').toLowerCase();
 return {name:name.slice(0,250),start,end,venue:location.slice(0,250),city:'Dubai',url:url.href,source,key:canonical+'|'+start};
}
function dwtcLinks(html:string,base:URL){const result=new Map<string,URL>();
 for(const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)){
  try{const u=safeUrl(new URL(unescapeHtml(m[1]),base).href);
   if(u&&['dwtc.com','www.dwtc.com'].includes(u.hostname)&&DWTC_EVENT_PATH.test(u.pathname)){
    u.hash='';u.search='';result.set(u.origin+u.pathname.replace(/\/$/,'').toLowerCase(),u);
   }}catch{/* invalid link */}
 }
 return [...result.values()];
}
async function getHtml(url:URL,stage:string){
 if(!(await permitted(url)))throw Error(`${stage}: robots.txt disallows ${url.pathname}`);
 const {response,finalUrl}=await approvedFetch(url,stage,{headers:{'User-Agent':'HELIOExhibitionDiscovery/1.0','Accept':'text/html'},signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!(await permitted(finalUrl)))throw Error(`${stage}: final path disallowed by robots.txt`);
 if(!response.ok)throw Error(`${stage}: HTTP ${response.status}`);
 if(!(response.headers.get('content-type')||'').includes('text/html'))throw Error(`${stage}: not HTML`);
 return {html:(await response.text()).slice(0,1500000),finalUrl};
}
export async function scanSource(source:{name:string;url:string}):Promise<FoundEvent[]>{
 const u=safeUrl(source.url);
 if(!u||!ALLOWED_HOSTS.has(u.hostname))throw Error('Source host is not in the approved UAE official-source allowlist');
 const {html,finalUrl}=await getHtml(u,'source request');
 const found:FoundEvent[]=[];
 function extractJsonLd(page:string,pageUrl:URL){
  for(const m of page.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
   try{for(const x of flatten(JSON.parse(m[1]))){const e=eventFrom(x,source.url,pageUrl.href);if(e)found.push(e)}}catch{/* invalid JSON-LD */}
  }
 }
 extractJsonLd(html,finalUrl);
 if(['dwtc.com','www.dwtc.com'].includes(finalUrl.hostname)){
  // Homepage sources are supported without requiring a database change.
  const calendar=new URL('/en/events/',finalUrl.origin);
  let calendarHtml=html,calendarUrl=finalUrl;
  if(!finalUrl.pathname.startsWith('/en/events/')){
   const page=await getHtml(calendar,'DWTC calendar');calendarHtml=page.html;calendarUrl=page.finalUrl;
   extractJsonLd(calendarHtml,calendarUrl);
  }
  // Some DWTC calendar responses contain no event anchors even though the
  // official homepage lists event detail URLs. Use both, without requiring
  // a database/source configuration change.
  const candidates=new Map<string,URL>();
  const addLinks=(pageHtml:string,pageUrl:URL)=>{
   for(const link of dwtcLinks(pageHtml,pageUrl)){
    candidates.set(link.origin+link.pathname.replace(/\/$/,'').toLowerCase(),link);
   }
  };
  addLinks(calendarHtml,calendarUrl);
  addLinks(html,finalUrl);
  if(!['/','/en','/en/'].includes(finalUrl.pathname)){
   try{
    const home=await getHtml(new URL('/en/',finalUrl.origin),'DWTC homepage');
    addLinks(home.html,home.finalUrl);
   }catch(error){console.warn('HELIO DWTC homepage fallback:',error instanceof Error?error.message:String(error));}
  }
  const links=[...candidates.values()].slice(0,25);
  console.info(`HELIO DWTC: ${links.length} unique event page links found`);
  for(const link of links){
   try{
    const page=await getHtml(link,'DWTC event');
    if(!DWTC_EVENT_PATH.test(page.finalUrl.pathname))continue;
    extractJsonLd(page.html,page.finalUrl);
    const e=fromDwtc(page.html,page.finalUrl,source.url);if(e)found.push(e);else console.info(`HELIO DWTC event not eligible or not parsed: ${page.finalUrl.pathname}`);
   }catch(error){console.warn(`HELIO DWTC event skipped ${link.pathname}:`,error instanceof Error?error.message:String(error));}
  }
 }
 return [...new Map(found.map(e=>[e.key,e])).values()];
}
