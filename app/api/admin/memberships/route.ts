import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function caller(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing.');
  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new Error('Invalid session.');
  return data.user;
}

async function assertWorkspaceManager(db: ReturnType<typeof adminClient>, workspaceId: string, userId: string) {
  const { data, error } = await db.from('workplace_members')
    .select('role,active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.active || !['owner', 'admin'].includes(data.role)) {
    throw new Error('Only the workspace owner or admin can manage memberships.');
  }
}

export async function GET(request: Request) {
  try {
    const user = await caller(request);
    const workspaceId = new URL(request.url).searchParams.get('workspace_id') || '';
    if (!workspaceId) return NextResponse.json({ error: 'workspace_id is required.' }, { status: 400 });
    const db = adminClient();
    await assertWorkspaceManager(db, workspaceId, user.id);
    const { data, error } = await db.from('workplace_members')
      .select('id,user_id,workspace_id,employee_id,role,active,created_at,profiles:user_id(full_name)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ memberships: data || [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to load memberships.';
    return NextResponse.json({ error: message }, { status: /Authentication|session/i.test(message) ? 401 : 403 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await caller(request);
    const body = await request.json();
    const workspaceId = String(body.workspace_id || '').trim();
    const employeeId = String(body.employee_id || '').trim().toUpperCase();
    const userId = String(body.user_id || '').trim();
    const role = ['admin', 'manager', 'member'].includes(body.role) ? body.role : 'member';
    const active = body.active !== false;
    if (!workspaceId || (!employeeId && !userId)) {
      return NextResponse.json({ error: 'workspace_id and employee_id or user_id are required.' }, { status: 400 });
    }
    const db = adminClient();
    await assertWorkspaceManager(db, workspaceId, user.id);

    let targetUserId = userId;
    if (!targetUserId) {
      const { data: member, error } = await db.from('workplace_members').select('user_id').eq('employee_id', employeeId).maybeSingle();
      if (error) throw error;
      if (!member?.user_id) return NextResponse.json({ error: 'Employee ID not found.' }, { status: 404 });
      targetUserId = member.user_id;
    }

    if (targetUserId === user.id) return NextResponse.json({ error: 'The workspace owner cannot be assigned as an employee.' }, { status: 400 });

    const { data: membership, error: membershipError } = await db.from('workplace_members').upsert({
      user_id: targetUserId,
      workplace_id: workspaceId,
      workspace_id: workspaceId,
      employee_id: employeeId || null,
      role,
      active,
    }, { onConflict: 'workplace_id,user_id' }).select('id,user_id,workspace_id,employee_id,role,active').single();
    if (membershipError) throw membershipError;

    const { data: defaults, error: defaultError } = await db.rpc('workspace_role_defaults', { p_role: role });
    if (defaultError) throw defaultError;
    await db.from('workspace_member_permissions').delete().eq('workspace_id', workspaceId).eq('user_id', targetUserId);
    const rows = (defaults || []).map((p: any) => ({ workspace_id: workspaceId, user_id: targetUserId, module: p.module, can_view: p.can_view, can_create: p.can_create, can_edit: p.can_edit, can_submit: p.can_submit, can_approve: p.can_approve, can_publish: p.can_publish, can_manage: p.can_manage }));
    if (rows.length) {
      const { error: permissionError } = await db.from('workspace_member_permissions').insert(rows);
      if (permissionError) throw permissionError;
    }

    return NextResponse.json({ membership });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unable to assign employee.' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await caller(request);
    const body = await request.json();
    const workspaceId = String(body.workspace_id || '').trim();
    const memberId = String(body.member_id || '').trim();
    const role = ['admin', 'manager', 'member'].includes(body.role) ? body.role : null;
    const active = typeof body.active === 'boolean' ? body.active : null;
    if (!workspaceId || !memberId) return NextResponse.json({ error: 'workspace_id and member_id are required.' }, { status: 400 });
    const db = adminClient();
    await assertWorkspaceManager(db, workspaceId, user.id);
    const { data: target, error: targetError } = await db.from('workplace_members').select('user_id,role,employee_id').eq('id', memberId).eq('workspace_id', workspaceId).maybeSingle();
    if (targetError) throw targetError;
    if (!target) return NextResponse.json({ error: 'Membership not found.' }, { status: 404 });
    const update: Record<string, unknown> = {};
    if (role) update.role = role;
    if (active !== null) update.active = active;
    if (!Object.keys(update).length) return NextResponse.json({ error: 'No changes supplied.' }, { status: 400 });
    const { data: membership, error } = await db.from('workplace_members').update(update).eq('id', memberId).eq('workspace_id', workspaceId).select('id,user_id,workspace_id,employee_id,role,active').single();
    if (error) throw error;
    if (role) {
      const { data: defaults, error: defaultError } = await db.rpc('workspace_role_defaults', { p_role: role });
      if (defaultError) throw defaultError;
      await db.from('workspace_member_permissions').delete().eq('workspace_id', workspaceId).eq('user_id', target.user_id);
      const rows = (defaults || []).map((p: any) => ({ workspace_id: workspaceId, user_id: target.user_id, module: p.module, can_view: p.can_view, can_create: p.can_create, can_edit: p.can_edit, can_submit: p.can_submit, can_approve: p.can_approve, can_publish: p.can_publish, can_manage: p.can_manage }));
      if (rows.length) await db.from('workspace_member_permissions').insert(rows);
    }
    await db.from('profiles').update({ active: membership.active }).eq('id', target.user_id);
    return NextResponse.json({ membership });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unable to update membership.' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await caller(request);
    const body = await request.json();
    const workspaceId = String(body.workspace_id || '').trim();
    const memberId = String(body.member_id || '').trim();
    if (!workspaceId || !memberId) return NextResponse.json({ error: 'workspace_id and member_id are required.' }, { status: 400 });
    const db = adminClient();
    await assertWorkspaceManager(db, workspaceId, user.id);
    const { data: target, error: targetError } = await db.from('workplace_members').select('user_id,role').eq('id', memberId).eq('workspace_id', workspaceId).maybeSingle();
    if (targetError) throw targetError;
    if (!target) return NextResponse.json({ error: 'Membership not found.' }, { status: 404 });
    if (target.role === 'owner') return NextResponse.json({ error: 'The workspace owner cannot be removed.' }, { status: 400 });
    const { error } = await db.from('workplace_members').delete().eq('id', memberId).eq('workspace_id', workspaceId);
    if (error) throw error;
    await db.from('workspace_member_permissions').delete().eq('workspace_id', workspaceId).eq('user_id', target.user_id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unable to remove membership.' }, { status: 400 });
  }
}
