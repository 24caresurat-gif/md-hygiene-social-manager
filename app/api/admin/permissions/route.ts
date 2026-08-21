import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function client(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing.');
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
}

async function admin(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const sb = client(token);
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u.user) return null;
  const { data: p } = await sb.from('profiles').select('role,active').eq('id', u.user.id).maybeSingle();
  return p?.role === 'admin' && p.active !== false ? { sb, user: u.user } : null;
}

export async function GET(request: Request) {
  try {
    const a = await admin(request);
    if (!a) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    const { data, error } = await a.sb
      .from('workplace_permissions')
      .select('id,user_id,workplace_id,platform,can_view,can_create,can_edit,can_submit,can_publish');
    if (error) throw error;
    return NextResponse.json({ permissions: data || [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unable to load permissions.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const a = await admin(request);
    if (!a) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    const b = await request.json();
    const user_id = String(b.user_id || '');
    const workplace_id = String(b.workplace_id || '');
    const platform = String(b.platform || '');
    if (!user_id || !workplace_id || !['facebook', 'instagram', 'google_business'].includes(platform)) {
      return NextResponse.json({ error: 'user_id, workplace_id and valid platform are required.' }, { status: 400 });
    }
    const row = {
      user_id,
      workplace_id,
      platform,
      can_view: b.can_view !== false,
      can_create: b.can_create === true,
      can_edit: b.can_edit === true,
      can_submit: b.can_submit === true,
      can_publish: b.can_publish === true,
    };
    const { data, error } = await a.sb
      .from('workplace_permissions')
      .upsert(row, { onConflict: 'workplace_id,user_id,platform' })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ permission: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unable to save permission.' }, { status: 400 });
  }
}
