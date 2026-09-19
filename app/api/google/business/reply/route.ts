import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { refreshGoogleToken } from '../../../../../lib/google-business';
import { getGoogleConnectionBySocialAccount, updateGoogleConnection } from '../../../../../lib/google-business-sync';

async function authUser(request:Request){
  const token=request.headers.get('authorization')?.replace(/^Bearer\\s+/i,'');
  if(!token)throw new Error('Authentication required.');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)throw new Error('Supabase configuration is missing.');
  const supabase=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}}});
  const {data,error}=await supabase.auth.getUser(token);
  if(error||!data.user)throw new Error('Invalid session.');
  return {supabase,user:data.user};
}

export async function POST(request:Request){
  try{
    const {supabase,user}=await authUser(request);
    const body=await request.json().catch(()=>({}));
    const reviewId=String(body.reviewId||'').trim(),reply=String(body.reply||'').trim();
    if(!reviewId)return NextResponse.json({error:'reviewId is required.'},{status:400});
    if(!reply)return NextResponse.json({error:'Reply text is required.'},{status:400});
    if(reply.length>4096)return NextResponse.json({error:'Reply is too long.'},{status:400});
    const review=await supabase.from('google_business_reviews').select('id,workspace_id,profile_id,google_review_id,review_data').eq('id',reviewId).maybeSingle();
    if(review.error)throw review.error;
    if(!review.data)return NextResponse.json({error:'Review not found.'},{status:404});
    const member=await supabase.from('workplace_members').select('role,active').eq('workspace_id',review.data.workspace_id).eq('user_id',user.id).eq('active',true).maybeSingle();
    if(member.error)throw member.error;
    const role=String(member.data?.role||'').toLowerCase();
    if(!member.data||!['owner','admin','manager'].includes(role))return NextResponse.json({error:'You do not have permission to reply to reviews in this workspace.'},{status:403});
    const profile=await supabase.from('google_business_profiles').select('social_account_id').eq('id',review.data.profile_id).eq('workspace_id',review.data.workspace_id).maybeSingle();
    if(profile.error)throw profile.error;
    const connection=await getGoogleConnectionBySocialAccount(String(profile.data?.social_account_id||'')); 
    if(!connection)return NextResponse.json({error:'Google connection not found.'},{status:404});
    let accessToken=String(connection.access_token||'');
    if(connection.refresh_token&&(!connection.token_expires_at||new Date(connection.token_expires_at).getTime()<=Date.now()+60000)){
      const clientId=process.env.GOOGLE_CLIENT_ID,clientSecret=process.env.GOOGLE_CLIENT_SECRET;
      if(!clientId||!clientSecret)return NextResponse.json({error:'Google OAuth credentials are not configured.'},{status:500});
      const refreshed=await refreshGoogleToken({refreshToken:connection.refresh_token,clientId,clientSecret});
      accessToken=refreshed.access_token;
      const expiresAt=refreshed.expires_in?new Date(Date.now()+Number(refreshed.expires_in)*1000).toISOString():null;
      await updateGoogleConnection(String(connection.id),{access_token:accessToken,token_expires_at:expiresAt,token_checked_at:new Date().toISOString(),token_last_refreshed_at:new Date().toISOString(),token_status:'active',token_error:null});
    }
    if(!accessToken)throw new Error('Google access token is missing.');
    const googleResponse=await fetch('https://mybusiness.googleapis.com/v4/'+review.data.google_review_id+'/reply',{method:'PUT',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({comment:reply}),cache:'no-store'});
    const googleData=await googleResponse.json().catch(()=>({}));
    if(!googleResponse.ok||googleData?.error)throw new Error(googleData?.error?.message||('Google reply failed ('+googleResponse.status+').'));
    const now=new Date().toISOString();
    const oldData=(review.data.review_data&&typeof review.data.review_data==='object')?review.data.review_data:{};
    const saved=await supabase.from('google_business_reviews').update({reply_text:reply,replied_at:googleData?.updateTime||now,reply_status:'replied',review_data:{...oldData,reply:googleData||{}},updated_at:now}).eq('id',reviewId).eq('workspace_id',review.data.workspace_id);
    if(saved.error)throw saved.error;
    return NextResponse.json({ok:true,reply_text:reply,replied_at:googleData?.updateTime||now});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to reply to Google review.'},{status:500});
  }
}

export async function DELETE(request:Request){
  try{
    const {supabase,user}=await authUser(request);
    const body=await request.json().catch(()=>({})),reviewId=String(body.reviewId||'').trim();
    if(!reviewId)return NextResponse.json({error:'reviewId is required.'},{status:400});
    const review=await supabase.from('google_business_reviews').select('id,workspace_id,profile_id,google_review_id').eq('id',reviewId).maybeSingle();
    if(review.error)throw review.error;
    if(!review.data)return NextResponse.json({error:'Review not found.'},{status:404});
    const member=await supabase.from('workplace_members').select('role,active').eq('workspace_id',review.data.workspace_id).eq('user_id',user.id).eq('active',true).maybeSingle();
    if(member.error)throw member.error;
    const role=String(member.data?.role||'').toLowerCase();
    if(!member.data||!['owner','admin','manager'].includes(role))return NextResponse.json({error:'You do not have permission to manage replies in this workspace.'},{status:403});
    const profile=await supabase.from('google_business_profiles').select('social_account_id').eq('id',review.data.profile_id).eq('workspace_id',review.data.workspace_id).maybeSingle();
    if(profile.error)throw profile.error;
    const social=await supabase.from('social_accounts').select('id,access_token,refresh_token,token_expires_at').eq('id',profile.data?.social_account_id||'').eq('workspace_id',review.data.workspace_id).maybeSingle();
    if(social.error)throw social.error;
    let accessToken=String(social.data?.access_token||'');
    if(social.data?.refresh_token&&(!social.data?.token_expires_at||new Date(social.data.token_expires_at).getTime()<=Date.now()+60000)){
      const clientId=process.env.GOOGLE_CLIENT_ID,clientSecret=process.env.GOOGLE_CLIENT_SECRET;
      if(!clientId||!clientSecret)throw new Error('Google OAuth credentials are not configured.');
      const refreshed=await refreshGoogleToken({refreshToken:social.data.refresh_token,clientId,clientSecret});
      accessToken=refreshed.access_token;
      await supabase.from('social_accounts').update({access_token:accessToken,token_expires_at:refreshed.expires_in?new Date(Date.now()+Number(refreshed.expires_in)*1000).toISOString():null,token_checked_at:new Date().toISOString(),token_last_refreshed_at:new Date().toISOString(),token_status:'active',token_error:null}).eq('id',social.data.id).eq('workspace_id',review.data.workspace_id);
    }
    if(!accessToken)throw new Error('Google access token is missing. Reconnect Google before deleting a reply.');
    const googleResponse=await fetch('https://mybusiness.googleapis.com/v4/'+review.data.google_review_id+'/reply',{method:'DELETE',headers:{Authorization:'Bearer '+accessToken},cache:'no-store'});
    const googleData=await googleResponse.json().catch(()=>({}));
    if(!googleResponse.ok&&googleResponse.status!==204)throw new Error(googleData?.error?.message||('Google reply deletion failed ('+googleResponse.status+').'));
    const saved=await supabase.from('google_business_reviews').update({reply_text:null,replied_at:null,reply_status:'not_replied',updated_at:new Date().toISOString()}).eq('id',reviewId).eq('workspace_id',review.data.workspace_id);
    if(saved.error)throw saved.error;
    return NextResponse.json({ok:true});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to delete Google review reply.'},{status:500});
  }
}