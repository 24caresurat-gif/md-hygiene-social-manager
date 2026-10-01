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

    const { data, error } = await db.from('social_posts')
      .select('id,user_id,message,link,media_url,status,approval_status,created_at,updated_at,platform_response,attempted_at,error_message')
      .eq('workspace_id', workspaceId)
      .eq('platform', 'google_business')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;

    return NextResponse.json({
      workspaceId,
      access: { role: access.role, canManage: access.canManage, globalAdmin: access.globalAdmin },
      posts: (data || []).map((post: any) => ({
        ...post,
        gmb: post.platform_response?.gmb || {},
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Google post approvals.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const workspaceId = String(body.workspaceId || '').trim();
    const postId = String(body.postId || '').trim();
    const approvalStatus = String(body.approvalStatus || '').trim();
    if (!workspaceId || !postId) return NextResponse.json({ error: 'workspaceId and postId are required.' }, { status: 400 });
    if (!['pending','approved'].includes(approvalStatus)) return NextResponse.json({ error: 'approvalStatus must be pending or approved.' }, { status: 400 });

    const db = adminDb();
    const access = await workspaceAccess(db, user.id, workspaceId);
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
    if (!access.canManage) return NextResponse.json({ error: 'Only a workspace manager can approve Google Business posts.' }, { status: 403 });

    const { data, error } = await db.from('social_posts')
      .update({ approval_status: approvalStatus, updated_at: new Date().toISOString() })
      .eq('id', postId)
      .eq('workspace_id', workspaceId)
      .eq('platform', 'google_business')
      .select('id,approval_status,updated_at')
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, post: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update Google post approval.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
