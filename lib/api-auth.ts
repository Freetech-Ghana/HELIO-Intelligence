import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export type ApiAuth =
  | { ok: true; db: SupabaseClient; user: User }
  | { ok: false; status: number; code: string; error: string };

export async function authenticateApi(request: NextRequest): Promise<ApiAuth> {
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) return {ok:false,status:401,code:"missing_token",error:"No access token received. Please sign in again."};
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return {ok:false,status:500,code:"missing_config",error:"Server Supabase environment variables are missing."};
  const db = createClient(url,key,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:`Bearer ${match[1]}`}}
  });
  try {
    const {data,error} = await db.auth.getUser(match[1]);
    if (error || !data.user) return {ok:false,status:401,code:"invalid_session",error:"Supabase rejected this session. Sign out and sign in again."};
    return {ok:true,db,user:data.user};
  } catch {
    return {ok:false,status:503,code:"auth_unreachable",error:"Unable to reach Supabase Auth. Check server connectivity."};
  }
}
