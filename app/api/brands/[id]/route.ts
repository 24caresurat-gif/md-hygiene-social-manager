import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function client(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing.');
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function authenticatedClient(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required.');
  const supabase = client(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('Invalid session.');
  return { supabase, user: data.user };
}

async function getAdminClient(request: Request) {
  const { supabase, user } = await authenticatedClient(request);
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;

  const role = String(profile?.role || user.app_metadata?.role || '').toLowerCase();
  if (role !== 'admin') {
    return { denied: true as const, response: NextResponse.json({ error: 'Only administrators can manage workspaces.' }, { status: 403 }) };
  }
  return { denied: false as const, supabase };
}

function makeSlug(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAdminClient(request);
    if (auth.denied) return auth.response;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Workspace id is required.' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'Workspace name is required.' }, { status: 400 });
    if (name.length > 120) return NextResponse.json({ error: 'Workspace name must be 120 characters or less.' }, { status: 400 });

    const update: { name: string; slug: string; logo_url?: string | null } = {
      name,
      slug: makeSlug(name),
    };
    if (!update.slug) return NextResponse.json({ error: 'Please enter a valid workspace name.' }, { status: 400 });

    if (Object.prototype.hasOwnProperty.call(body, 'logo_url')) {
      const logoUrl = body.logo_url ? String(body.logo_url).trim() : null;
      if (logoUrl && logoUrl.length > 2048) return NextResponse.json({ error: 'Logo URL is too long.' }, { status: 400 });
      update.logo_url = logoUrl;
    }

    const { data, error } = await auth.supabase
      .from('brands')
      .update(update)
      .eq('id', id)
      .select('id,name,slug,logo_url')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Workspace not found or not accessible.' }, { status: 404 });

    return NextResponse.json({ brand: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to update workspace.';
    const status = /authentication|required|invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAdminClient(request);
    if (auth.denied) return auth.response;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Workspace id is required.' }, { status: 400 });

    const { data: existing, error: lookupError } = await auth.supabase
      .from('brands')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) return NextResponse.json({ error: 'Workspace not found or not accessible.' }, { status: 404 });

    const { error } = await auth.supabase.from('brands').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to delete workspace.';
    const status = /authentication|required|invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
