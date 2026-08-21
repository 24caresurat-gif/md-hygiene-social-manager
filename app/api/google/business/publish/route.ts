import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Body = { accountId?: string; summary?: string; mediaUrl?: string; callToActionUrl?: string };

async function refreshGoogleToken(account:any) {
  if (!account.refresh_token) return account.access_token;
  if (account.token_expires_at && new Date(account.token_expires_at).getTime() > Date.now() + 60_000) return account.access_token;
  const response = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_BUSINESS_CLIENT_ID!,client_secret:process.env.GOOGLE_BUSINESS_CLIENT_SECRET!,grant_type:'refresh_token',refresh_token:account.refresh_token})});
  const token=await response.json(); if(!response.ok||!token.access_token) throw new Error(token.error_description||'Google token refresh failed.');
  return token.access_token as string;
}

export async function POST(request:Request){
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,''); if(!token)return NextResponse.json({error:'Your Social Manager session has expired.'},{status:401});
  const body=(await request.json().catch(()=>null)) as Body|null; const accountId=body?.accountId?.trim(); const summary=body?.summary?.trim();
  if(!accountId||!summary)return NextResponse.json({error:'Google Business location and post summary are required.'},{status:400});
  const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${token}`}}});
  try{
    const {data:user}=await supabase.auth.getUser(token); if(!user.user)throw new Error('Invalid Social Manager session.');
    const {data:account,error:accountError}=await supabase.from('social_accounts').select('id,name,platform_account_id,access_token,refresh_token,token_expires_at,status,brand_id').eq('id',accountId).eq('user_id',user.user.id).eq('platform','google_business').single();
    if(accountError||!account)throw new Error('Connected Google Business location not found.'); if(account.status!=='connected'||!account.access_token)throw new Error('Google Business connection is not active.');
    const accessToken=await refreshGoogleToken(account);
    const payload:any={summary}; if(body?.mediaUrl)payload.media=[{mediaFormat:'PHOTO',sourceUrl:body.mediaUrl}]; if(body?.callToActionUrl)payload.callToAction={actionType:'LEARN_MORE',url:body.callToActionUrl};
    const endpoint=`https://mybusiness.googleapis.com/v4/${account.platform_account_id}/localPosts`;
    const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'}); const result=await response.json();
    if(!response.ok||result.error)throw new Error(result.error?.message||'Google Business rejected the post.');
    await supabase.from('social_posts').insert({user_id:user.user.id,brand_id:account.brand_id,social_account_id:account.id,platform:'google_business',platform_post_id:result.name||result.localPost?.name||null,message:summary,media_type:body?.mediaUrl?'image':'none',status:'published',published_at:new Date().toISOString()});
    return NextResponse.json({published:true,postId:result.name||result.localPost?.name||null,account:account.name});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to publish to Google Business.'},{status:400});}
}
