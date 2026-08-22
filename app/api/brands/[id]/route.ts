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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await authenticatedClient(request);
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const role = String(profile?.role || user.app_metadata?.role || user.user_metadata?.role || '').toLowerCase();
    if (!['admin', 'owner', 'super_admin'].includes(role)) {
      return NextResponse.json({ error: 'Only administrators can delete workspaces.' }, { status: 403 });
    }

    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Workspace id is required.' }, { status: 400 });

    const { data: existing, error: lookupError } = await supabase
      .from('brands')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) return NextResponse.json({ error: 'Workspace not found or not accessible.' }, { status: 404 });

    const { error } = await supabase.from('brands').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to delete workspace.';
    const status = message.includes('Authentication') || message.includes('session') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
