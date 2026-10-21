import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../../lib/workspace-auth';
import { inspectMetaToken } from '../../../../../lib/meta-token';

export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const user = await authenticatedUser(request);
    const url = new URL(request.url);
    const brandId = url.searchParams.get('brandId') || '';
    const db = adminDb();
    let query = db.from('social_accounts')
      .select('id,user_id,platform,name,brand_id,workspace_id,status,token_expires_at,token_status,token_error,access_token');
    if (brandId) {
      const access = await workspaceAccess(db, user.id, brandId);
      if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
      const privileged = Boolean(access.globalAdmin || access.isOwner || ['owner', 'admin'].includes(String(access.role || '').toLowerCase()));
      if (!privileged) query = query.eq('user_id', user.id);
      query = query.or(`workspace_id.eq.${brandId},brand_id.eq.${brandId}`);
    } else {
      query = query.eq('user_id', user.id);
    }
    const { data: accounts, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    const result = [];
    for (const account of accounts || []) {
      const workspaceId = account.workspace_id || account.brand_id;
      if (workspaceId) {
        const access = await workspaceAccess(db, user.id, String(workspaceId));
        if (!access?.hasAccess) continue;
      }
      if ((account.platform === 'facebook' || account.platform === 'instagram') && account.access_token) {
        const info = await inspectMetaToken(account.access_token);
        const checkedAt = new Date().toISOString();
        const connectionStatus = info.valid
          ? (account.status === 'reconnect_required' ? 'connected' : account.status)
          : 'reconnect_required';
        const update = await db.from('social_accounts').update({
          token_expires_at: info.expiresAt, token_checked_at: checkedAt,
          token_status: info.status, token_error: info.error, status: connectionStatus,
        }).eq('id', account.id);
        if (update.error) throw update.error;
        result.push({ id: account.id, platform: account.platform, name: account.name, brandId: account.brand_id, status: info.status, expiresAt: info.expiresAt, error: info.error });
      } else {
        result.push({ id: account.id, platform: account.platform, name: account.name, brandId: account.brand_id, status: account.token_status || 'unknown', expiresAt: account.token_expires_at, error: account.token_error });
      }
    }
    return NextResponse.json({ accounts: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to check account health.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
