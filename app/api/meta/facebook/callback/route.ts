import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminDb, workspaceAccess } from '../../../../../lib/workspace-auth';

function cookie(request: Request, name: string) {
  const raw = request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))?.[1] || '';
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function clearOAuthCookies(response: NextResponse) {
  for (const name of ['meta_oauth_state', 'meta_fb_oauth_auth_token']) {
    response.cookies.set(name, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  }
  return response;
}

function failure(origin: string, message: string) {
  return clearOAuthCookies(NextResponse.redirect(new URL('/dashboard/accounts?error=' + encodeURIComponent(message), origin)));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const oauthError = url.searchParams.get('error_description') || url.searchParams.get('error') || '';
  const expectedState = cookie(request, 'meta_oauth_state');
  const workspaceId = cookie(request, 'workspace_brand_id');
  const authToken = cookie(request, 'meta_fb_oauth_auth_token');

  if (oauthError) return failure(origin, 'Facebook authorization was cancelled or denied.');
  if (!code || !state || !expectedState || state !== expectedState) return failure(origin, 'Facebook authorization state is invalid.');
  if (!workspaceId || !authToken) return failure(origin, 'Signed-in workspace session expired. Please reconnect from Settings.');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const appId = process.env.META_APP_ID || '1578165993688458';
  const appSecret = process.env.META_APP_SECRET;
  if (!supabaseUrl || !anonKey) return failure(origin, 'Supabase configuration is missing.');
  if (!appId || !appSecret) return failure(origin, 'Meta app credentials are not configured.');

  try {
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${authToken}` } } });
    const { data: userData, error: userError } = await userClient.auth.getUser(authToken);
    if (userError || !userData.user) throw new Error('Login session is invalid. Please reconnect while signed in.');

    const db = adminDb();
    const access = await workspaceAccess(db, userData.user.id, workspaceId);
    const privileged = Boolean(access && (access.globalAdmin || access.isOwner || ['owner', 'admin'].includes(String(access.role || '').toLowerCase())));
    if (!access?.hasAccess || !privileged) throw new Error('Workspace access changed. Only a Workspace Owner or Admin can connect Facebook.');

    const redirectUri = `${origin}/api/meta/facebook/callback`;
    const exchange = await fetch('https://graph.facebook.com/v23.0/oauth/access_token?' + new URLSearchParams({
      client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code,
    }), { cache: 'no-store' });
    const shortToken = await exchange.json().catch(() => ({}));
    if (!exchange.ok || !shortToken.access_token) throw new Error(shortToken.error?.message || 'Meta token exchange failed.');

    const longLived = await fetch('https://graph.facebook.com/v23.0/oauth/access_token?' + new URLSearchParams({
      grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken.access_token,
    }), { cache: 'no-store' });
    const exchanged = await longLived.json().catch(() => ({}));
    if (!longLived.ok || !exchanged.access_token) throw new Error(exchanged.error?.message || 'Unable to obtain a long-lived Meta token.');

    const response = NextResponse.redirect(new URL('/dashboard/accounts?facebook=connected', origin));
    response.cookies.set('meta_fb_user_token', exchanged.access_token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
      maxAge: Math.max(300, Number(exchanged.expires_in || 5184000)),
    });
    response.cookies.set('workspace_brand_id', workspaceId, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
      maxAge: Math.max(300, Number(exchanged.expires_in || 5184000)),
    });
    return clearOAuthCookies(response);
  } catch (error) {
    return failure(origin, error instanceof Error ? error.message : 'Facebook connection failed.');
  }
}
