import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const appId = process.env.META_APP_ID;
  const configId = process.env.META_CONFIG_ID;

  if (!appId || !configId) {
    return NextResponse.json({ error: 'Meta configuration is missing.' }, { status: 500 });
  }

  const redirectUri = `${origin}/api/meta/facebook/callback`;
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(
    `https://www.facebook.com/v23.0/dialog/oauth?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&config_id=${encodeURIComponent(configId)}&response_type=code`
  );

  response.cookies.set('meta_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  return response;
}
