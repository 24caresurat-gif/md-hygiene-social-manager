import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = request.headers.get('cookie')?.match(/(?:^|;\s*)meta_oauth_state=([^;]+)/)?.[1];

  if (!code || !state || !expectedState || state !== decodeURIComponent(expectedState)) {
    return NextResponse.redirect(new URL('/dashboard/accounts?error=meta_oauth_state', url.origin));
  }

  const appId = process.env.META_APP_ID || '1578165993688458';
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    return NextResponse.redirect(new URL('/dashboard/accounts?error=meta_app_secret', url.origin));
  }

  try {
    const redirectUri = `${url.origin}/api/meta/facebook/callback`;
    const tokenResponse = await fetch('https://graph.facebook.com/v23.0/oauth/access_token?' + new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    }));
    const token = await tokenResponse.json();
    if (!token.access_token) throw new Error(token.error?.message || 'Meta token exchange failed');

    const response = NextResponse.redirect(new URL('/dashboard/accounts?facebook=connected', url.origin));
    response.cookies.set('meta_fb_user_token', token.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 1800,
    });
    response.cookies.set('meta_oauth_state', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Facebook connection failed.';
    return NextResponse.redirect(new URL(`/dashboard/accounts?error=${encodeURIComponent(message)}`, url.origin));
  }
}
