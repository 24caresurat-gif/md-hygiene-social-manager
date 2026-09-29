import { NextResponse } from 'next/server';
import { getActiveConnection, graphRequest, jsonError, requireWhatsAppAccess, WhatsAppHttpError } from '../../../../lib/whatsapp-server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId') || '';
    const conversationId = url.searchParams.get('conversationId') || '';
    const { db } = await requireWhatsAppAccess(request, workspaceId);
    if (!conversationId) throw new WhatsAppHttpError('conversationId is required.', 400);
    const { data: conversation, error: conversationError } = await db.from('whatsapp_conversations')
      .select('id,phone,contact_name,status,unread_count,customer_window_expires_at').eq('id', conversationId).eq('workspace_id', workspaceId).maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) throw new WhatsAppHttpError('Conversation not found.', 404);
    const { data, error } = await db.from('whatsapp_messages')
      .select('id,direction,type,body,media_url,media_mime_type,provider_status,error_message,template_name,template_language,template_parameters,created_at,updated_at')
      .eq('conversation_id', conversationId).eq('workspace_id', workspaceId).order('created_at', { ascending: true }).limit(500);
    if (error) throw error;
    return NextResponse.json({ conversation, messages: data || [] });
  } catch (e) { return jsonError(e); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const workspaceId = String(body?.workspaceId || '');
    const conversationId = String(body?.conversationId || '');
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const templateName = typeof body?.templateName === 'string' ? body.templateName.trim() : '';
    const templateParameters = Array.isArray(body?.templateParameters) ? body.templateParameters.map((v: unknown) => String(v ?? '').trim()) : [];
    const { db, user } = await requireWhatsAppAccess(request, workspaceId, 'can_publish');
    if (!conversationId) throw new WhatsAppHttpError('conversationId is required.', 400);

    const { data: conversation, error } = await db.from('whatsapp_conversations')
      .select('id,phone,contact_id,contact_name,customer_window_expires_at,connection_id').eq('id', conversationId).eq('workspace_id', workspaceId).maybeSingle();
    if (error) throw error;
    if (!conversation) throw new WhatsAppHttpError('Conversation not found.', 404);
    const connection = await getActiveConnection(db, workspaceId);
    if (!connection || connection.id !== conversation.connection_id) throw new WhatsAppHttpError('WhatsApp is not connected for this workspace. Open Settings.', 412);

    let payload: Record<string, unknown>;
    let type: 'text' | 'template' = 'text';
    let storedBody = text;
    let language: string | null = null;

    if (templateName) {
      const { data: template, error: templateError } = await db.from('whatsapp_templates')
        .select('name,language,status').eq('workspace_id', workspaceId).eq('name', templateName).eq('status', 'APPROVED').maybeSingle();
      if (templateError) throw templateError;
      if (!template) throw new WhatsAppHttpError('Approved WhatsApp template not found. Sync templates first.', 400);
      type = 'template';
      storedBody = 'Template: ' + template.name;
      language = template.language;
      const parameters = templateParameters.map((value: string) => ({ type: 'text', text: value })).filter((item: {text:string}) => item.text.length);
      payload = { messaging_product: 'whatsapp', to: conversation.phone, type: 'template', template: { name: template.name, language: { code: template.language }, ...(parameters.length ? { components: [{ type: 'body', parameters }] } : {}) } };
    } else {
      if (!text) throw new WhatsAppHttpError('Message text is required.', 400);
      if (text.length > 4096) throw new WhatsAppHttpError('Text messages are limited to 4096 characters.', 400);
      const expiresAt = conversation.customer_window_expires_at ? new Date(conversation.customer_window_expires_at).getTime() : 0;
      if (!expiresAt || expiresAt <= Date.now()) throw new WhatsAppHttpError('The 24-hour customer service window is closed. Use an approved template.', 409, 'TEMPLATE_REQUIRED');
      payload = { messaging_product: 'whatsapp', to: conversation.phone, type: 'text', text: { body: text, preview_url: false } };
    }

    const now = new Date().toISOString();
    const { data: queued, error: insertError } = await db.from('whatsapp_messages').insert({
      workspace_id: workspaceId, connection_id: connection.id, conversation_id: conversation.id, contact_id: conversation.contact_id,
      direction: 'outbound', type, body: storedBody, provider_status: 'queued',
      template_name: templateName || null, template_language: language, template_parameters: templateParameters,
      sent_by_user_id: user.id, metadata: { source: 'inbox' }, created_at: now, updated_at: now
    }).select('id').single();
    if (insertError) throw insertError;

    try {
      const result = await graphRequest(encodeURIComponent(connection.phone_number_id || '') + '/messages', connection.access_token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const providerMessageId = result?.messages?.[0]?.id ? String(result.messages[0].id) : null;
      await db.from('whatsapp_messages').update({ provider_message_id: providerMessageId, provider_status: 'sent', updated_at: new Date().toISOString() }).eq('id', queued.id);
      await db.from('whatsapp_conversations').update({ last_message_preview: storedBody.slice(0,220), last_message_at: new Date().toISOString(), last_outbound_at: new Date().toISOString(), status: 'open', updated_at: new Date().toISOString() }).eq('id', conversation.id);
      return NextResponse.json({ ok: true, messageId: queued.id, providerMessageId });
    } catch (e) {
      await db.from('whatsapp_messages').update({ provider_status: 'failed', error_message: e instanceof Error ? e.message : 'WhatsApp send failed.', updated_at: new Date().toISOString() }).eq('id', queued.id);
      throw e;
    }
  } catch (e) { return jsonError(e); }
}
