import {NextResponse} from 'next/server';

export async function GET(request:Request){
  const url=new URL(request.url);
  const code=url.searchParams.get('code');
  const state=url.searchParams.get('state');
  const expectedState=request.headers.get('cookie')?.match(/(?:^|;\s*)meta_oauth_state=([^;]+)/)?.[1];
  if(!code||!state||!expectedState||state!==decodeURIComponent(expectedState))return NextResponse.redirect(new URL('/dashboard/accounts?error=meta_oauth_state',url.origin));

  const appId=process.env.META_APP_ID;
  const appSecret=process.env.META_APP_SECRET;
  if(!appId||!appSecret)return NextResponse.redirect(new URL('/dashboard/accounts?error=meta_app_credentials',url.origin));

  try{
    const redirectUri=`${url.origin}/api/meta/facebook/callback`;
    const exchange=await fetch('https://graph.facebook.com/v23.0/oauth/access_token?'+new URLSearchParams({client_id:appId,client_secret:appSecret,redirect_uri:redirectUri,code}),{cache:'no-store'});
    const shortToken=await exchange.json();
    if(!exchange.ok||!shortToken.access_token)throw new Error(shortToken.error?.message||'Meta token exchange failed');

    // Convert the OAuth user token to a long-lived token before it is used to discover Pages.
    const longLived=await fetch('https://graph.facebook.com/v23.0/oauth/access_token?'+new URLSearchParams({
      grant_type:'fb_exchange_token',
      client_id:appId,
      client_secret:appSecret,
      fb_exchange_token:shortToken.access_token,
    }),{cache:'no-store'});
    const exchanged=await longLived.json();
    if(!longLived.ok||!exchanged.access_token)throw new Error(exchanged.error?.message||'Unable to obtain a long-lived Meta token');

    const response=NextResponse.redirect(new URL('/dashboard/accounts?facebook=connected',url.origin));
    response.cookies.set('meta_fb_user_token',exchanged.access_token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:Math.max(300,Number(exchanged.expires_in||5184000))});
    response.cookies.set('meta_oauth_state','',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0});
    return response;
  }catch(error){
    const message=error instanceof Error?error.message:'Facebook connection failed.';
    return NextResponse.redirect(new URL(`/dashboard/accounts?error=${encodeURIComponent(message)}`,url.origin));
  }
}
