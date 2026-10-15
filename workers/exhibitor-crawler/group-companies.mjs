// Read-only grouping report. Keeps each exhibitor profile and stand distinct.
import {readFile,writeFile} from "node:fs/promises";
const data=JSON.parse(await readFile("exhibitor-candidates-review.json","utf8"));
if(!Array.isArray(data.candidates))throw Error("Missing candidates");
const normalize=s=>String(s||"").normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("en");
const groups=new Map();
for(const x of data.candidates){
 const key=normalize(x.company_name);
 if(!key)continue;
 if(!groups.has(key))groups.set(key,[]);
 groups.get(key).push({company_name:x.company_name,profile_url:x.profile_url,stand_number:x.stand_number||null,hall:x.hall||null,country:x.country||null,website:x.website||null});
}
const repeated=[...groups.entries()].filter(([,v])=>v.length>1).map(([normalized_name,profiles])=>({
 normalized_name,
 profile_count:profiles.length,
 distinct_stands:[...new Set(profiles.filter(x=>x.stand_number).map(x=>[normalize(x.hall),normalize(x.stand_number)].join("|")))].length,
 missing_stand_count:profiles.filter(x=>!x.stand_number).length,
 review_status:"needs_review",
 profiles
}));
const output={source:data.source,record_count:data.candidates.length,company_name_groups:groups.size,repeated_company_groups:repeated.length,repeated_profile_count:repeated.reduce((n,g)=>n+g.profile_count,0),groups:repeated};
await writeFile("company-grouping-review.json",JSON.stringify(output,null,2));
console.log(JSON.stringify({record_count:output.record_count,company_name_groups:output.company_name_groups,repeated_company_groups:output.repeated_company_groups,repeated_profile_count:output.repeated_profile_count,report:"company-grouping-review.json",data_modified:false},null,2));
