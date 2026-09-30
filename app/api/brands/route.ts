import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function publicClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing.');
  return createClient(url, key, { global: { headers: { Authorization: \`Bearer \${token}\` } } });
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server database configuration is missing.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function authenticate(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required.');
  const supabase = publicClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('Invalid session.');
  return { token, user: data.user };
}

async function canManageWorkspace(db: ReturnType<typeof adminClient>, workspaceId: string, userId: string) {
  const { data: workspace, error: workspaceError } = await db
    .from('workspaces')
    .select('id,owner_user_id')
    .eq('id', workspaceId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace) return { exists: false, allowed: false };

  if (workspace.owner_user_id === userId) {
    return { exists: true, allowed: true };
  }

  const { data: membership, error: membershipError } = await db
    .from('workplace_members')
    .select('role,active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();
  if (membershipError) throw membershipError;

  return {
    exists: true,
    allowed: Boolean(membership && ['owner', 'admin'].includes(String(membership.role || '').toLowerCase())),
  };
}

function makeSlug(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)
    || \`workspace-\${Date.now()}\`;
}

export async function GET(request: Request) {
  try {
    const { token, user } = await authenticate(request);
    const supabase = publicClient(token);
    const db = adminClient();
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('role,active')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const globalAdmin = profile?.active !== false && ['admin', 'owner'].includes(String(profile?.role || '').toLowerCase());

    if (globalAdmin) {
      const { data, error } = await db
        .from('workspaces')
        .select('id,name,slug,logo_url,owner_user_id,created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const workspaces = (data || []).map((w: any) => ({ ...w, membership_role: 'admin' }));
      return NextResponse.json({ workspaces, brands: workspaces });
    }

    const { data, error } = await supabase
      .from('workplace_members')
      .select('workspace_id,role,active,workspaces(id,name,slug,logo_url,owner_user_id,created_at)')
      .eq('user_id', user.id)
      .eq('active', true)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const workspaces = (data || [])
      .map((row: any) => row.workspaces ? { ...row.workspaces, membership_role: row.role } : null)
      .filter(Boolean);

    return NextResponse.json({ workspaces, brands: workspaces });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to load workspaces.';
    return NextResponse.json({ error: message }, { status: /Authentication|session/i.test(message) ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  let workspaceId: string | null = null;
  try {
    const { user } = await authenticate(request);
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const logo_url = body.logo_url ? String(body.logo_url).trim() : null;

    if (!name) return NextResponse.json({ error: 'Workspace name is required.' }, { status: 400 });
    if (name.length > 120) return NextResponse.json({ error: 'Workspace name must be 120 characters or less.' }, { status: 400 });
    if (logo_url && logo_url.length > 2048) return NextResponse.json({ error: 'Logo URL is too long.' }, { status: 400 });

    const db = adminClient();
    workspaceId = crypto.randomUUID();
    const slug = makeSlug(name);

    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ id: workspaceId, owner_user_id: user.id, name, slug, logo_url })
      .select('id,name,slug,logo_url,owner_user_id,created_at')
      .single();
    if (workspaceError) throw workspaceError;

    const { data: brand, error: brandError } = await db
      .from('brands')
      .insert({ id: workspaceId, workspace_id: workspaceId, user_id: user.id, name, slug, logo_url })
      .select('id,name,slug,logo_url')
      .single();
    if (brandError) throw brandError;

    const { error: membershipError } = await db
      .from('workplace_members')
      .insert({ workplace_id: workspaceId, workspace_id: workspaceId, user_id: user.id, role: 'owner', active: true });
    if (membershipError) throw membershipError;

    return NextResponse.json({ workspace, brand }, { status: 201 });
  } catch (e) {
    if (workspaceId) {
      try { await adminClient().from('workspaces').delete().eq('id', workspaceId); } catch {}
    }
    const message = e instanceof Error ? e.message : 'Unable to create workspace.';
    return NextResponse.json({ error: message }, { status: /Authentication|session/i.test(message) ? 401 : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user } = await authenticate(request);
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    const name = String(body.name || '').trim();
    const logo_url = Object.prototype.hasOwnProperty.call(body, 'logo_url') ? (body.logo_url ? String(body.logo_url).trim() : null) : undefined;

    if (!id || !name) return NextResponse.json({ error: 'Workspace ID and name are required.' }, { status: 400 });
    if (name.length > 120) return NextResponse.json({ error: 'Workspace name must be 120 characters or less.' }, { status: 400 });
    if (logo_url && logo_url.length > 2048) return NextResponse.json({ error: 'Logo URL is too long.' }, { status: 400 });

    const db = adminClient();
    const access = await canManageWorkspace(db, id, user.id);
    if (!access.exists) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    if (!access.allowed) return NextResponse.json({ error: 'Only the workspace owner or admin can update workspace settings.' }, { status: 403 });

    const update: Record<string, unknown> = { name, slug: makeSlug(name), updated_at: new Date().toISOString() };
    if (logo_url !== undefined) update.logo_url = logo_url;

    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .update(update)
      .eq('id', id)
      .select('id,name,slug,logo_url,owner_user_id,created_at')
      .single();
    if (workspaceError) throw workspaceError;

    const brandUpdate: Record<string, unknown> = { name, slug: update.slug, updated_at: update.updated_at };
    if (logo_url !== undefined) brandUpdate.logo_url = logo_url;
    const { data: brand, error: brandError } = await db
      .from('brands')
      .update(brandUpdate)
      .eq('id', id)
      .select('id,name,slug,logo_url')
      .maybeSingle();
    if (brandError) throw brandError;

    return NextResponse.json({ workspace, brand });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to update workspace.';
    return NextResponse.json({ error: message }, { status: /Authentication|session/i.test(message) ? 401 : 500 });
  }
}
