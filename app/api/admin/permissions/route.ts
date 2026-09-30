import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function authClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing.');
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function caller(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const sb = authClient(token);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user };
}

async function membership(db: ReturnType<typeof adminClient>, userId: string, workspaceId: string) {
  const { data, error } = await db
    .from('workplace_members')
    .select('role,active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function isGlobalAdmin(db: ReturnType<typeof adminClient>, userId: string) {
  const { data, error } = await db
    .from('profiles')
    .select('role,active')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.active !== false && ['admin', 'owner'].includes(String(data?.role || '').toLowerCase());
}

async function canManage(db: ReturnType<typeof adminClient>, userId: string, workspaceId: string) {
  if (await isGlobalAdmin(db, userId)) return true;
  const data = await membership(db, userId, workspaceId);
  return !!data && data.active && (data.role === 'owner' || data.role === 'admin');
}

export async function GET(request: Request) {
  try {
    const a = await caller(request);
    if (!a) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const workspaceId = new URL(request.url).searchParams.get('workspace_id');
    const db = adminClient();

    if (workspaceId && !(await canManage(db, a.user.id, workspaceId))) {
      return NextResponse.json({ error: 'Workspace admin access required.' }, { status: 403 });
    }

    const query = db
      .from('workspace_member_permissions')
      .select('id,user_id,workspace_id,module,can_view,can_create,can_edit,can_submit,can_approve,can_publish,can_manage');
    const { data, error } = workspaceId ? await query.eq('workspace_id', workspaceId) : await query;
    if (error) throw error;
    return NextResponse.json({ permissions: data || [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unable to load permissions.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const a = await caller(request);
    if (!a) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const b = await request.json();
    const user_id = String(b.user_id || '');
    const workspace_id = String(b.workspace_id || '');
    const module = String(b.module || '');
    const allowed = ['dashboard','content','creative','calendar','analytics','drafts','approval','publishing','social_accounts','whatsapp','team','workspace_settings'];
    if (!user_id || !workspace_id || !allowed.includes(module)) {
      return NextResponse.json({ error: 'user_id, workspace_id and valid module are required.' }, { status: 400 });
    }

    const db = adminClient();
    const globalAdmin = await isGlobalAdmin(db, a.user.id);
    const actor = await membership(db, a.user.id, workspace_id);
    if (!globalAdmin && (!actor?.active || !['owner', 'admin'].includes(actor.role))) {
      return NextResponse.json({ error: 'Workspace admin access required.' }, { status: 403 });
    }

    if (module === 'workspace_settings' && !globalAdmin && !['owner', 'admin'].includes(actor?.role || '')) {
      return NextResponse.json({ error: 'Workspace Settings are restricted to Owner and Admin.' }, { status: 403 });
    }

    const { data: target, error: targetError } = await db
      .from('workplace_members')
      .select('role,active')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user_id)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target || !target.active) {
      return NextResponse.json({ error: 'Target member is not active in this workspace.' }, { status: 400 });
    }

    if (module === 'workspace_settings' && !['owner', 'admin'].includes(target.role)) {
      return NextResponse.json({ error: 'Workspace Settings cannot be assigned to Manager or Employee roles.' }, { status: 400 });
    }

    const row = {
      user_id,
      workspace_id,
      module,
      can_view: module === 'workspace_settings' ? true : b.can_view === true,
      can_create: module === 'workspace_settings' ? false : b.can_create === true,
      can_edit: module === 'workspace_settings' ? false : b.can_edit === true,
      can_submit: module === 'workspace_settings' ? false : b.can_submit === true,
      can_approve: module === 'workspace_settings' ? false : b.can_approve === true,
      can_publish: module === 'workspace_settings' ? false : b.can_publish === true,
      can_manage: module === 'workspace_settings' ? true : b.can_manage === true,
    };

    const { data, error } = await db
      .from('workspace_member_permissions')
      .upsert(row, { onConflict: 'workspace_id,user_id,module' })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ permission: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unable to save permission.' }, { status: 400 });
  }
}
