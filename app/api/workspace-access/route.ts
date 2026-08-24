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

export async function GET(request: Request) {
  try {
    const user = await caller(request);
    const workspaceId = new URL(request.url).searchParams.get('workspace_id') || '';
    if (!workspaceId) return NextResponse.json({ error: 'workspace_id is required.' }, { status: 400 });
    const db = adminClient();
    const { data: membership, error: membershipError } = await db
      .from('workplace_members')
      .select('role,active,employee_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !membership.active) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });

    const { data: permissions, error: permissionError } = await db
      .from('workspace_member_permissions')
      .select('module,can_view,can_create,can_edit,can_submit,can_approve,can_publish,can_manage')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id);
    if (permissionError) throw permissionError;

    return NextResponse.json({
      workspace_id: workspaceId,
      role: membership.role,
      employee_id: membership.employee_id,
      permissions: permissions || [],
      is_owner_or_admin: membership.role === 'owner' || membership.role === 'admin',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to load workspace access.';
    const status = /Authentication|session/i.test(message) ? 401 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
