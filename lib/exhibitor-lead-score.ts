export type LeadCandidate = {company_name:string;profile_url:string;website?:string|null;country?:string|null;hall?:string|null;stand_number?:string|null;company_description?:string|null;verification_status?:string|null;review_decision?:string|null};
export type LeadScore = {score:number;tier:"High"|"Medium"|"Low";reasons:string[];note:string};
/** Universal, explainable data-readiness score, not a prediction of buying intent. */
export function scoreExhibitor(x:LeadCandidate):LeadScore{
 let score=0;const reasons:string[]=[];
 const add=(points:number,reason:string)=>{score+=points;reasons.push("+"+points+" "+reason);};
 if(x.company_name?.trim())add(15,"Company name available");
 try{const url=new URL(x.profile_url);if(url.protocol==="https:")add(15,"HTTPS exhibitor profile URL");}catch{/* no profile points */}
 if(x.country?.trim())add(10,"Country available");
 if(x.hall?.trim())add(10,"Hall available");
 if(x.stand_number?.trim())add(15,"Stand number available");
 if(x.website?.trim()){try{const url=new URL(x.website);if(["https:","http:"].includes(url.protocol))add(20,"Company website listed (not verified)");}catch{/* invalid website */}}
 if(x.company_description?.trim())add(15,"Company description available");
 const tier=score>=75?"High":score>=45?"Medium":"Low";
 return {score,tier,reasons,note:"Data-readiness only. Exhibition edition, contacts and purchase intent are not verified."};
}
