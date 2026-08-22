import { NextResponse } from 'next/server';

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || '1327116485900860';
const SCOPES = 'instagram_business_basic,instagram_business_content_publish';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const brandId = url.searchParams.get('brandId') || '';
  if (!brandId) return NextResponse.json({ error: 'Select a workspace before connecting Instagram.' }, { status: 400 });
  if (!INSTAGRAM_APP_ID) return NextResponse.json({ error: 'Instagram App ID is not configured.' }, { status: 503 });

  const state = crypto.randomUUID();
  const redirectUri = `${url.origin}/api/meta/instagram/callback`;
  const oauth = new URL('https://www.instagram.com/oauth/authorize');
  oauth.searchParams.set('client_id', INSTAGRAM_APP_ID);
  oauth.searchParams.set('redirect_uri', redirectUri);
  oauth.searchParams.set('response_type', 'code');
  oauth.searchParams.set('scope', SCOPES);
  oauth.searchParams.set('state', state);

  const response = NextResponse.redirect(oauth);
  response.cookies.set('instagram_oauth_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600 });
  response.cookies.set('instagram_brand_id', brandId, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600 });
  return response;
}
