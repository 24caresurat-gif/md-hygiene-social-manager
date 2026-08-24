import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getCaller(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing.');
  const supabase = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('Invalid session.');
  return data.user;
}

async function assertWorkspaceOwner(admin: ReturnType<typeof adminClient>, workspaceId: string, userId: string) {
  const { data, error } = await admin.from('brands').select('id,name').eq('id', workspaceId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Only the workspace owner can manage employee logins.');
  return data;
}

export async function GET(request: Request) {
  try {
    const user = await getCaller(request);
    const workspaceId = new URL(request.url).searchParams.get('workspace_id');
    if (!workspaceId) return NextResponse.json({ error: 'workspace_id is required.' }, { status: 400 });
    const admin = adminClient();
    await assertWorkspaceOwner(admin, workspaceId, user.id);
    const { data, error } = await admin.from('workplace_members').select('id,user_id,employee_id,role,active,created_at,profiles:user_id(full_name)').eq('workplace_id', workspaceId).order('created_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ members: data || [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to load employees.';
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') || message.includes('session') ? 401 : 403 });
  }
}

export async function POST(request: Request) {
  let createdUserId: string | null = null;
  try {
    const user = await getCaller(request);
    const body = await request.json().catch(() => ({}));
    const workspaceId = String(body.workspace_id || '').trim();
    const employeeId = String(body.employee_id || '').trim().toUpperCase();
    const fullName = String(body.full_name || '').trim();
    const password = String(body.password || '');
    const role = ['admin', 'manager', 'member'].includes(body.role) ? body.role : 'member';
    if (!workspaceId || !employeeId || !fullName || !password) return NextResponse.json({ error: 'Workspace, Employee ID, name and password are required.' }, { status: 400 });
    if (!/^[A-Z0-9][A-Z0-9._-]{2,31}$/.test(employeeId)) return NextResponse.json({ error: 'Employee ID must be 3–32 characters using letters, numbers, dot, underscore or hyphen.' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });

    const admin = adminClient();
    await assertWorkspaceOwner(admin, workspaceId, user.id);
    const { data: existing } = await admin.from('workplace_members').select('id').ilike('employee_id', employeeId).maybeSingle();
    if (existing) return NextResponse.json({ error: 'That Employee ID is already in use.' }, { status: 409 });

    const loginEmail = `${employeeId.toLowerCase()}@employee.md-hygiene.local`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email: loginEmail, password, email_confirm: true });
    if (createError || !created.user) throw createError || new Error('Unable to create employee account.');
    createdUserId = created.user.id;

    // profiles currently allows only admin/staff. Keep the workspace-specific role
    // (member/manager/admin) in workplace_members while mapping it to the profile role.
    const profileRole = role === 'admin' ? 'admin' : 'staff';
    const { error: profileError } = await admin.from('profiles').upsert({ id: created.user.id, full_name: fullName, role: profileRole, active: true }, { onConflict: 'id' });
    if (profileError) throw profileError;

    const { data: member, error: memberError } = await admin.from('workplace_members').insert({ workplace_id: workspaceId, user_id: created.user.id, employee_id: employeeId, role, active: true }).select('id,user_id,employee_id,role,active').single();
    if (memberError || !member) throw memberError || new Error('Unable to assign employee to workspace.');

    // workplace_permissions currently accepts these platform keys.
    const platforms = ['facebook', 'instagram', 'google_business'];
    const { error: permissionError } = await admin.from('workplace_permissions').insert(platforms.map((platform) => ({ workplace_id: workspaceId, user_id: created.user!.id, platform, can_view: true, can_create: role !== 'member' || platform !== 'google_business', can_edit: role !== 'member', can_submit: role !== 'member', can_publish: role === 'admin' || role === 'manager' })));
    if (permissionError) throw permissionError;

    return NextResponse.json({ member: { ...member, full_name: fullName } }, { status: 201 });
  } catch (e) {
    if (createdUserId) {
      const admin = adminClient();
      await admin.from('workplace_permissions').delete().eq('user_id', createdUserId);
      await admin.from('workplace_members').delete().eq('user_id', createdUserId);
      await admin.from('profiles').delete().eq('id', createdUserId);
      await admin.auth.admin.deleteUser(createdUserId);
    }
    const message = e instanceof Error ? e.message : 'Unable to create employee.';
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') || message.includes('session') ? 401 : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCaller(request);
    const body = await request.json().catch(() => ({}));
    const workspaceId = String(body.workspace_id || '').trim();
    const memberId = String(body.member_id || '').trim();
    const active = Boolean(body.active);
    const role = ['admin', 'manager', 'member'].includes(body.role) ? body.role : null;
    if (!workspaceId || !memberId) return NextResponse.json({ error: 'workspace_id and member_id are required.' }, { status: 400 });
    const admin = adminClient();
    await assertWorkspaceOwner(admin, workspaceId, user.id);
    const update: Record<string, unknown> = { active };
    if (role) update.role = role;
    const { data, error } = await admin.from('workplace_members').update(update).eq('id', memberId).eq('workplace_id', workspaceId).select('id,user_id,employee_id,role,active').single();
    if (error) throw error;
    await admin.from('profiles').update({ role: role === 'admin' ? 'admin' : 'staff', active }).eq('id', data.user_id);
    return NextResponse.json({ member: data });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Unable to update employee.' }, { status: 500 }); }
}
