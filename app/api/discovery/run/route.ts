import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {scanSource} from '../../../../lib/discovery';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(req:NextRequest){
 const secret=process.env.HELIO_SCANNER_SECRET;const bearer=req.headers.get('authorization');
 const configuredOwner=process.env.HELIO_SCANNER_OWNER_ID;
 const isScheduler=Boolean(secret&&secret.length>=24&&bearer===`Bearer ${secret}`);
 if(!isScheduler){
  const token=bearer?.startsWith('Bearer ')?bearer.slice(7):'';
  const publicUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,publicKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!token||!publicUrl||!publicKey||!configuredOwner)return NextResponse.json({error:'Unauthorized'},{status:401});
  const authDb=createClient(publicUrl,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await authDb.auth.getUser(token);
  if(error||!data.user||data.user.id!==configuredOwner)return NextResponse.json({error:'Unauthorized'},{status:401});
 }

 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,owner=process.env.HELIO_SCANNER_OWNER_ID;
 if(!url||!key||!owner)return NextResponse.json({error:'Server scanner configuration incomplete'},{status:503});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:run,error:runError}=await db.from('exhibition_discovery_runs').insert({owner_id:owner}).select('id').single();
 if(runError)return NextResponse.json({error:'Cannot start discovery run: '+runError.message},{status:500});
 let discovered=0,duplicates=0,checked=0;const errors:string[]=[];
 const {data:sourceRows,error:sourceError}=await db.from('exhibition_discovery_sources').select('id,name,source_url').eq('is_enabled',true).eq('country','UAE').order('name');
 if(sourceError){await db.from('exhibition_discovery_runs').update({status:'failed',finished_at:new Date().toISOString(),errors:[sourceError.message]}).eq('id',run.id);return NextResponse.json({error:'Cannot load sources: '+sourceError.message},{status:500})}
 const sourceResults:{name:string;status:string;found:number;detail?:string}[]=[];
 for(const source of sourceRows||[]){
  try{const found=await scanSource({name:source.name,url:source.source_url});checked++;sourceResults.push({name:source.name,status:found.length?'events_found':'no_compatible_events',found:found.length});
   for(const event of found){
    const {data:existing,error:lookupError}=await db.from('exhibitions').select('id').eq('owner_id',owner).eq('discovery_key',event.key).maybeSingle();
    if(lookupError)throw Error(lookupError.message);
    if(existing){duplicates++;await db.from('exhibitions').update({discovery_last_seen:new Date().toISOString()}).eq('id',existing.id).eq('owner_id',owner);continue;}
    const payload={owner_id:owner,name:event.name,edition_year:Number(event.start.slice(0,4)),discovery_key:event.key,discovery_event_url:event.url,discovery_source_url:event.source,discovery_last_seen:new Date().toISOString(),discovery_start_date:event.start,discovery_end_date:event.end,discovery_city:event.city,discovery_country:'UAE',venue:event.venue,source_date_text:event.start+(event.end?' – '+event.end:''),date_verified:false,research_status:'not_started'};
    const {error}=await db.from('exhibitions').insert(payload);
    if(error){if(error.code==='23505')duplicates++;else errors.push(`${source.name}: ${error.message}`)}else discovered++;
   }
  }catch(e){const detail=e instanceof Error?e.message:'Scan failed';errors.push(`${source.name}: ${detail}`);sourceResults.push({name:source.name,status:'error',found:0,detail})}
  const sourceResult=sourceResults[sourceResults.length-1];
  await db.from('exhibition_discovery_sources').update({last_checked_at:new Date().toISOString(),last_status:sourceResult.status,last_error:sourceResult.detail||null,events_discovered:sourceResult.found}).eq('id',source.id);
 }
 const status=errors.length?(checked?'partial':'failed'):'completed';
 await db.from('exhibition_discovery_runs').update({status,finished_at:new Date().toISOString(),sources_checked:checked,discovered,duplicates,errors}).eq('id',run.id);
 return NextResponse.json({status,run_id:run.id,sources_checked:checked,discovered,duplicates,errors,source_results:sourceResults});
}
