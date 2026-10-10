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
  const brandId = new URL(req.url).searchParams.get('brandId');
  const db = admin();
  let q = db.from('scheduled_posts').select('*').eq('user_id', user.id).order('scheduled_for', { ascending: true });
  if (brandId) q = q.eq('brand_id', brandId);
  const { data, error } = await q;
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
    .select('active')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!profile || profile.active === false) {
    return NextResponse.json({ error: 'Your account is inactive.' }, { status: 403 });
  }

  const { data: membership, error: membershipError } = await db
    .from('workplace_members')
    .select('role,active')
    .eq('workspace_id', brandId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
  if (!membership?.active) {
    return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
  }

  const role = String(membership.role || '').toLowerCase();
  const isWorkspaceAdmin = role === 'owner' || role === 'admin';
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
    .select('id,brand_id,status')
    .in('id', accountIds)
    .eq('brand_id', brandId)
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
  const { error } = await admin().from('scheduled_posts').delete().eq('id', id).eq('user_id', user.id).in('status', ['draft', 'scheduled', 'failed', 'cancelled']);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
