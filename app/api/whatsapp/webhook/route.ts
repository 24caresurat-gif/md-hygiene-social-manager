import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server credentials are not configured.');
  return createClient(url, key);
}

export async function GET(request: Request) {
  const u = new URL(request.url);
  const verify = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';
  if (u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === verify) {
    return new Response(u.searchParams.get('hub.challenge') || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get('x-hub-signature-256') || '';
  const secret = process.env.META_APP_SECRET || '';
  if (!secret || !signature.startsWith('sha256=')) return NextResponse.json({ error: 'Invalid webhook configuration.' }, { status: 401 });
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const actual = signature.slice(7);
  if (actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const sb = adminClient();
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const wabaId = String(entry?.id || '');
    if (!wabaId) continue;
    const { data: connection } = await sb.from('whatsapp_connections').select('id,workspace_id').eq('waba_id', wabaId).neq('status','disconnected').maybeSingle();
    if (!connection) continue;

    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== 'smb_app_state_sync') continue;
      const syncItems = Array.isArray(change?.value?.state_sync) ? change.value.state_sync : [];
      for (const item of syncItems) {
        if (item?.type !== 'contact') continue;
        const contact = item?.contact || {};
        const phone = String(contact?.phone_number || contact?.phoneNumber || '').trim();
        if (!phone) continue;
        const action = String(item?.action || 'add').toLowerCase();
        if (action === 'remove') {
          await sb.from('whatsapp_contacts').update({ active: false, updated_at: new Date().toISOString() }).eq('workspace_id', connection.workspace_id).eq('phone', phone);
          continue;
        }
        const name = String(contact?.full_name || contact?.first_name || '').trim() || null;
        const userId = contact?.user_id ? String(contact.user_id) : null;
        await sb.from('whatsapp_contacts').upsert({
          workspace_id: connection.workspace_id, connection_id: connection.id, name, phone,
          whatsapp_user_id: userId, active: true, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }, { onConflict: 'workspace_id,phone' });
      }
      await sb.from('whatsapp_connections').update({ last_sync_at: new Date().toISOString(), status: 'connected', error_message: null, updated_at: new Date().toISOString() }).eq('id', connection.id);
    }
  }
  return NextResponse.json({ ok: true });
}
