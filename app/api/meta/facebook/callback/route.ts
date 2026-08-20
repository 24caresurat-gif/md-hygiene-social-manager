import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type FacebookPageRow = {
  user_id: null;
  platform: 'facebook';
  name: string;
  handle: string | null;
  platform_account_id: string;
  access_token: string;
  status: 'connected';
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = request.headers.get('cookie')?.match(/(?:^|;\s*)meta_oauth_state=([^;]+)/)?.[1];

  if (!code || !state || !expectedState || state !== decodeURIComponent(expectedState)) {
    return NextResponse.redirect(new URL('/dashboard/accounts?error=meta_oauth_state', url.origin));
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!appId || !appSecret || !supabaseUrl || !serviceRoleKey) {
    return NextResponse.redirect(new URL('/dashboard/accounts?error=meta_server_config', url.origin));
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

    const pagesResponse = await fetch(`https://graph.facebook.com/v23.0/me/accounts?fields=id,name,access_token,username&access_token=${encodeURIComponent(token.access_token)}`);
    const pages = await pagesResponse.json();
    if (pages.error) throw new Error(pages.error.message);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const pageRows: FacebookPageRow[] = (pages.data || []).map((page: { id: string; name: string; access_token?: string; username?: string }) => ({
      user_id: null,
      platform: 'facebook',
      name: page.name,
      handle: page.username || null,
      platform_account_id: page.id,
      access_token: page.access_token || token.access_token,
      status: 'connected',
    }));

    // A secure authenticated-user implementation will attach the Supabase auth user here.
    // Until that session bridge is wired, do not write ambiguous ownership into the database.
    void supabase;
    return NextResponse.json({
      connected: true,
      pages: pageRows.map((page: FacebookPageRow) => {
        const { access_token: _accessToken, ...safePage } = page;
        return safePage;
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Facebook connection failed.';
    return NextResponse.redirect(new URL(`/dashboard/accounts?error=${encodeURIComponent(message)}`, url.origin));
  }
}
