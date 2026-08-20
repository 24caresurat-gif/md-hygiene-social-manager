import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export async function GET(request:Request){
 const url=new URL(request.url); const code=url.searchParams.get('code'); const state=url.searchParams.get('state'); const store=await cookies();
 const expected=store.get('google_business_oauth_state')?.value;
 if(!code||!state||!expected||state!==expected)return NextResponse.redirect(new URL('/dashboard/accounts?error=google_oauth_state',url.origin));
 const clientId=process.env.GOOGLE_BUSINESS_CLIENT_ID,secret=process.env.GOOGLE_BUSINESS_CLIENT_SECRET;
 if(!clientId||!secret)return NextResponse.redirect(new URL('/dashboard/accounts?error=google_oauth_config',url.origin));
 try{
  const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:secret,code,grant_type:'authorization_code',redirect_uri:`${url.origin}/api/google/business/callback`})});
  const token=await tokenResponse.json(); if(!token.access_token)throw new Error(token.error_description||'Google token exchange failed.');
  const userToken=store.get('supabase-auth-token')?.value;
  if(!userToken)return NextResponse.redirect(new URL('/dashboard/accounts?error=google_session',url.origin));
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!supabaseUrl||!anon)throw new Error('Supabase configuration is missing.');
  const supabase=createClient(supabaseUrl,anon,{global:{headers:{Authorization:`Bearer ${userToken}`}}});
  const {data:user}=await supabase.auth.getUser(userToken); if(!user.user)throw new Error('Invalid session.');
  const accountsResponse=await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts',{headers:{Authorization:`Bearer ${token.access_token}`},cache:'no-store'}); const accounts=await accountsResponse.json();
  if(!accountsResponse.ok||accounts.error)throw new Error(accounts.error?.message||'Unable to read Google Business accounts.');
  const profiles=accounts.accounts||[];
  for(const profile of profiles){
   const id=String(profile.name||'').replace(/^accounts\//,''); const name=profile.accountName||id;
   const {data:existing}=await supabase.from('social_accounts').select('id').eq('user_id',user.user.id).eq('platform','google_business').eq('platform_account_id',id).maybeSingle();
   const payload={user_id:user.user.id,platform:'google_business',name,handle:null,platform_account_id:id,access_token:token.access_token,refresh_token:token.refresh_token||null,token_expires_at:token.expires_in?new Date(Date.now()+Number(token.expires_in)*1000).toISOString():null,status:'connected',updated_at:new Date().toISOString()};
   const result=existing?await supabase.from('social_accounts').update(payload).eq('id',existing.id):await supabase.from('social_accounts').insert(payload); if(result.error)throw result.error;
  }
  const response=NextResponse.redirect(new URL(`/dashboard/accounts?google=connected&count=${profiles.length}`,url.origin)); response.cookies.set('google_business_oauth_state','',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0}); return response;
 }catch(error){return NextResponse.redirect(new URL(`/dashboard/accounts?error=${encodeURIComponent(error instanceof Error?error.message:'Google Business connection failed.')}`,url.origin));}
}
