// Separate worker: npm install && npx playwright install chromium
// Usage: npm run crawl -- https://official-event.example/exhibitors 2026
// Candidates are unverified. Never automatically import into CRM.
import { PlaywrightCrawler, Configuration } from "crawlee";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { writeFile } from "node:fs/promises";

const [raw,yearRaw]=process.argv.slice(2);
const year=Number(yearRaw);
if(!raw||!Number.isInteger(year)||year<2000||year>2100) {
  console.error("Usage: npm run crawl -- <approved-public-directory-url> <edition-year>");
  process.exit(2);
}
const root=new URL(raw);
if(root.protocol!=="https:"||root.username||root.password||root.port||isIP(root.hostname)) throw Error("Use an HTTPS public domain without credentials, port or IP address");
const host=root.hostname.toLowerCase();
function publicIp(ip) {
  if(ip.includes(":")) return !(/^(::1|fc|fd|fe80|::ffff:127\.|::ffff:10\.|::ffff:192\.168\.)/i.test(ip));
  const p=ip.split(".").map(Number);
  return !(p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]===100&&p[1]>=64&&p[1]<=127);
}
const resolved=await lookup(host,{all:true});
if(!resolved.length||resolved.some(x=>!publicIp(x.address))) throw Error("Private or unresolved directory host");
const robotsUrl=new URL("/robots.txt",root);
const robots=await fetch(robotsUrl,{redirect:"error",signal:AbortSignal.timeout(10000)});
if(!robots.ok) throw Error("Cannot verify robots permissions");
const rules=(await robots.text()).split(/\r?\n/);
let active=false;
for(const line of rules) {
  const [key,...rest]=line.split(":");const value=rest.join(":").trim();
  if(key?.trim().toLowerCase()==="user-agent") active=value==="*"||value.toLowerCase()==="helioexhibitorresearch";
  if(active&&key?.trim().toLowerCase()==="disallow"&&value&&root.pathname.startsWith(value)) throw Error("Directory disallowed by robots.txt");
}
const found=new Map();
const visited=new Set();
const queue=[root.href];
const failures=[];
const limit=5;
const pageLimit=12;
const crawler=new PlaywrightCrawler({
  maxRequestsPerCrawl:limit,
  maxConcurrency:1,
  maxRequestRetries:1,
  requestHandlerTimeoutSecs:35,
  navigationTimeoutSecs:20,
  launchContext:{launchOptions:{headless:true}},
  async requestHandler({page,request,addRequests}) {
    const final=new URL(page.url());
    if(final.protocol!=="https:"||final.hostname.toLowerCase()!==host) throw Error("Redirected outside the approved host");
    await page.waitForLoadState("domcontentloaded");
    const data=await page.locator("a[href]").evaluateAll(anchors=>anchors.map(a=>({
      name:(a.textContent||a.querySelector("img")?.getAttribute("alt")||"").replace(/\s+/g," ").trim(),
      href:a.href,rel:a.getAttribute("rel")||""
    })).slice(0,5000));
    const record=async(a)=>{
      let u;try{u=new URL(a.href);}catch{return;}
      if(u.origin!==root.origin||u.protocol!=="https:") return;
      if(/\/exhibitors?\/[^/?#]+|\/exhibitor-details(?:\.|\/)[^/?#]+|\/en\/sites\/exhibitors\/[^/?#]+/i.test(u.pathname)&&a.name.length>=2&&a.name.length<=160){
        const key=u.origin+u.pathname.replace(/\/$/,"").toLowerCase();
        if(!found.has(key)) found.set(key,{company_name:a.name,profile_url:u.href,source_page:request.url,edition_year:year,verification_status:"unverified"});
      }
      if((/^\d{1,3}$/.test(a.name)||/\bnext\b/i.test(a.name+" "+a.rel))&&/[?&](?:page|p)=\d+|\/page\/\d+\/?/i.test(u.href)&&!visited.has(u.href)&&queue.length<limit){
        queue.push(u.href);visited.add(u.href);
        await addRequests([{url:u.href}]);
      }
    };
    for(const a of data) await record(a);
    // Re-read the listing after bounded Load More interactions and scrolling.
    for(let round=0;round<pageLimit;round++){
      let advanced=false;
      for(const selector of ['button:has-text("Load more")','button:has-text("Show more")','a:has-text("Load more")']){
        const button=page.locator(selector).first();
        if(await button.isVisible().catch(()=>false)&&await button.isEnabled().catch(()=>false)){
          await button.click({timeout:3000}).catch(()=>{});advanced=true;break;
        }
      }
      if(!advanced){await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));}
      await page.waitForTimeout(700);
      const updated=await page.locator("a[href]").evaluateAll(anchors=>anchors.map(a=>({
        name:(a.textContent||a.querySelector("img")?.getAttribute("alt")||"").replace(/\s+/g," ").trim(),
        href:a.href,rel:a.getAttribute("rel")||""
      })).slice(0,5000));
      const before=found.size;
      for(const a of updated) await record(a);
      if(found.size===before&&!advanced) break;
    }

  },
  failedRequestHandler({request,error}){failures.push({url:request.url,error:error?.message||"failed"});console.error("Page failed:",request.url,error?.message);}
});
Configuration.getGlobalConfig().set("persistStorage",false);
await crawler.run([root.href]);
// Enrich a bounded number of public profile pages. No guessing, no contact harvesting.
const profiles=[...found.values()].slice(0,25);
const { chromium }=await import("playwright");
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext();
  const page=await context.newPage();
  for(const item of profiles) {
    try {
      const target=new URL(item.profile_url);
      if(target.origin!==root.origin) continue;
      const response=await page.goto(target.href,{waitUntil:"domcontentloaded",timeout:15000});
      if(!response||response.status()>=400||new URL(page.url()).origin!==root.origin) throw Error("Profile unavailable or redirected");
      const details=await page.evaluate(()=>{
        const title=document.querySelector("h1")?.textContent?.trim()||"";
        const description=document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim()||"";
        const urls=[...document.querySelectorAll("a[href]")].map(a=>a.href).filter(h=>h.startsWith("https://"));
        return {title,description,urls};
      });
      if(details.title&&details.title.length<160) {item.profile_heading=details.title;if(!item.company_name||/^(?:\.{2,}|view|details|read more)$/i.test(item.company_name.trim())) item.company_name=details.title;}
      if(details.description&&!/discover the latest industry products|view our exhibitor list|sneak peek at the brands/i.test(details.description)) item.description=details.description.slice(0,500);
      item.website=details.urls.find(h=>{try{
        const u=new URL(h);return u.hostname!==root.hostname&&!u.hostname.endsWith(".big5global.com")&&!/(big5global|facebook|linkedin|instagram|youtube|twitter|tiktok|google)/i.test(u.hostname);
      }catch{return false;}})||null;
      item.profile_status="review_required";
    }catch(e){item.profile_status="unavailable";failures.push({url:item.profile_url,error:String(e).slice(0,200)});}
  }
} finally {await browser.close();}
const output={source:root.href,selectedEditionYear:year,editionVerified:false,coverage:"partial_unverified",pagesQueued:queue.length,pagesFailed:failures,completenessVerified:false,candidates:[...found.values()]};
await writeFile("exhibitor-candidates-review.json",JSON.stringify(output,null,2));
console.log("Saved",output.candidates.length,"unverified candidates to exhibitor-candidates-review.json");
