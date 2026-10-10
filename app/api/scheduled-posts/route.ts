import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function userFromRequest(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user } } = await client.auth.getUser(token);
  return user;
}
export async function GET(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const brandId = new URL(req.url).searchParams.get('brandId') || '';
  if (!brandId) return NextResponse.json({ error: 'brandId is required.' }, { status: 400 });

  const db = admin();
  const [{ data: profile, error: profileError }, { data: brand, error: brandError }, { data: membership, error: membershipError }] = await Promise.all([
    db.from('profiles').select('role,active').eq('id', user.id).maybeSingle(),
    db.from('brands').select('id,user_id').eq('id', brandId).maybeSingle(),
    db.from('workplace_members').select('role,active').eq('workspace_id', brandId).eq('user_id', user.id).maybeSingle(),
  ]);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (brandError) return NextResponse.json({ error: brandError.message }, { status: 500 });
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
  if (!profile || profile.active === false) return NextResponse.json({ error: 'Your account is inactive.' }, { status: 403 });
  if (!brand) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const profileRole = String(profile.role || '').toLowerCase();
  const membershipRole = String(membership?.role || '').toLowerCase();
  const isPrivileged = ['admin', 'owner'].includes(profileRole) || brand.user_id === user.id ||
    (membership?.active === true && ['owner', 'admin'].includes(membershipRole));
  if (!isPrivileged && membership?.active !== true) {
    return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
  }
  if (!isPrivileged) {
    const { data: permission, error: permissionError } = await db.from('workspace_member_permissions')
      .select('can_view').eq('workspace_id', brandId).eq('user_id', user.id).eq('module', 'calendar').maybeSingle();
    if (permissionError) return NextResponse.json({ error: permissionError.message }, { status: 500 });
    if (permission?.can_view !== true) return NextResponse.json({ error: 'Calendar view permission is required.' }, { status: 403 });
  }

  // Calendar is workspace-owned, not user-owned: members with Calendar access
  // should see all drafts/scheduled jobs belonging to the selected workspace.
  const { data, error } = await db.from('scheduled_posts').select('*')
    .eq('brand_id', brandId).order('scheduled_for', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const brandId = String(body?.brandId || '').trim();
  const requestedStatus = body?.status === 'draft' ? 'draft' : 'scheduled';
  const rawAccountIds = Array.isArray(body?.accountIds) ? body.accountIds.map((id: unknown) => String(id).trim()).filter(Boolean) : [];
  const accountIds = [...new Set(rawAccountIds)];
  const when = new Date(body?.scheduledFor);

  if (!brandId || !accountIds.length || !body?.scheduledFor) {
    return NextResponse.json({ error: 'brandId, accountIds and scheduledFor are required.' }, { status: 400 });
  }
  if (accountIds.length !== rawAccountIds.length) {
    return NextResponse.json({ error: 'Duplicate social accounts are not allowed.' }, { status: 400 });
  }
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'scheduledFor must be a valid future date.' }, { status: 400 });
  }

  const db = admin();
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('role,active')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!profile || profile.active === false) {
    return NextResponse.json({ error: 'Your account is inactive.' }, { status: 403 });
  }

  const [{ data: brand, error: brandError }, { data: membership, error: membershipError }] = await Promise.all([
    db.from('brands').select('id,user_id').eq('id', brandId).maybeSingle(),
    db.from('workplace_members').select('role,active').eq('workspace_id', brandId).eq('user_id', user.id).maybeSingle(),
  ]);
  if (brandError) return NextResponse.json({ error: brandError.message }, { status: 500 });
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
  if (!brand) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const role = String(membership?.role || '').toLowerCase();
  const profileRole = String(profile.role || '').toLowerCase();
  const isWorkspaceAdmin = ['admin', 'owner'].includes(profileRole) || brand.user_id === user.id ||
    (membership?.active === true && ['owner', 'admin'].includes(role));
  if (!isWorkspaceAdmin && membership?.active !== true) {
    return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
  }
  const permissionField = requestedStatus === 'draft' ? 'can_create' : 'can_submit';

  if (!isWorkspaceAdmin) {
    const { data: permission, error: permissionError } = await db
      .from('workspace_member_permissions')
      .select('can_create,can_submit')
      .eq('workspace_id', brandId)
      .eq('user_id', user.id)
      .eq('module', 'content')
      .maybeSingle();
    if (permissionError) return NextResponse.json({ error: permissionError.message }, { status: 500 });
    if (permission?.[permissionField] !== true) {
      return NextResponse.json({
        error: requestedStatus === 'draft'
          ? 'You do not have Create permission for Content.'
          : 'You do not have Submit permission for Content.',
      }, { status: 403 });
    }
  }

  const { data: accounts, error: accountError } = await db
    .from('social_accounts')
    .select('id,brand_id,workspace_id,status')
    .in('id', accountIds)
    .or(`brand_id.eq.${brandId},workspace_id.eq.${brandId}`)
    .eq('status', 'connected');
  if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
  if ((accounts || []).length !== accountIds.length) {
    return NextResponse.json({ error: 'One or more selected social accounts are not connected to this workspace.' }, { status: 403 });
  }

  // The alternate scheduling API follows the same rule as /api/approvals/submit:
  // only workspace owners/admins schedule as approved; staff submissions remain
  // pending and the cron worker cannot publish them until a reviewer approves.
  const approvalStatus = requestedStatus === 'draft'
    ? 'draft'
    : isWorkspaceAdmin ? 'approved' : 'pending';

  const { data, error } = await db
    .from('scheduled_posts')
    .insert({
      user_id: user.id,
      brand_id: brandId,
      workspace_id: brandId,
      account_ids: accountIds,
      caption: String(body?.caption || '').trim(),
      link: body?.link ? String(body.link) : null,
      media_url: body?.mediaUrl ? String(body.mediaUrl) : null,
      scheduled_for: when.toISOString(),
      status: requestedStatus,
      approval_status: approvalStatus,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data, approvalStatus }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const db = admin();
  const { data: post, error: postError } = await db.from('scheduled_posts')
    .select('id,user_id,brand_id,workspace_id,status,approval_status')
    .eq('id', id).maybeSingle();
  if (postError) return NextResponse.json({ error: postError.message }, { status: 500 });
  if (!post) return NextResponse.json({ error: 'Scheduled post not found.' }, { status: 404 });
  if (!['draft', 'scheduled', 'failed'].includes(post.status)) {
    return NextResponse.json({ error: 'This post can no longer be cancelled.' }, { status: 409 });
  }

  const workspaceId = post.workspace_id || post.brand_id;
  const [{ data: profile, error: profileError }, { data: brand, error: brandError }, { data: membership, error: membershipError }] = await Promise.all([
    db.from('profiles').select('role,active').eq('id', user.id).maybeSingle(),
    db.from('brands').select('id,user_id').eq('id', post.brand_id).maybeSingle(),
    db.from('workplace_members').select('role,active').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle(),
  ]);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (brandError) return NextResponse.json({ error: brandError.message }, { status: 500 });
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
  if (!profile || profile.active === false) return NextResponse.json({ error: 'Your account is inactive.' }, { status: 403 });
  if (!brand) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const profileRole = String(profile.role || '').toLowerCase();
  const membershipRole = String(membership?.role || '').toLowerCase();
  const isPrivileged = ['admin', 'owner'].includes(profileRole) || brand.user_id === user.id ||
    (membership?.active === true && ['owner', 'admin'].includes(membershipRole));
  if (!isPrivileged && membership?.active !== true) {
    return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
  }

  if (!isPrivileged && post.user_id !== user.id) {
    const { data: permission, error: permissionError } = await db.from('workspace_member_permissions')
      .select('can_edit,can_manage').eq('workspace_id', workspaceId).eq('user_id', user.id).eq('module', 'calendar').maybeSingle();
    if (permissionError) return NextResponse.json({ error: permissionError.message }, { status: 500 });
    if (permission?.can_edit !== true && permission?.can_manage !== true) {
      return NextResponse.json({ error: 'Calendar edit permission is required to cancel another member’s post.' }, { status: 403 });
    }
  }

  const { data: updated, error } = await db.from('scheduled_posts')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id).eq('brand_id', post.brand_id).eq('status', post.status)
    .select('id,status').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'This post changed before it could be cancelled. Refresh the calendar.' }, { status: 409 });
  return NextResponse.json({ ok: true, post: updated });
}
