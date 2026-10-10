import { NextRequest, NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../lib/workspace-auth';

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await authenticatedUser(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const workspaceId = String(body?.workspaceId || body?.brandId || '').trim();
  const accountIds = Array.isArray(body?.accountIds)
    ? [...new Set(body.accountIds.map(String).map((id: string) => id.trim()).filter(Boolean))]
    : [];
  const message = String(body?.message || '').trim();
  const mediaUrl = body?.mediaUrl ? String(body.mediaUrl) : null;
  const link = body?.link ? String(body.link) : null;
  const platforms = Array.isArray(body?.platforms)
    ? [...new Set(body.platforms.map(String).map((platform: string) => platform.trim()).filter(Boolean))]
    : [];

  // A supplied schedule must be a real future timestamp. Invalid timestamps
  // must never fall through to the immediate-submit path.
  const scheduledForRaw =
    body?.scheduledFor === undefined || body?.scheduledFor === null || String(body.scheduledFor).trim() === ''
      ? null
      : String(body.scheduledFor);
  const scheduledDate = scheduledForRaw ? new Date(scheduledForRaw) : null;
  const isScheduled = scheduledForRaw !== null;
  if (isScheduled && (!scheduledDate || Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now())) {
    return NextResponse.json(
      { error: 'scheduledFor must be a valid future date; clear the schedule to publish now.' },
      { status: 400 },
    );
  }

  if (!workspaceId || !accountIds.length || !message) {
    return NextResponse.json({ error: 'Workspace, account and caption are required.' }, { status: 400 });
  }

  const db = adminDb();
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('active')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!profile || profile.active === false) {
    return NextResponse.json({ error: 'Your account is inactive.' }, { status: 403 });
  }

  let access: Awaited<ReturnType<typeof workspaceAccess>> | null = null;
  try {
    access = await workspaceAccess(db, user.id, workspaceId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unable to verify workspace access.' },
      { status: 500 },
    );
  }
  if (!access?.hasAccess) {
    return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
  }

  const role = String(access.role || '').toLowerCase();
  const ownerOrAdmin = access.isOwner || access.globalAdmin ||
    role === 'owner' || role === 'admin';
  let canSubmit = ownerOrAdmin;
  if (!canSubmit) {
    const { data: permission, error: permissionError } = await db
      .from('workspace_member_permissions')
      .select('can_submit')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .eq('module', 'content')
      .maybeSingle();
    if (permissionError) return NextResponse.json({ error: permissionError.message }, { status: 500 });
    canSubmit = permission?.can_submit === true;
  }
  if (!canSubmit) {
    return NextResponse.json({ error: 'You do not have Submit permission for Content.' }, { status: 403 });
  }

  // Social accounts may be owned by the workspace rather than the user who
  // authored this post. Validate the relationship independently from submit rights.
  const { data: accounts, error: accountsError } = await db
    .from('social_accounts')
    .select('id,platform,brand_id,workspace_id,status')
    .in('id', accountIds)
    .eq('status', 'connected');
  if (accountsError) return NextResponse.json({ error: accountsError.message }, { status: 500 });
  if ((accounts || []).length !== accountIds.length ||
      (accounts || []).some((account: any) => account.brand_id !== workspaceId && account.workspace_id !== workspaceId)) {
    return NextResponse.json(
      { error: 'One or more selected social accounts are invalid for this workspace.' },
      { status: 403 },
    );
  }

  // Workspace owners/admins may proceed without review. Staff submissions stay
  // pending, including scheduled content, until an authorized reviewer approves them.
  const approvalStatus = ownerOrAdmin ? 'approved' : 'pending';

  if (isScheduled) {
    const { data: scheduled, error: scheduledError } = await db
      .from('scheduled_posts')
      .insert({
        user_id: user.id,
        brand_id: workspaceId,
        workspace_id: workspaceId,
        account_ids: accountIds,
        caption: message,
        link,
        media_url: mediaUrl,
        scheduled_for: scheduledDate!.toISOString(),
        status: 'scheduled',
        approval_status: approvalStatus,
      })
      .select('id,status,approval_status,scheduled_for')
      .single();

    if (scheduledError) return NextResponse.json({ error: scheduledError.message }, { status: 500 });
    return NextResponse.json({ scheduled: true, scheduledPost: scheduled, approvalStatus }, { status: 201 });
  }

  const { data: draft, error: draftError } = await db
    .from('post_drafts')
    .insert({
      user_id: user.id,
      brand_id: workspaceId,
      title: 'Social Post',
      message,
      link,
      media_urls: mediaUrl ? [mediaUrl] : [],
      platforms: platforms.length ? platforms : [...new Set((accounts || []).map((account: any) => account.platform))],
      account_ids: accountIds,
      approval_status: approvalStatus,
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (draftError) return NextResponse.json({ error: draftError.message }, { status: 500 });

  const { data: approval, error: approvalError } = await db
    .from('post_approvals')
    .insert({
      draft_id: draft.id,
      workplace_id: workspaceId,
      submitted_by: user.id,
      status: approvalStatus,
      submitted_at: new Date().toISOString(),
    })
    .select('id,status')
    .single();

  if (approvalError) {
    await db.from('post_drafts').delete().eq('id', draft.id);
    return NextResponse.json({ error: approvalError.message }, { status: 500 });
  }

  return NextResponse.json({ draftId: draft.id, approval, approvalStatus }, { status: 201 });
}
