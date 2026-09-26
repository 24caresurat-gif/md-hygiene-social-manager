import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server credentials are not configured.');
  return createClient(url, key);
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return NextResponse.json({ error: 'Missing authorization.' }, { status: 401 });

  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: 'Bearer ' + token } }
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const workspaceId = new URL(request.url).searchParams.get('workspaceId') || '';
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });

  const sb = adminClient();
  const { data: workspace } = await sb.from('workspaces').select('id,owner_user_id').eq('id', workspaceId).maybeSingle();
  if (!workspace) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const owner = workspace.owner_user_id === user.id;
  const { data: member } = await sb.from('workplace_members').select('id').eq('workspace_id', workspaceId).eq('user_id', user.id).eq('active', true).maybeSingle();
  if (!owner && !member) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const { data: connection } = await sb.from('whatsapp_connections')
    .select('id,waba_id,phone_number_id,business_id,display_phone_number,business_name,status,last_sync_at,error_message')
    .eq('workspace_id', workspaceId).neq('status', 'disconnected').order('created_at', { ascending: false }).limit(1).maybeSingle();

  return NextResponse.json({ connected: !!connection, connection: connection || null });
}
