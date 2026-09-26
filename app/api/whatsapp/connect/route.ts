import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v25.0';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server credentials are not configured.');
  return createClient(url, key);
}

export async function POST(request: Request) {
  try {
    const auth = request.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Missing authorization.' }, { status: 401 });

    const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: 'Bearer ' + token } }
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    const workspaceId = String(body?.workspaceId || '');
    const code = String(body?.code || '');
    let wabaId = String(body?.wabaId || '');
    let phoneNumberId = body?.phoneNumberId ? String(body.phoneNumberId) : null;
    const businessId = body?.businessId ? String(body.businessId) : null;
    if (!workspaceId || !code || !wabaId) return NextResponse.json({ error: 'workspaceId, code and wabaId are required.' }, { status: 400 });

    const sb = adminClient();
    const { data: workspace } = await sb.from('workspaces').select('id,owner_user_id').eq('id', workspaceId).maybeSingle();
    if (!workspace) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    const owner = workspace.owner_user_id === user.id;
    const { data: member } = await sb.from('workplace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).eq('active', true).maybeSingle();
    if (!owner && (!member || !['admin','manager'].includes(member.role))) return NextResponse.json({ error: 'Only workspace owner/admin/manager can connect WhatsApp.' }, { status: 403 });

    const appId = process.env.META_APP_ID || '1578165993688458';
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) return NextResponse.json({ error: 'META_APP_SECRET is not configured in Vercel.' }, { status: 500 });

    const exchange = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: appSecret, code })}`, { cache: 'no-store' });
    const exchanged = await exchange.json();
    if (!exchange.ok || !exchanged?.access_token) throw new Error(exchanged?.error?.message || 'WhatsApp authorization code exchange failed.');
    const businessToken = String(exchanged.access_token);

    if (!phoneNumberId) {
      const p = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name`, {
        headers: { Authorization: 'Bearer ' + businessToken }, cache: 'no-store'
      });
      const pd = await p.json();
      if (!p.ok || !pd?.data?.length) throw new Error(pd?.error?.message || 'No WhatsApp business phone number was returned.');
      phoneNumberId = String(pd.data[0].id);
    }

    let displayPhoneNumber: string | null = null;
    let businessName: string | null = null;
    const phone = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`, {
      headers: { Authorization: 'Bearer ' + businessToken }, cache: 'no-store'
    });
    const phoneData = await phone.json();
    if (phone.ok) {
      displayPhoneNumber = phoneData?.display_phone_number || null;
      businessName = phoneData?.verified_name || null;
    }

    const subscribe = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + businessToken }
    });
    const subscribeData = await subscribe.json().catch(() => ({}));
    if (!subscribe.ok) throw new Error(subscribeData?.error?.message || 'Unable to subscribe the app to this WhatsApp Business Account.');

    const { data: connection, error } = await sb.from('whatsapp_connections').upsert({
      workspace_id: workspaceId, user_id: user.id, waba_id: wabaId, phone_number_id: phoneNumberId,
      business_id: businessId, display_phone_number: displayPhoneNumber, business_name: businessName,
      access_token: businessToken, status: 'syncing', error_message: null, updated_at: new Date().toISOString()
    }, { onConflict: 'workspace_id,waba_id' }).select('id,display_phone_number,business_name,status').single();
    if (error) throw error;

    const sync = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/smb_app_data`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + businessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: 'smb_app_state_sync' })
    });
    const syncData = await sync.json().catch(() => ({}));
    if (!sync.ok) {
      await sb.from('whatsapp_connections').update({ status: 'error', error_message: syncData?.error?.message || 'Contact sync could not be started.', updated_at: new Date().toISOString() }).eq('id', connection.id);
      throw new Error(syncData?.error?.message || 'Contact sync could not be started.');
    }

    await sb.from('whatsapp_connections').update({ last_sync_at: new Date().toISOString(), status: 'connected', updated_at: new Date().toISOString() }).eq('id', connection.id);

    return NextResponse.json({ ok: true, connected: true, displayPhoneNumber, businessName, requestId: syncData?.request_id || null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'WhatsApp connection failed.' }, { status: 500 });
  }
}
