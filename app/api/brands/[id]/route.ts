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
  return supabase;
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await authenticatedClient(request);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid workspace id.' }, { status: 400 });
    }

    const { error } = await supabase.rpc('admin_delete_workspace', { p_workspace_id: id });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to delete workspace.';
    const status = /Authentication|session/i.test(message) ? 401 : /Admin access required/i.test(message) ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
