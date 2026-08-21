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

async function requireAdmin(supabase: ReturnType<typeof client>, userId: string) {
  const { data, error } = await supabase.from('profiles').select('role,active').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (data?.role !== 'admin' || data.active === false) throw new Error('Admin access required.');
}

export async function GET(request: Request) {
  try {
    const { supabase } = await authenticatedClient(request);
    const { data, error } = await supabase.from('brands').select('id,name,slug,logo_url').order('name');
    if (error) throw error;
    return NextResponse.json({ brands: data || [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unable to load workspaces.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await authenticatedClient(request);
    await requireAdmin(supabase, user.id);
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const logo_url = body.logo_url ? String(body.logo_url).trim() : null;
    if (!name) return NextResponse.json({ error: 'Workspace name is required.' }, { status: 400 });
    if (logo_url && logo_url.length > 2048) return NextResponse.json({ error: 'Logo URL is too long.' }, { status: 400 });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { data, error } = await supabase.from('brands').insert({ user_id: user.id, name, slug, logo_url }).select('id,name,slug,logo_url').single();
    if (error) throw error;
    return NextResponse.json({ brand: data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to create workspace.';
    const status = message.includes('Authentication') || message.includes('session') ? 401 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
