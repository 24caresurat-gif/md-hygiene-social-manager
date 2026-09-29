import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { adminClient } from '../../../../lib/whatsapp-server';

function verifySignature(raw: string, signature: string, secret: string) {
  if (!secret || !signature.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const actual = signature.slice(7);
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function preview(message: any) {
  const type = String(message?.type || 'unknown');
  if (type === 'text') return String(message?.text?.body || '');
  if (type === 'image') return String(message?.image?.caption || '[Image]');
  if (type === 'video') return String(message?.video?.caption || '[Video]');
  if (type === 'audio') return '[Audio]';
  if (type === 'document') return String(message?.document?.caption || message?.document?.filename || '[Document]');
  if (type === 'sticker') return '[Sticker]';
  if (type === 'location') return '[Location]';
  if (type === 'contacts') return '[Contact card]';
  if (type === 'reaction') return String(message?.reaction?.emoji || '[Reaction]');
  if (type === 'interactive') return String(message?.interactive?.button_reply?.title || message?.interactive?.list_reply?.title || '[Interactive]');
  return '[' + type + ']';
}

async function inbound(db: any, connection: any, value: any, message: any) {
  const phone = String(message?.from || '').trim();
  const providerId = String(message?.id || '').trim();
  if (!phone || !providerId) return;

  const profile = Array.isArray(value?.contacts) ? value.contacts.find((x: any) => String(x?.wa_id || '') === phone) || value.contacts[0] : null;
  const contactName = String(profile?.profile?.name || '').trim() || null;
  const now = new Date();

  const { data: existingContact } = await db.from('whatsapp_contacts').select('id,name').eq('workspace_id', connection.workspace_id).eq('phone', phone).maybeSingle();
  const { data: contact, error: contactError } = await db.from('whatsapp_contacts').upsert({
    workspace_id: connection.workspace_id,
    connection_id: connection.id,
    name: contactName || existingContact?.name || null,
    phone,
    whatsapp_user_id: phone,
    active: true,
    last_seen_at: now.toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'workspace_id,phone' }).select('id,name').single();
  if (contactError) throw contactError;

  const { data: duplicate } = await db.from('whatsapp_messages').select('id').eq('connection_id', connection.id).eq('provider_message_id', providerId).maybeSingle();
  if (duplicate) return;

  const textPreview = preview(message).slice(0,220);
  const { data: conversation, error: conversationError } = await db.from('whatsapp_conversations').upsert({
    workspace_id: connection.workspace_id,
    connection_id: connection.id,
    contact_id: contact.id,
    phone,
    contact_name: contactName || contact?.name || null,
    status: 'open',
    last_message_preview: textPreview,
    last_message_at: now.toISOString(),
    last_inbound_at: now.toISOString(),
    customer_window_expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'workspace_id,phone' }).select('id,unread_count').single();
  if (conversationError) throw conversationError;

  const type = String(message?.type || 'unknown');
  const mediaObject = message?.[type];
  await db.from('whatsapp_messages').insert({
    workspace_id: connection.workspace_id,
    connection_id: connection.id,
    conversation_id: conversation.id,
    contact_id: contact.id,
    direction: 'inbound',
    type,
    body: textPreview,
    media_url: ['image','video','audio','document','sticker'].includes(type) && mediaObject?.id ? String(mediaObject.id) : null,
    media_mime_type: mediaObject?.mime_type ? String(mediaObject.mime_type) : null,
    provider_message_id: providerId,
    provider_status: 'received',
    metadata: { source: 'webhook', context_message_id: message?.context?.id ? String(message.context.id) : null },
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });

  await db.from('whatsapp_conversations').update({
    unread_count: Number(conversation.unread_count || 0) + 1,
    last_message_preview: textPreview,
    last_message_at: now.toISOString(),
    last_inbound_at: now.toISOString(),
    customer_window_expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    status: 'open',
    updated_at: now.toISOString(),
  }).eq('id', conversation.id);

  await db.from('whatsapp_connections').update({
    last_sync_at: now.toISOString(),
    status: 'connected',
    error_message: null,
    updated_at: now.toISOString(),
  }).eq('id', connection.id);
}

async function deliveryStatus(db: any, connection: any, item: any) {
  const providerId = String(item?.id || '').trim();
  const status = String(item?.status || '').toLowerCase();
  if (!providerId || !status) return;

  const errors = Array.isArray(item?.errors) ? item.errors : [];
  const errorMessage = errors.length ? String(errors[0]?.message || errors[0]?.title || 'WhatsApp delivery failed.') : null;

  await db.from('whatsapp_messages').update({
    provider_status: status,
    error_message: errorMessage,
    updated_at: new Date().toISOString(),
  }).eq('connection_id', connection.id).eq('provider_message_id', providerId);

  const { data: recipient } = await db.from('whatsapp_campaign_recipients')
    .select('id,campaign_id').eq('provider_message_id', providerId).maybeSingle();
  if (!recipient) return;

  const recipientStatus = status === 'read' ? 'read' : status === 'delivered' ? 'delivered' : status === 'failed' ? 'failed' : 'sent';
  const patch: Record<string, unknown> = { status: recipientStatus, updated_at: new Date().toISOString() };
  if (recipientStatus === 'delivered') patch.delivered_at = new Date().toISOString();
  if (recipientStatus === 'read') patch.read_at = new Date().toISOString();
  if (errorMessage) patch.error_message = errorMessage;
  await db.from('whatsapp_campaign_recipients').update(patch).eq('id', recipient.id);

  const { data: all } = await db.from('whatsapp_campaign_recipients').select('status').eq('campaign_id', recipient.campaign_id);
  const rows = all || [];
  await db.from('whatsapp_campaigns').update({
    sent_count: rows.filter((x:any) => ['sent','delivered','read'].includes(x.status)).length,
    delivered_count: rows.filter((x:any) => ['delivered','read'].includes(x.status)).length,
    read_count: rows.filter((x:any) => x.status === 'read').length,
    failed_count: rows.filter((x:any) => x.status === 'failed').length,
    updated_at: new Date().toISOString(),
  }).eq('id', recipient.campaign_id);
}

export async function GET(request: Request) {
  const u = new URL(request.url);
  const verify = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';
  if (u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === verify) return new Response(u.searchParams.get('hub.challenge') || '', { status: 200 });
  return new Response('Forbidden', { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get('x-hub-signature-256') || '';
  if (!verifySignature(raw, signature, process.env.META_APP_SECRET || '')) return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });

  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const db = adminClient();
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    const wabaId = String(entry?.id || '');
    let { data: connection } = await db.from('whatsapp_connections')
      .select('id,workspace_id,waba_id,phone_number_id').eq('waba_id', wabaId).neq('status','disconnected')
      .order('updated_at', { ascending:false }).limit(1).maybeSingle();

    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const phoneNumberId = String(change?.value?.metadata?.phone_number_id || '');
      if (phoneNumberId) {
        const byPhone = await db.from('whatsapp_connections')
          .select('id,workspace_id,waba_id,phone_number_id').eq('phone_number_id', phoneNumberId)
          .neq('status','disconnected').maybeSingle();
        if (byPhone.data) connection = byPhone.data;
      }
      if (!connection) continue;

      if (change?.field === 'smb_app_state_sync') {
        for (const item of Array.isArray(change?.value?.state_sync) ? change.value.state_sync : []) {
          if (String(item?.type || '').toLowerCase() !== 'contact') continue;
          const contact = item?.contact || {};
          const phone = String(contact?.phone_number || contact?.phoneNumber || '').trim();
          if (!phone) continue;
          const action = String(item?.action || 'add').toLowerCase();
          if (action === 'remove') {
            await db.from('whatsapp_contacts').update({ active:false, updated_at:new Date().toISOString() })
              .eq('workspace_id', connection.workspace_id).eq('phone', phone);
            continue;
          }
          await db.from('whatsapp_contacts').upsert({
            workspace_id: connection.workspace_id,
            connection_id: connection.id,
            name: String(contact?.full_name || contact?.first_name || '').trim() || null,
            phone,
            whatsapp_user_id: contact?.user_id ? String(contact.user_id) : null,
            active: true,
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict:'workspace_id,phone' });
        }
      }

      if (change?.field === 'messages') {
        const value = change?.value || {};
        for (const item of Array.isArray(value?.messages) ? value.messages : []) await inbound(db, connection, value, item);
        for (const item of Array.isArray(value?.statuses) ? value.statuses : []) await deliveryStatus(db, connection, item);
      }

      await db.from('whatsapp_connections').update({
        last_sync_at:new Date().toISOString(), status:'connected', error_message:null, updated_at:new Date().toISOString()
      }).eq('id', connection.id);
    }
  }

  return NextResponse.json({ ok: true });
}
