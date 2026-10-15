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
const limit=5;
const crawler=new PlaywrightCrawler({
  maxRequestsPerCrawl:limit,
  maxConcurrency:1,
  maxRequestRetries:1,
  requestHandlerTimeoutSecs:35,
  navigationTimeoutSecs:20,
  launchContext:{launchOptions:{headless:true}},
  async requestHandler({page,request}) {
    const final=new URL(page.url());
    if(final.protocol!=="https:"||final.hostname.toLowerCase()!==host) throw Error("Redirected outside the approved host");
    await page.waitForLoadState("domcontentloaded");
    const data=await page.locator("a[href]").evaluateAll(anchors=>anchors.map(a=>({
      name:(a.textContent||a.querySelector("img")?.getAttribute("alt")||"").replace(/\s+/g," ").trim(),
      href:a.href,rel:a.getAttribute("rel")||""
    })).slice(0,5000));
    for(const a of data) {
      let u;try{u=new URL(a.href);}catch{continue;}
      if(u.origin!==root.origin||u.protocol!=="https:") continue;
      if(/\/exhibitors?\/[^/?#]+|\/exhibitor-details(?:\.|\/)[^/?#]+|\/en\/sites\/exhibitors\/[^/?#]+/i.test(u.pathname)&&a.name.length>=2&&a.name.length<=160){
        const key=u.origin+u.pathname.replace(/\/$/,"").toLowerCase();
        if(!found.has(key)) found.set(key,{company_name:a.name,profile_url:u.href,source_page:request.url,edition_year:year,verification_status:"unverified"});
      }
      if((/^\d{1,3}$/.test(a.name)||/\bnext\b/i.test(a.name+" "+a.rel))&&/[?&](?:page|p)=\d+|\/page\/\d+\/?/i.test(u.href)&&!visited.has(u.href)&&queue.length<limit){
        queue.push(u.href);visited.add(u.href);
      }
    }
  },
  failedRequestHandler({request,error}){console.error("Page failed:",request.url,error?.message);}
});
Configuration.getGlobalConfig().set("persistStorage",false);
for(let i=0;i<queue.length&&i<limit;i++) {
  // Each navigation is bounded and subject to the same host restriction.
  const target=new URL(queue[i]);
  if(target.hostname!==host) continue;
  await crawler.run([target.href]);
}
const output={source:root.href,selectedEditionYear:year,editionVerified:false,coverage:"partial_unverified",pagesQueued:queue.length,candidates:[...found.values()]};
await writeFile("exhibitor-candidates-review.json",JSON.stringify(output,null,2));
console.log("Saved",output.candidates.length,"unverified candidates to exhibitor-candidates-review.json");
