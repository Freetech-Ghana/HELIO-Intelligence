import {readFile} from "node:fs/promises";
const [baseUrl,jobId]=process.argv.slice(2);
const token=process.env.HELIO_ACCESS_TOKEN;
if(!baseUrl||!jobId||!token)throw Error("Usage: HELIO_ACCESS_TOKEN=<signed-in user JWT> node sync-results.mjs https://your-helio-app <job-uuid>");
const base=new URL(baseUrl);
if(!["https:","http:"].includes(base.protocol)||base.username||base.password)throw Error("Invalid app URL");
if(base.protocol!=="https:"&&!["localhost","127.0.0.1"].includes(base.hostname))throw Error("HTTPS required except localhost");
const data=JSON.parse(await readFile("exhibitor-candidates-review.json","utf8"));
if(!Array.isArray(data.candidates))throw Error("Missing candidates array");
for(let i=0;i<data.candidates.length;i+=50){
 const response=await fetch(new URL("/api/exhibitors/crawl-results",base),{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({jobId,candidates:data.candidates.slice(i,i+50),finished:i+50>=data.candidates.length})});
 const result=await response.json();
 if(!response.ok)throw Error("Batch "+(i/50+1)+": "+(result.error||response.status));
 console.log("Submitted",Math.min(i+50,data.candidates.length),"/",data.candidates.length,"; stored:",result.stored);
}
console.log("Sync complete. Results remain unverified and require review.");
