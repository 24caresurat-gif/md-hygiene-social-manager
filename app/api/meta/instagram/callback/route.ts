import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || '1327116485900860';
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET;
export async function GET(request: Request) {
  const url = new URL(request.url), code=url.searchParams.get('code'), state=url.searchParams.get('state');
  const cookies=request.headers.get('cookie')||'';
  const readCookie=(name:string)=>cookies.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1]||'';
  const expectedState=readCookie('instagram_oauth_state'), brandId=decodeURIComponent(readCookie('instagram_brand_id')), authToken=readCookie('instagram_user_token');
  const fail=(message:string)=>NextResponse.redirect(new URL(`/dashboard/accounts?error=${encodeURIComponent(message)}`,url.origin));
  if(!code)return fail('Instagram authorization was cancelled.');
  if(!state||!expectedState||state!==expectedState)return fail('Instagram authorization state is invalid.');
  if(!brandId)return fail('Workspace was not found for Instagram connection.');
  if(!authToken)return fail('Login session is missing. Please reconnect while logged in.');
  if(!INSTAGRAM_APP_SECRET)return fail('Instagram App Secret is not configured in Vercel as INSTAGRAM_APP_SECRET.');
  try{
    const redirectUri=`${url.origin}/api/meta/instagram/callback`;
    const tokenBody=new URLSearchParams({client_id:INSTAGRAM_APP_ID,client_secret:INSTAGRAM_APP_SECRET,grant_type:'authorization_code',redirect_uri:redirectUri,code});
    const tokenResponse=await fetch('https://api.instagram.com/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:tokenBody});
    const tokenData=await tokenResponse.json().catch(()=>({}));
    if(!tokenResponse.ok||!tokenData?.access_token||!tokenData?.user_id)throw new Error(tokenData?.error_message||'Instagram token exchange failed.');
    let accessToken=String(tokenData.access_token),expiresAt:string|null=null;
    try{const longResponse=await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(INSTAGRAM_APP_SECRET)}&access_token=${encodeURIComponent(accessToken)}`,{cache:'no-store'});const longData=await longResponse.json().catch(()=>({}));if(longResponse.ok&&longData?.access_token){accessToken=String(longData.access_token);if(longData.expires_in)expiresAt=new Date(Date.now()+Number(longData.expires_in)*1000).toISOString()}}catch{}
    const profileResponse=await fetch(`https://graph.instagram.com/v23.0/me?fields=id,user_id,username,name&access_token=${encodeURIComponent(accessToken)}`,{cache:'no-store'}),profileData=await profileResponse.json().catch(()=>({}));
    if(!profileResponse.ok||profileData?.error)throw new Error(profileData?.error?.message||'Unable to load Instagram profile.');
    const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;if(!anon||!supabaseUrl)throw new Error('Supabase configuration is missing.');
    const supabase=createClient(supabaseUrl,anon,{global:{headers:{Authorization:`Bearer ${authToken}`}}});
    const {data:user,error:authError}=await supabase.auth.getUser(authToken);if(authError||!user.user)throw new Error('Login session is invalid. Please reconnect.');
    const now=new Date().toISOString(),payload={user_id:user.user.id,platform:'instagram',name:profileData.name||profileData.username||`Instagram ${profileData.id}`,handle:profileData.username||null,platform_account_id:String(profileData.id),access_token:accessToken,status:'connected',brand_id:brandId,token_expires_at:expiresAt,token_checked_at:now,token_last_refreshed_at:now,token_status:'active',token_error:null,updated_at:now};
    const {data:existing}=await supabase.from('social_accounts').select('id').eq('user_id',user.user.id).eq('platform','instagram').eq('platform_account_id',String(profileData.id)).eq('brand_id',brandId).maybeSingle();
    const result=existing?await supabase.from('social_accounts').update(payload).eq('id',existing.id).eq('user_id',user.user.id):await supabase.from('social_accounts').insert(payload);if(result.error)throw result.error;
    return NextResponse.redirect(new URL('/dashboard/accounts?instagram=connected',url.origin));
  }catch(error){return fail(error instanceof Error?error.message:'Unable to connect Instagram.')}
}
