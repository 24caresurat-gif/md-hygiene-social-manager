import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listGoogleAccounts, refreshGoogleToken } from '../../../../../lib/google-business';
import {
  getGoogleConnectionBySocialAccount,
  importGoogleAccount,
  updateGoogleConnection,
} from '../../../../../lib/google-business-sync';
import { adminDb, workspaceAccess } from '../../../../../lib/workspace-auth';

export async function POST(request: Request) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\\s+/i, '');
    if (!token) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { workspaceId = '' } = await request.json().catch(() => ({}));
    const workspace = String(workspaceId).trim();
    if (!workspace) return NextResponse.json({ error: 'Workspace is required.' }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!supabaseUrl || !anonKey) throw new Error('Supabase configuration is missing.');
    if (!clientId || !clientSecret) return NextResponse.json({ error: 'Google OAuth is not configured in Vercel yet.' }, { status: 500 });

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 });

    const db = adminDb();
    const access = await workspaceAccess(db, userData.user.id, workspace);
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });

    const { data: socials, error: socialsError } = await db.from('social_accounts')
      .select('id,platform_account_id,access_token,token_expires_at,status,brand_id,workspace_id')
      .eq('platform', 'google_business').eq('status', 'connected')
      .or(`workspace_id.eq.${workspace},brand_id.eq.${workspace}`);
    if (socialsError) throw socialsError;
    if (!socials?.length) return NextResponse.json({ error: 'Connect Google first.' }, { status: 400 });

    let locations = 0;
    let reviews = 0;
    for (const social of socials) {
      let accessToken = String(social.access_token || '');
      const savedConnection = await getGoogleConnectionBySocialAccount(String(social.id));
      if (savedConnection?.refresh_token && (!savedConnection.token_expires_at || new Date(savedConnection.token_expires_at).getTime() <= Date.now() + 60000)) {
        const refreshed = await refreshGoogleToken({ refreshToken: savedConnection.refresh_token, clientId, clientSecret });
        accessToken = refreshed.access_token;
        const expiresAt = refreshed.expires_in ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString() : null;
        await updateGoogleConnection(String(savedConnection.id), {
          access_token: accessToken, token_expires_at: expiresAt,
          token_checked_at: new Date().toISOString(), token_last_refreshed_at: new Date().toISOString(),
          token_status: 'active', token_error: null,
        });
        const tokenMetaUpdate = await db.from('social_accounts').update({
          token_expires_at: expiresAt, token_checked_at: new Date().toISOString(),
          token_last_refreshed_at: new Date().toISOString(), token_status: 'active', token_error: null,
        }).eq('id', social.id);
        if (tokenMetaUpdate.error) throw tokenMetaUpdate.error;
      } else if (savedConnection?.access_token) {
        accessToken = String(savedConnection.access_token);
      } else if (savedConnection?.refresh_token) {
        throw new Error('Google token refresh did not return an access token.');
      }

      if (!accessToken) throw new Error('Google access token is missing.');
      let accounts = await listGoogleAccounts(accessToken);
      accounts = accounts.filter(a => String(a?.name || '') === String(social.platform_account_id || ''));
      for (const account of accounts) {
        const imported = await importGoogleAccount({
          supabase: userClient, workspaceId: workspace, socialAccountId: String(social.id), account, accessToken,
        });
        locations += imported.locations;
        reviews += imported.reviews;
      }
    }
    return NextResponse.json({ ok: true, accounts: socials.length, locations, reviews });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sync Google Business Profile data.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
