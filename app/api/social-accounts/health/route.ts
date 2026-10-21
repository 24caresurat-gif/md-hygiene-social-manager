import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { workspaceAccess } from '../../../../lib/workspace-auth';

const FB_GRAPH = 'https://graph.facebook.com/v23.0';
const IG_GRAPH = 'https://graph.instagram.com/v23.0';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function auth(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data, error } = await client.auth.getUser(token);
  if (error) return null;
  return data.user || null;
}

export async function POST(req: NextRequest) {
  const user = await auth(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const accountId = typeof body?.accountId === 'string' ? body.accountId.trim() : '';
  if (!accountId) return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });

  const db = admin();
  try {
    const { data: account, error: accountError } = await db
      .from('social_accounts')
      .select('id,platform,access_token,status,user_id,workspace_id,brand_id')
      .eq('id', accountId)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

    const workspaceId = String(account.workspace_id || account.brand_id || '');
    if (!workspaceId) return NextResponse.json({ error: 'Account is not assigned to a workspace.' }, { status: 403 });
    const access = await workspaceAccess(db, user.id, workspaceId);
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });

    const privileged = Boolean(access.globalAdmin || access.isOwner || ['owner', 'admin'].includes(String(access.role || '').toLowerCase()));
    if (!privileged && account.user_id !== user.id) {
      return NextResponse.json({ error: 'Account health can only be checked by its connector or a Workspace Owner/Admin.' }, { status: 403 });
    }

    let state = 'active';
    let tokenError: string | null = null;
    let expiresAt: string | null = null;
    if (!account.access_token) {
      state = 'reconnect_required';
      tokenError = 'Access token is missing.';
    } else {
      try {
        if (account.platform === 'facebook') {
          const appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
          const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
          if (!appId || !appSecret) throw new Error('Meta app credentials are not configured.');
          const response = await fetch(
            `${FB_GRAPH}/debug_token?input_token=${encodeURIComponent(account.access_token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
            { cache: 'no-store' },
          );
          const payload = await response.json();
          if (!response.ok || payload.error || !payload.data?.is_valid) {
            throw new Error(payload.error?.message || 'Meta token is invalid.');
          }
          const expiry = Number(payload.data.expires_at || 0) * 1000;
          expiresAt = expiry ? new Date(expiry).toISOString() : null;
          if (expiry && expiry <= Date.now()) state = 'expired';
          else if (expiry && expiry - Date.now() < 7 * 86400000) state = 'expiring';
        } else if (account.platform === 'instagram') {
          const response = await fetch(
            `${IG_GRAPH}/me?fields=id,user_id,username,name&access_token=${encodeURIComponent(account.access_token)}`,
            { cache: 'no-store' },
          );
          const payload = await response.json();
          if (!response.ok || payload.error || !payload.id) {
            throw new Error(payload.error?.message || 'Instagram token is invalid.');
          }
        }
      } catch (error) {
        state = 'reconnect_required';
        tokenError = error instanceof Error ? error.message : 'Token validation failed.';
      }
    }

    const checkedAt = new Date().toISOString();
    const connectionStatus = state === 'reconnect_required' || state === 'expired'
      ? 'reconnect_required'
      : account.status;
    const { error: updateError } = await db.from('social_accounts').update({
      token_checked_at: checkedAt,
      token_expires_at: expiresAt,
      token_status: state,
      token_error: tokenError,
      status: connectionStatus,
    }).eq('id', account.id);
    if (updateError) throw updateError;

    return NextResponse.json({ status: state, tokenExpiresAt: expiresAt, error: tokenError });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Token health check failed.',
    }, { status: 500 });
  }
}
