// Inspect a small sample of exhibitor profile labels before designing field extractors.
// Read-only: does not change candidate data or import to CRM.
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
const data=JSON.parse(await readFile("exhibitor-candidates-review.json","utf8"));
const root=new URL(data.source);
const browser=await chromium.launch({headless:true});
const samples=[];
try{
 const page=await browser.newPage();
 for(const candidate of data.candidates.slice(0,3)){
  const url=new URL(candidate.profile_url);
  if(url.origin!==root.origin||url.protocol!=="https:") throw Error("Unapproved profile URL");
  try{
   const response=await page.goto(url.href,{waitUntil:"domcontentloaded",timeout:18000});
   if(!response||response.status()>=400||new URL(page.url()).origin!==root.origin) throw Error("Profile unavailable");
   const fields=await page.evaluate(()=>{
    const clean=x=>(x||"").replace(/\\s+/g," ").trim().slice(0,300);
    return {
     headings:[...document.querySelectorAll("h1,h2,h3,h4")].map(x=>clean(x.textContent)).filter(Boolean).slice(0,30),
     labels:[...document.querySelectorAll("dt,dd,th,td,label,strong,b")].map(x=>clean(x.textContent)).filter(Boolean).slice(0,100),
     text:clean(document.querySelector("main")?.innerText||document.body?.innerText).slice(0,300),
     structuredData:[...document.querySelectorAll('script[type="application/ld+json"]')].map(x=>x.textContent?.slice(0,500)).slice(0,3)
    };
   });
   samples.push({company_name:candidate.company_name,profile_url:candidate.profile_url,fields});
  }catch(e){samples.push({company_name:candidate.company_name,error:String(e).slice(0,180)});}
 }
}finally{await browser.close();}
await writeFile("profile-fields-diagnostic.json",JSON.stringify(samples,null,2));
console.log("Saved profile-fields-diagnostic.json for",samples.length,"profiles");
