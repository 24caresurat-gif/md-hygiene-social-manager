import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminDb, workspaceAccess } from '../../../../lib/workspace-auth';

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: 'Supabase configuration is missing.' }, { status: 500 });

  const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
  if (!accountId) return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });

  try {
    const db = adminDb();
    const { data: account, error: findError } = await db
      .from('social_accounts')
      .select('id,platform,name,brand_id,workspace_id')
      .eq('id', accountId)
      .maybeSingle();
    if (findError) throw findError;
    if (!account) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

    const workspaceId = String(account.workspace_id || account.brand_id || '');
    if (!workspaceId) return NextResponse.json({ error: 'Account is not assigned to a workspace.' }, { status: 403 });
    const access = await workspaceAccess(db, user.id, workspaceId);
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
    const privileged = Boolean(access.globalAdmin || access.isOwner || ['owner', 'admin'].includes(String(access.role || '').toLowerCase()));
    if (!privileged) return NextResponse.json({ error: 'Only Workspace Owner/Admin can disconnect social accounts.' }, { status: 403 });

    if (account.platform === 'google_business') {
      const { error: connectionError } = await db.from('google_business_connections').delete().eq('social_account_id', accountId);
      if (connectionError) throw connectionError;
    }

    const { error } = await db.from('social_accounts').delete().eq('id', accountId);
    if (error) throw error;
    return NextResponse.json({ ok: true, account: { id: account.id, platform: account.platform, name: account.name } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to disconnect account.' }, { status: 500 });
  }
}
