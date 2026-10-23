import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminDb, workspaceAccess } from '../../../../../lib/workspace-auth';

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || '1327116485900860';
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET;

function cookie(request: Request, name: string) {
  const raw = request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))?.[1] || '';
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function clearOAuthCookies(response: NextResponse) {
  const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 0 };
  for (const name of ['instagram_oauth_state', 'instagram_brand_id', 'instagram_user_token']) {
    response.cookies.set(name, '', options);
  }
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const providerError = url.searchParams.get('error_description') || url.searchParams.get('error') || '';
  const expectedState = cookie(request, 'instagram_oauth_state');
  const workspaceId = cookie(request, 'instagram_brand_id');
  const authToken = cookie(request, 'instagram_user_token');

  const failure = (message: string) => clearOAuthCookies(
    NextResponse.redirect(new URL('/dashboard/accounts?error=' + encodeURIComponent(message), url.origin)),
  );

  if (providerError) return failure('Instagram authorization was cancelled or denied.');
  if (!code || !state || !expectedState || state !== expectedState) return failure('Instagram authorization state is invalid.');
  if (!workspaceId || !authToken) return failure('Login/workspace session expired. Please reconnect from Settings.');
  if (!INSTAGRAM_APP_SECRET) return failure('Instagram App Secret is not configured in Vercel as INSTAGRAM_APP_SECRET.');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return failure('Supabase configuration is missing.');

  try {
    // Validate the signed-in user and workspace privileges before exchanging
    // the provider code or writing any social-account credential.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${authToken}` } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(authToken);
    if (userError || !userData.user) throw new Error('Login session is invalid. Please reconnect while signed in.');

    const db = adminDb();
    const access = await workspaceAccess(db, userData.user.id, workspaceId);
    const privileged = Boolean(access && (access.globalAdmin || access.isOwner || ['owner', 'admin'].includes(String(access.role || '').toLowerCase())));
    if (!access?.hasAccess || !privileged) {
      throw new Error('Workspace access changed. Only a Workspace Owner or Admin can connect Instagram.');
    }

    const { data: brand, error: brandError } = await db.from('brands')
      .select('id')
      .eq('workspace_id', workspaceId)
      .limit(1)
      .maybeSingle();
    if (brandError) throw brandError;

    const redirectUri = `${url.origin}/api/meta/instagram/callback`;
    const tokenBody = new URLSearchParams({
      client_id: INSTAGRAM_APP_ID,
      client_secret: INSTAGRAM_APP_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    });
    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
      cache: 'no-store',
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData?.access_token || !tokenData?.user_id) {
      throw new Error(tokenData?.error_message || 'Instagram token exchange failed.');
    }

    let accessToken = String(tokenData.access_token);
    let expiresAt: string | null = null;
    try {
      const longResponse = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(INSTAGRAM_APP_SECRET)}&access_token=${encodeURIComponent(accessToken)}`,
        { cache: 'no-store' },
      );
      const longData = await longResponse.json().catch(() => ({}));
      if (longResponse.ok && longData?.access_token) {
        accessToken = String(longData.access_token);
        if (longData.expires_in) expiresAt = new Date(Date.now() + Number(longData.expires_in) * 1000).toISOString();
      }
    } catch {
      // Keep the returned access token if the long-lived exchange is unavailable.
    }

    const profileResponse = await fetch(
      `https://graph.instagram.com/v23.0/me?fields=id,user_id,username,name&access_token=${encodeURIComponent(accessToken)}`,
      { cache: 'no-store' },
    );
    const profileData = await profileResponse.json().catch(() => ({}));
    if (!profileResponse.ok || profileData?.error || !profileData?.id) {
      throw new Error(profileData?.error?.message || 'Unable to load Instagram profile.');
    }

    const now = new Date().toISOString();
    const payload = {
      user_id: userData.user.id,
      platform: 'instagram',
      name: profileData.name || profileData.username || `Instagram ${profileData.id}`,
      handle: profileData.username || null,
      platform_account_id: String(profileData.id),
      access_token: accessToken,
      status: 'connected',
      brand_id: brand?.id || null,
      workspace_id: workspaceId,
      token_expires_at: expiresAt,
      token_checked_at: now,
      token_last_refreshed_at: now,
      token_status: 'active',
      token_error: null,
      updated_at: now,
    };

    let existingQuery = db.from('social_accounts').select('id')
      .eq('platform', 'instagram')
      .eq('platform_account_id', String(profileData.id))
      .eq('workspace_id', workspaceId);
    if (brand?.id) {
      existingQuery = db.from('social_accounts').select('id')
        .eq('platform', 'instagram')
        .eq('platform_account_id', String(profileData.id))
        .or(`workspace_id.eq.${workspaceId},brand_id.eq.${brand.id}`);
    }
    const { data: existing, error: existingError } = await existingQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;

    const result = existing
      ? await db.from('social_accounts').update(payload).eq('id', existing.id)
      : await db.from('social_accounts').insert(payload);
    if (result.error) throw result.error;

    return clearOAuthCookies(NextResponse.redirect(new URL('/dashboard/accounts?instagram=connected', url.origin)));
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Unable to connect Instagram.');
  }
}
