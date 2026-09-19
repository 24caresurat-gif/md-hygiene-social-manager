import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exchangeGoogleCode, listGoogleAccounts } from '../../../../../lib/google-business';
import { importGoogleAccount, saveGoogleSocialAccount } from '../../../../../lib/google-business-sync';

function cookie(request:Request,name:string){
  const raw=request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))?.[1]||'';
  try{return decodeURIComponent(raw)}catch{return raw}
}
function clear(response:NextResponse){
  for(const name of ['google_oauth_state','google_workspace_id','google_user_token']){
    response.cookies.set(name,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0});
  }
  return response;
}

export async function GET(request:Request){
  const url=new URL(request.url),origin=url.origin,state=url.searchParams.get('state')||'',code=url.searchParams.get('code')||'',oauthError=url.searchParams.get('error')||'';
  const expected=cookie(request,'google_oauth_state'),workspaceId=cookie(request,'google_workspace_id'),authToken=cookie(request,'google_user_token');
  if(oauthError)return clear(NextResponse.redirect(new URL('/dashboard/gmb?google_error=cancelled',origin)));
  if(!code||!state||!expected||state!==expected)return clear(NextResponse.redirect(new URL('/dashboard/gmb?google_error=oauth_state',origin)));
  if(!workspaceId||!authToken)return clear(NextResponse.redirect(new URL('/dashboard/gmb?google_error=session',origin)));

  const clientId=process.env.GOOGLE_CLIENT_ID,clientSecret=process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri=process.env.GOOGLE_OAUTH_REDIRECT_URI||`${origin}/api/google/business/callback`;
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!clientId||!clientSecret||!supabaseUrl||!anonKey)return clear(NextResponse.redirect(new URL('/dashboard/gmb?google_error=config',origin)));

  try{
    const supabase=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:`Bearer ${authToken}`}}});
    const {data:userData,error:userError}=await supabase.auth.getUser(authToken);
    if(userError||!userData.user)throw new Error('Login session is invalid. Please reconnect while signed in.');
    const member=await supabase.from('workplace_members').select('workspace_id,active')
      .eq('workspace_id',workspaceId).eq('user_id',userData.user.id).eq('active',true).maybeSingle();
    if(member.error)throw member.error;
    if(!member.data)throw new Error('You no longer have access to this workspace.');

    const tokenData=await exchangeGoogleCode({code,clientId,clientSecret,redirectUri});
    const {data:brand}=await supabase.from('brands').select('id').eq('workspace_id',workspaceId).eq('user_id',userData.user.id).maybeSingle();
    const accounts=await listGoogleAccounts(tokenData.access_token);
    if(!accounts.length)throw new Error('Google connected, but no Business Profile accounts were returned for this Google user.');

    let locations=0,reviews=0;
    for(const account of accounts){
      const socialAccountId=await saveGoogleSocialAccount({
        supabase,userId:userData.user.id,workspaceId,brandId:brand?.id||null,account,tokenData
      });
      const result=await importGoogleAccount({supabase,workspaceId,socialAccountId,account,accessToken:tokenData.access_token});
      locations+=result.locations;reviews+=result.reviews;
    }

    return clear(NextResponse.redirect(new URL(`/dashboard/gmb?google=connected&accounts=${accounts.length}&locations=${locations}&reviews=${reviews}`,origin)));
  }catch(error){
    const message=error instanceof Error?error.message:'Google Business connection failed.';
    return clear(NextResponse.redirect(new URL(`/dashboard/gmb?google_error=${encodeURIComponent(message)}`,origin)));
  }
}