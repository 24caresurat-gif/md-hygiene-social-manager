import { NextResponse } from 'next/server';
const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || '1327116485900860';
const SCOPES = 'instagram_business_basic,instagram_business_content_publish';
export async function GET(request: Request) {
  const url = new URL(request.url), brandId = url.searchParams.get('brandId') || '', auth = request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if (!brandId) return NextResponse.json({ error: 'Select a workspace before connecting Instagram.' }, { status: 400 });
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const state = crypto.randomUUID(), redirectUri = `${url.origin}/api/meta/instagram/callback`;
  const oauth = new URL('https://www.instagram.com/oauth/authorize');
  oauth.searchParams.set('client_id', INSTAGRAM_APP_ID); oauth.searchParams.set('redirect_uri', redirectUri); oauth.searchParams.set('response_type','code'); oauth.searchParams.set('scope',SCOPES); oauth.searchParams.set('state',state);
  const response = NextResponse.json({ url: oauth.toString() });
  response.cookies.set('instagram_oauth_state',state,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:600});
  response.cookies.set('instagram_brand_id',brandId,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:600});
  response.cookies.set('instagram_user_token',auth,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:600});
  return response;
}
