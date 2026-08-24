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
    const db = adminClient();
    const [{ data: profile, error: profileError }, { data: memberships, error: membershipError }] = await Promise.all([
      db.from('profiles').select('full_name,role,active').eq('id', user.id).maybeSingle(),
      db.from('workplace_members').select('workspace_id,employee_id,role,active').eq('user_id', user.id).eq('active', true),
    ]);
    if (profileError) throw profileError;
    if (membershipError) throw membershipError;
    if (profile && profile.active === false) {
      return NextResponse.json({ error: 'Your account is inactive. Please contact the workspace owner.' }, { status: 403 });
    }
    return NextResponse.json({
      user: { id: user.id, email: user.email || null },
      profile: profile || null,
      memberships: memberships || [],
      active: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to validate session.';
    return NextResponse.json({ error: message }, { status: /Authentication|session/i.test(message) ? 401 : 403 });
  }
}
