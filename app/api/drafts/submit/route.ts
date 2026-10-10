import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
async function getUser(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user || null;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = String(body?.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Draft id is required.' }, { status: 400 });

  const db = admin();
  const [{ data: profile, error: profileError }, { data: draft, error: draftError }] = await Promise.all([
    db.from('profiles').select('role,active').eq('id', user.id).maybeSingle(),
    db.from('scheduled_posts')
      .select('id,user_id,brand_id,workspace_id,account_ids,caption,media_url,status,approval_status')
      .eq('id', id).eq('user_id', user.id).maybeSingle(),
  ]);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (draftError) return NextResponse.json({ error: draftError.message }, { status: 500 });
  if (!profile || profile.active === false) return NextResponse.json({ error: 'Your account is inactive.' }, { status: 403 });
  if (!draft) return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
  if (draft.status !== 'draft') return NextResponse.json({ error: 'Only draft posts can be submitted.' }, { status: 400 });
  if (draft.approval_status === 'pending') return NextResponse.json({ error: 'Draft is already awaiting approval.' }, { status: 409 });
  if (draft.approval_status === 'approved') return NextResponse.json({ error: 'Approved draft cannot be resubmitted.' }, { status: 400 });

  const accountIds = Array.isArray(draft.account_ids) ? [...new Set(draft.account_ids.map(String).filter(Boolean))] : [];
  if (!accountIds.length) return NextResponse.json({ error: 'Select at least one social account before submitting.' }, { status: 400 });
  if (!String(draft.caption || '').trim() && !draft.media_url) return NextResponse.json({ error: 'Add a caption or creative before submitting.' }, { status: 400 });

  const [{ data: brand, error: brandError }, { data: membership, error: membershipError }] = await Promise.all([
    db.from('brands').select('id,user_id').eq('id', draft.brand_id).maybeSingle(),
    db.from('workplace_members').select('role,active').eq('workspace_id', draft.workspace_id || draft.brand_id).eq('user_id', user.id).maybeSingle(),
  ]);
  if (brandError) return NextResponse.json({ error: brandError.message }, { status: 500 });
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
  if (!brand) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const profileRole = String(profile.role || '').toLowerCase();
  const workspaceOwner = brand.user_id === user.id;
  const membershipRole = String(membership?.role || '').toLowerCase();
  const privileged = ['admin', 'owner'].includes(profileRole) || workspaceOwner ||
    (membership?.active === true && ['owner', 'admin'].includes(membershipRole));
  if (!privileged && membership?.active !== true) {
    return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
  }

  if (!privileged) {
    const { data: permission, error: permissionError } = await db.from('workspace_member_permissions')
      .select('can_submit').eq('workspace_id', draft.workspace_id || draft.brand_id)
      .eq('user_id', user.id).eq('module', 'content').maybeSingle();
    if (permissionError) return NextResponse.json({ error: permissionError.message }, { status: 500 });
    if (permission?.can_submit !== true) return NextResponse.json({ error: 'You do not have Submit permission for Content.' }, { status: 403 });
  }

  const workspaceId = draft.workspace_id || draft.brand_id;
  const { data: accounts, error: accountError } = await db.from('social_accounts')
    .select('id,brand_id,workspace_id,status')
    .in('id', accountIds)
    .or(`brand_id.eq.${workspaceId},workspace_id.eq.${workspaceId}`)
    .eq('status', 'connected');
  if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
  if ((accounts || []).length !== accountIds.length) {
    return NextResponse.json({ error: 'One or more selected accounts are no longer connected to this workspace.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await db.from('scheduled_posts')
    .update({ approval_status: 'pending', submitted_at: now, reviewed_at: null, reviewed_by: null, reviewer_note: null })
    .eq('id', id).eq('user_id', user.id).eq('status', 'draft').eq('approval_status', draft.approval_status)
    .select('*').maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'Draft changed before submission. Refresh and try again.' }, { status: 409 });

  const { error: activityError } = await db.from('scheduled_post_activity_log').insert({
    scheduled_post_id: id, actor_user_id: user.id, action: 'submitted', metadata: { account_count: accountIds.length },
  });
  if (activityError) {
    // The state transition succeeded; return the updated draft and make the audit-log issue visible.
    return NextResponse.json({ draft: updated, warning: 'Submitted, but activity history could not be recorded.' }, { status: 200 });
  }
  return NextResponse.json({ draft: updated });
}
