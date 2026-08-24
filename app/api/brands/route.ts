import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function client(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing.');
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
}

async function authenticatedClient(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required.');
  const supabase = client(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('Invalid session.');
  return { supabase, user: data.user };
}

function makeSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `workspace-${Date.now()}`;
}

export async function GET(request: Request) {
  try {
    const { supabase, user } = await authenticatedClient(request);
    const { data, error } = await supabase
      .from('workplace_members')
      .select('workspace_id,role,active,workspaces(id,name,slug,logo_url,owner_user_id,created_at)')
      .eq('user_id', user.id)
      .eq('active', true)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const workspaces = (data || [])
      .map((row: any) => row.workspaces)
      .filter(Boolean)
      .map((w: any) => ({ id: w.id, name: w.name, slug: w.slug, logo_url: w.logo_url, owner_user_id: w.owner_user_id, created_at: w.created_at }));

    return NextResponse.json({ workspaces, brands: workspaces });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unable to load workspaces.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await authenticatedClient(request);
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const logo_url = body.logo_url ? String(body.logo_url).trim() : null;
    if (!name) return NextResponse.json({ error: 'Workspace name is required.' }, { status: 400 });
    if (logo_url && logo_url.length > 2048) return NextResponse.json({ error: 'Logo URL is too long.' }, { status: 400 });

    const slug = makeSlug(name);
    const workspaceId = crypto.randomUUID();
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({ id: workspaceId, owner_user_id: user.id, name, slug, logo_url })
      .select('id,name,slug,logo_url,owner_user_id,created_at')
      .single();
    if (workspaceError) throw workspaceError;

    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .insert({ id: workspaceId, workspace_id: workspaceId, user_id: user.id, name, slug, logo_url })
      .select('id,name,slug,logo_url')
      .single();
    if (brandError) {
      await supabase.from('workspaces').delete().eq('id', workspaceId);
      throw brandError;
    }

    const { error: membershipError } = await supabase
      .from('workplace_members')
      .upsert({ workplace_id: workspaceId, workspace_id: workspaceId, user_id: user.id, role: 'owner', active: true }, { onConflict: 'workplace_id,user_id' });
    if (membershipError) {
      await supabase.from('brands').delete().eq('id', workspaceId);
      await supabase.from('workspaces').delete().eq('id', workspaceId);
      throw membershipError;
    }

    return NextResponse.json({ workspace, brand }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to create workspace.';
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') || message.includes('session') ? 401 : 403 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await authenticatedClient(request);
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    const name = String(body.name || '').trim();
    const logo_url = body.logo_url ? String(body.logo_url).trim() : null;
    if (!id || !name) return NextResponse.json({ error: 'Workspace ID and name are required.' }, { status: 400 });
    if (logo_url && logo_url.length > 2048) return NextResponse.json({ error: 'Logo URL is too long.' }, { status: 400 });
    const slug = makeSlug(name);

    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .update({ name, slug, logo_url })
      .eq('id', id)
      .eq('owner_user_id', user.id)
      .select('id,name,slug,logo_url,owner_user_id,created_at')
      .single();
    if (workspaceError) throw workspaceError;

    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .update({ name, slug, logo_url })
      .eq('workspace_id', id)
      .eq('user_id', user.id)
      .select('id,name,slug,logo_url')
      .limit(1)
      .maybeSingle();
    if (brandError) throw brandError;

    return NextResponse.json({ workspace, brand });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to update workspace.';
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') || message.includes('session') ? 401 : 403 });
  }
}
