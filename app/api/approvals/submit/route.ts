import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function supabase(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = supabase(token);
  const { data: { user }, error: authError } = await sb.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const workspaceId = String(body?.workspaceId || body?.brandId || '');
  const accountIds = Array.isArray(body?.accountIds)
    ? [...new Set(body.accountIds.map(String).filter(Boolean))]
    : [];
  const message = String(body?.message || '').trim();
  const mediaUrl = body?.mediaUrl ? String(body.mediaUrl) : null;
  const link = body?.link ? String(body.link) : null;
  const platforms = Array.isArray(body?.platforms)
    ? [...new Set(body.platforms.map(String))]
    : [];

  if (!workspaceId || !accountIds.length || !message) {
    return NextResponse.json(
      { error: 'Workspace, account and caption are required.' },
      { status: 400 },
    );
  }

  const { data: membership, error: membershipError } = await sb
    .from('workplace_members')
    .select('role,active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
  if (!membership || !membership.active) {
    return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
  }

  const { data: accounts, error: accountsError } = await sb
    .from('social_accounts')
    .select('id,platform,brand_id,status')
    .in('id', accountIds)
    .eq('brand_id', workspaceId)
    .eq('status', 'connected');

  if (accountsError) return NextResponse.json({ error: accountsError.message }, { status: 500 });
  if ((accounts || []).length !== accountIds.length) {
    return NextResponse.json(
      { error: 'One or more selected social accounts are invalid for this workspace.' },
      { status: 403 },
    );
  }

  const role = membership.role as 'owner' | 'admin' | 'manager' | 'member';
  let canSubmit = role === 'owner' || role === 'admin';
  if (!canSubmit) {
    const { data: permission, error: permissionError } = await sb
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

  // Owner/Admin may publish without approval; Manager/Member submit for review.
  const approvalStatus = role === 'owner' || role === 'admin' ? 'approved' : 'pending';

  const { data: draft, error: draftError } = await sb
    .from('post_drafts')
    .insert({
      user_id: user.id,
      brand_id: workspaceId,
      title: 'Social Post',
      message,
      link,
      media_urls: mediaUrl ? [mediaUrl] : [],
      platforms: platforms.length ? platforms : [...new Set((accounts || []).map(a => a.platform))],
      account_ids: accountIds,
      approval_status: approvalStatus,
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (draftError) return NextResponse.json({ error: draftError.message }, { status: 500 });

  const { data: approval, error: approvalError } = await sb
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
    await sb.from('post_drafts').delete().eq('id', draft.id);
    return NextResponse.json({ error: approvalError.message }, { status: 500 });
  }

  return NextResponse.json({ draftId: draft.id, approval, approvalStatus }, { status: 201 });
}
