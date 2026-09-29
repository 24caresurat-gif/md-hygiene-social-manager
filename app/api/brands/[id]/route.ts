import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server database configuration is missing.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function authenticate(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing.');
  const supabase = createClient(url, key, { global: { headers: { Authorization: \`Bearer \${token}\` } } });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('Invalid session.');
  return data.user;
}

async function assertWorkspaceAdmin(db: ReturnType<typeof adminClient>, workspaceId: string, userId: string) {
  const { data: workspace, error: workspaceError } = await db
    .from('workspaces')
    .select('owner_user_id')
    .eq('id', workspaceId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace) return false;
  if (workspace.owner_user_id === userId) return true;

  const { data: member, error } = await db
    .from('workplace_members')
    .select('role,active')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return Boolean(member && ['owner', 'admin'].includes(String(member.role || '').toLowerCase()));
}

function makeSlug(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || \`workspace-\${Date.now()}\`;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticate(request);
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Workspace id is required.' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'Workspace name is required.' }, { status: 400 });
    if (name.length > 120) return NextResponse.json({ error: 'Workspace name must be 120 characters or less.' }, { status: 400 });

    const db = adminClient();
    if (!await assertWorkspaceAdmin(db, id, user.id)) {
      return NextResponse.json({ error: 'Only the workspace owner or admin can update workspace settings.' }, { status: 403 });
    }

    const logo_url = Object.prototype.hasOwnProperty.call(body, 'logo_url') ? (body.logo_url ? String(body.logo_url).trim() : null) : undefined;
    if (logo_url && logo_url.length > 2048) return NextResponse.json({ error: 'Logo URL is too long.' }, { status: 400 });

    const update: Record<string, unknown> = { name, slug: makeSlug(name), updated_at: new Date().toISOString() };
    if (logo_url !== undefined) update.logo_url = logo_url;

    const { data: brand, error: brandError } = await db
      .from('brands')
      .update(update)
      .eq('id', id)
      .select('id,name,slug,logo_url')
      .maybeSingle();
    if (brandError) throw brandError;
    if (!brand) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .update(update)
      .eq('id', id)
      .select('id,name,slug,logo_url,owner_user_id,created_at')
      .maybeSingle();
    if (workspaceError) throw workspaceError;

    return NextResponse.json({ workspace, brand });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to update workspace.';
    return NextResponse.json({ error: message }, { status: /Authentication|session/i.test(message) ? 401 : 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticate(request);
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Workspace id is required.' }, { status: 400 });

    const db = adminClient();
    if (!await assertWorkspaceAdmin(db, id, user.id)) {
      return NextResponse.json({ error: 'Only the workspace owner or admin can delete this workspace.' }, { status: 403 });
    }

    const { data: existing, error: lookupError } = await db
      .from('workspaces')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

    const { error } = await db.from('workspaces').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to delete workspace.';
    return NextResponse.json({ error: message }, { status: /Authentication|session/i.test(message) ? 401 : 500 });
  }
}
