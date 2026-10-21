import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../lib/workspace-auth';

export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const workspaceId = String(new URL(request.url).searchParams.get('workspaceId') || '').trim();
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });

    const db = adminDb();
    const access = await workspaceAccess(db, user.id, workspaceId);
    if (!access?.hasAccess) {
      return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
    }

    const privileged = Boolean(
      access.globalAdmin ||
      access.isOwner ||
      ['owner', 'admin'].includes(String(access.role || '').toLowerCase()),
    );
    if (!privileged) {
      return NextResponse.json({ error: 'Only Workspace Owner/Admin can manage channel connections.' }, { status: 403 });
    }

    // Return only safe connection metadata. Never serialize provider tokens to the browser.
    const { data: accounts, error } = await db.from('social_accounts')
      .select('id,platform,name,handle,status,brand_id,workspace_id,token_status,token_expires_at,token_checked_at,token_error,created_at')
      .or(`workspace_id.eq.${workspaceId},brand_id.eq.${workspaceId}`)
      .in('platform', ['facebook', 'instagram', 'google_business'])
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ accounts: accounts || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load connected channels.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
