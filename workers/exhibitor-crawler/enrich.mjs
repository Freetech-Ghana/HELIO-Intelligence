// Enrich existing candidates in resumable, bounded batches. Never imports to CRM.
// Usage: npm run enrich
import { chromium } from "playwright";
import { readFile, writeFile, rename } from "node:fs/promises";
const file="exhibitor-candidates-review.json";
const data=JSON.parse(await readFile(file,"utf8"));
if(!Array.isArray(data.candidates)||!data.source) throw Error("Invalid candidate file");
const source=new URL(data.source);
const organizerHost=(host)=>/(^|\.)(dmgevents\.com|big5global\.com)$/.test(host.toLowerCase());
const validWebsite=(h)=>{try{const u=new URL(h);return u.protocol==="https:"&&!organizerHost(u.hostname)&&u.hostname!==source.hostname&&!/\.(pdf|docx?|xlsx?|pptx?|zip)(?:$|[?#])/i.test(u.pathname)&&!/(facebook|linkedin|instagram|youtube|twitter|tiktok|google)/i.test(u.hostname);}catch{return false;}};
let cleaned=0;
for(const item of data.candidates){if(item.website&&!validWebsite(item.website)){item.website=null;cleaned++;}}
await writeFile(file+".tmp",JSON.stringify(data,null,2));await rename(file+".tmp",file);
const pending=data.candidates.filter(x=>x.profile_url&&x.profile_status!=="review_required"&&x.profile_status!=="unavailable").slice(0,25);
if(!pending.length){console.log("No pending candidates in this batch.");process.exit(0);}
const browser=await chromium.launch({headless:true});
const failures=[];
try{
 const page=await browser.newPage();
 for(const item of pending){
  try{
   const url=new URL(item.profile_url);
   if(url.protocol!=="https:"||url.origin!==source.origin) throw Error("Profile outside approved directory");
   const response=await page.goto(url.href,{waitUntil:"domcontentloaded",timeout:18000});
   if(!response||response.status()>=400||new URL(page.url()).origin!==source.origin) throw Error("Profile unavailable or redirected");
   const details=await page.evaluate(()=>({
    title:(document.querySelector("h1")?.textContent||"").replace(/\s+/g," ").trim(),
    description:document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim()||"",
    links:[...document.querySelectorAll("a[href]")].map(a=>a.href).filter(x=>x.startsWith("https://"))
   }));
   if(details.title&&details.title.length<160){
    item.profile_heading=details.title;
    if(!item.company_name||/^(?:\.{2,}|view|details|read more)$/i.test(item.company_name.trim())) item.company_name=details.title;
   }
   if(details.description&&!/discover the latest industry products|view our exhibitor list|sneak peek at the brands/i.test(details.description)) item.description=details.description.slice(0,500);
   item.website=details.links.find(validWebsite)||null;
   item.profile_status="review_required";
  }catch(e){item.profile_status="unavailable";failures.push({url:item.profile_url,error:String(e).slice(0,180)});}
  // Save after each profile, so interrupted batches can resume.
  const temp=file+".tmp";
  await writeFile(temp,JSON.stringify(data,null,2));
  await rename(temp,file);
 }
}finally{await browser.close();}
const remaining=data.candidates.filter(x=>!x.profile_status).length;
console.log(JSON.stringify({processed:pending.length,remaining,failed:failures.length,invalidWebsitesCleared:cleaned,total:data.candidates.length},null,2));
