import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const apiKey = process.env.RESEND_API_KEY;
  if (!token || !url || !key) return NextResponse.json({error:'Sign in required'}, {status:401});
  const supabase = createClient(url,key,{auth:{persistSession:false}});
  const {data:{user},error:authError} = await supabase.auth.getUser(token);
  if (authError || !user?.email || !user.email_confirmed_at) return NextResponse.json({error:'Verified sign-in required'}, {status:401});
  const allowed = process.env.RESEND_TEST_RECIPIENT?.trim().toLowerCase();
  if (!allowed || user.email.toLowerCase() !== allowed) return NextResponse.json({error:'Test sending is restricted to the configured, signed-in account email.'}, {status:403});
  if (!apiKey) return NextResponse.json({error:'RESEND_API_KEY is not configured'}, {status:503});
  let input:unknown;
  try { input=await request.json(); } catch { return NextResponse.json({error:'Invalid request'}, {status:400}); }
  const body=input as {subject?:unknown;message?:unknown};
  if (typeof body?.subject !== 'string' || typeof body?.message !== 'string' || !body.subject.trim() || !body.message.trim() || body.subject.length>180 || body.message.length>5000) return NextResponse.json({error:'Subject or message invalid'}, {status:400});
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method:'POST', headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({from:'HELIO Intelligence <onboarding@resend.dev>',to:[allowed],subject:body.subject.trim(),text:body.message.trim()})
    });
    const result=await response.json();
    if (!response.ok) return NextResponse.json({error:result?.message||'Resend rejected test email'}, {status:502});
    return NextResponse.json({id:result.id,to:allowed,status:'accepted_by_provider'});
  } catch {return NextResponse.json({error:'Email provider unavailable'}, {status:502});}
}
