// Revisit saved profiles in bounded batches to extract visible stand, hall,
// country and About the company text. Keeps original records and review status.
import { chromium } from "playwright";
import { readFile, writeFile, rename } from "node:fs/promises";
const file="exhibitor-candidates-review.json";
const data=JSON.parse(await readFile(file,"utf8"));
if(!Array.isArray(data.candidates)||!data.source) throw Error("Invalid candidates file");
const root=new URL(data.source);
const pending=data.candidates.filter(x=>x.profile_url&&!x.details_checked_at).slice(0,25);
if(!pending.length){console.log(JSON.stringify({processed:0,remaining:0,total:data.candidates.length}));process.exit(0);}
const browser=await chromium.launch({headless:true});
let failed=0;
try{
 const page=await browser.newPage();
 for(const item of pending){
  try{
   const url=new URL(item.profile_url);
   if(url.protocol!=="https:"||url.origin!==root.origin) throw Error("Profile outside directory");
   const response=await page.goto(url.href,{waitUntil:"domcontentloaded",timeout:18000});
   if(!response||response.status()>=400||new URL(page.url()).origin!==root.origin) throw Error("Unavailable profile");
   const result=await page.evaluate(()=>{
    const lines=(document.querySelector("main")?.innerText||document.body?.innerText||"").split(/\r?\n/).map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);
    const standIndex=lines.findIndex(x=>/^Stand No\s*[-:]/i.test(x));
    const standLine=standIndex>=0?lines[standIndex]:"";
    const match=standLine.match(/^Stand No\s*[-:]\s*(.+?),\s*(.+)$/i);
    const aboutIndex=lines.findIndex(x=>/^About the company$/i.test(x));
    const stop=/^(Brochures|Products|Product Categories|Send Enquiry|Contact|Gallery|Videos|Social Media|Brands)$/i;
    const about=[];
    if(aboutIndex>=0)for(let i=aboutIndex+1;i<lines.length&&about.length<20;i++){if(stop.test(lines[i]))break;about.push(lines[i]);}
    return {stand:match?.[1]?.trim()||null,hall:match?.[2]?.trim()||null,country:standIndex>=0?lines.slice(standIndex+1,standIndex+4).find(x=>!/^(?:Â|\\u00a0|https?:|Send Enquiry)/i.test(x)&&!/^Stand No/i.test(x))||null:null,description:about.join(" ").slice(0,2000)||null,standLine};
   });
   item.stand_number=result.stand;
   item.hall=result.hall;
   item.country=result.country;
   if(result.description)item.company_description=result.description;
   item.details_status=result.stand||result.hall||result.country||result.description?"review_required":"not_found";
  }catch(e){item.details_status="unavailable";item.details_error=String(e).slice(0,180);failed++;}
  item.details_checked_at=new Date().toISOString();
  await writeFile(file+".tmp",JSON.stringify(data,null,2));await rename(file+".tmp",file);
 }
}finally{await browser.close();}
console.log(JSON.stringify({processed:pending.length,remaining:data.candidates.filter(x=>x.profile_url&&!x.details_checked_at).length,failed,total:data.candidates.length},null,2));
