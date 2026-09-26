import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return NextResponse.json({ error: 'Missing authorization.' }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const workspaceId = new URL(request.url).searchParams.get('workspaceId') || '';
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });

  const { data: contacts, error } = await supabase.from('whatsapp_contacts')
    .select('id,name,phone')
    .eq('workspace_id', workspaceId)
    .eq('active', true)
    .order('name', { ascending: true, nullsFirst: false })
    .order('phone', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ contacts: contacts || [] });
}
