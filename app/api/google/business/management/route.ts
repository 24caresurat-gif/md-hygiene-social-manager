import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../../lib/workspace-auth';

export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const workspaceId = String(new URL(request.url).searchParams.get('workspaceId') || '').trim();
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });

    const db = adminDb();
    const access = await workspaceAccess(db, user.id, workspaceId);
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });

    const [{ data: profiles, error: profilesError }, { data: connections, error: connectionError }] = await Promise.all([
      db.from('google_business_profiles')
        .select('id,workspace_id,social_account_id,location_id,account_id,business_name,address,phone,website,category,review_url,status,profile_data,created_at,updated_at')
        .eq('workspace_id', workspaceId)
        .order('business_name'),
      db.from('google_business_connections')
        .select('id,social_account_id,account_name,token_expires_at,token_status,token_error,updated_at')
        .eq('workspace_id', workspaceId)
        .order('updated_at', { ascending: false }),
    ]);
    if (profilesError) throw profilesError;
    if (connectionError) throw connectionError;

    const connectionMap = new Map((connections || []).map((row) => [String(row.social_account_id || ''), row]));
    const locations = (profiles || []).map((profile) => ({
      ...profile,
      connection: connectionMap.get(String(profile.social_account_id || '')) || null,
    }));

    return NextResponse.json({
      workspaceId,
      access: { role: access.role, canManage: access.canManage, globalAdmin: access.globalAdmin },
      connected: locations.length > 0 || (connections || []).length > 0,
      connections: connections || [],
      locations,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Business Profile management.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
