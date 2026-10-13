import {createClient, type SupabaseClient} from '@supabase/supabase-js';
let client: SupabaseClient | undefined;
export function db(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new Error('Configure Supabase environment variables');
 if(!client)client=createClient(url,key);
 return client;
}
