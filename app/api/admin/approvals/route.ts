import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function serviceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase configuration is missing.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function authenticate(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return null;

  const client = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;

  const db = serviceDb();
  const { data: profile, error: profileError } = await db
    .from('profiles').select('role,active').eq('id', data.user.id).maybeSingle();
  if (profileError || !profile || profile.active === false) return null;
  return { user: data.user, db, profileRole: String(profile.role || '').toLowerCase() };
}

async function mayReview(db: ReturnType<typeof serviceDb>, userId: string, profileRole: string, workspaceId: string) {
  if (['admin', 'owner'].includes(profileRole)) return true;

  const [{ data: workspace, error: workspaceError }, { data: membership, error: membershipError }] = await Promise.all([
    db.from('workspaces').select('id,owner_user_id').eq('id', workspaceId).maybeSingle(),
    db.from('workplace_members').select('role,active').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle(),
  ]);
  if (workspaceError) throw workspaceError;
  if (membershipError) throw membershipError;
  if (workspace?.owner_user_id === userId) return true;
  if (!membership?.active) return false;

  const role = String(membership.role || '').toLowerCase();
  if (['owner', 'admin'].includes(role)) return true;
  if (role !== 'manager') return false;

  const { data: permission, error } = await db.from('workspace_member_permissions')
    .select('can_approve').eq('workspace_id', workspaceId).eq('user_id', userId)
    .eq('module', 'approval').maybeSingle();
  if (error) throw error;
  return permission?.can_approve === true;
}

export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required or account inactive.' }, { status: 401 });
  const workspaceId = new URL(request.url).searchParams.get('workspace_id') || '';
  if (!workspaceId) return NextResponse.json({ error: 'workspace_id is required.' }, { status: 400 });

  try {
    if (!(await mayReview(auth.db, auth.user.id, auth.profileRole, workspaceId))) {
      return NextResponse.json({ error: 'Approval permission is required for this workspace.' }, { status: 403 });
    }

    const { data: approvals, error } = await auth.db.from('post_approvals')
      .select('id,draft_id,workplace_id,submitted_by,status,reviewer_note,submitted_at')
      .eq('workplace_id', workspaceId).eq('status', 'pending')
      .order('submitted_at', { ascending: false });
    if (error) throw error;

    const ids = (approvals || []).map((item: any) => item.draft_id);
    const { data: drafts, error: draftsError } = ids.length
      ? await auth.db.from('post_drafts')
          .select('id,user_id,brand_id,workspace_id,title,message,media_urls,platforms,account_ids,approval_status,submitted_at')
          .in('id', ids)
      : { data: [], error: null };
    if (draftsError) throw draftsError;

    const { data: brand } = await auth.db.from('brands').select('id,name').eq('id', workspaceId).maybeSingle();
    const draftById = new Map((drafts || []).map((draft: any) => [draft.id, draft]));
    const result = (approvals || [])
      .map((approval: any) => ({ ...approval, draft: draftById.get(approval.draft_id) || null, workspace_name: brand?.name || 'Workspace' }))
      .filter((approval: any) => approval.draft !== null);

    return NextResponse.json({ approvals: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load approval queue.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required or account inactive.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = String(body?.id || '').trim();
  const decision = String(body?.decision || '').trim();
  const note = String(body?.note || '').trim() || null;
  if (!id || !['approved', 'rejected', 'changes_requested'].includes(decision)) {
    return NextResponse.json({ error: 'id and a valid review decision are required.' }, { status: 400 });
  }

  try {
    const { data: approval, error: readError } = await auth.db.from('post_approvals')
      .select('id,draft_id,workplace_id,submitted_by,status')
      .eq('id', id).maybeSingle();
    if (readError) throw readError;
    if (!approval) return NextResponse.json({ error: 'Approval record not found.' }, { status: 404 });
    if (!(await mayReview(auth.db, auth.user.id, auth.profileRole, approval.workplace_id))) {
      return NextResponse.json({ error: 'Approval permission is required for this workspace.' }, { status: 403 });
    }
    if (approval.status !== 'pending') {
      return NextResponse.json({ error: 'This post is no longer awaiting approval.' }, { status: 409 });
    }

    const reviewedAt = new Date().toISOString();
    const { data: updatedApproval, error: updateError } = await auth.db.from('post_approvals')
      .update({ status: decision, reviewer_note: note, reviewed_by: auth.user.id, reviewed_at: reviewedAt })
      .eq('id', id).eq('status', 'pending').select('id,status').maybeSingle();
    if (updateError) throw updateError;
    if (!updatedApproval) return NextResponse.json({ error: 'This post was reviewed by someone else. Refresh the queue.' }, { status: 409 });

    const draftUpdate: Record<string, unknown> = {
      approval_status: decision,
      approved_by: decision === 'approved' ? auth.user.id : null,
      approved_at: decision === 'approved' ? reviewedAt : null,
      updated_at: reviewedAt,
    };
    const { error: draftError } = await auth.db.from('post_drafts')
      .update(draftUpdate).eq('id', approval.draft_id).eq('approval_status', 'pending');
    if (draftError) {
      // Best-effort compensation so the approval record does not claim a decision
      // when its paired draft failed to move to the same state.
      await auth.db.from('post_approvals').update({ status: 'pending', reviewer_note: null, reviewed_by: null, reviewed_at: null })
        .eq('id', id).eq('status', decision);
      throw draftError;
    }

    return NextResponse.json({ approval: updatedApproval });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save approval decision.' }, { status: 500 });
  }
}
