import { NextResponse } from 'next/server';
import { getActiveConnection, graphRequest, jsonError, requireWhatsAppAccess, WhatsAppHttpError } from '../../../../../lib/whatsapp-server';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json().catch(() => ({}));
    const workspaceId = String(body?.workspaceId || '');
    const { id: campaignId } = await context.params;
    const { db, user } = await requireWhatsAppAccess(request, workspaceId, 'can_publish');
    const connection = await getActiveConnection(db, workspaceId);
    if (!connection) throw new WhatsAppHttpError('WhatsApp is not connected for this workspace. Open Settings first.', 412);

    const { data: campaign, error: campaignError } = await db.from('whatsapp_campaigns')
      .select('id,name,status,template_id,audience_filter')
      .eq('workspace_id', workspaceId).eq('id', campaignId).maybeSingle();
    if (campaignError) throw campaignError;
    if (!campaign) throw new WhatsAppHttpError('Campaign not found.', 404);
    if (['completed','cancelled'].includes(campaign.status)) throw new WhatsAppHttpError('This campaign is already finished.', 400);

    const { data: template, error: templateError } = await db.from('whatsapp_templates')
      .select('id,name,language,status')
      .eq('workspace_id', workspaceId).eq('id', campaign.template_id).maybeSingle();
    if (templateError) throw templateError;
    if (!template || template.status !== 'APPROVED') throw new WhatsAppHttpError('Campaign template is not approved.', 400);

    await db.from('whatsapp_campaigns').update({
      status: 'running',
      started_at: campaign.status === 'draft' ? new Date().toISOString() : undefined,
      connection_id: connection.id,
      updated_at: new Date().toISOString(),
    }).eq('id', campaignId).eq('workspace_id', workspaceId);

    const filter = (campaign.audience_filter || {}) as { template_parameters?: string[] };
    const parameters = Array.isArray(filter.template_parameters) ? filter.template_parameters : [];
    const { data: recipients, error: recipientsError } = await db.from('whatsapp_campaign_recipients')
      .select('id,phone,name,contact_id,status')
      .eq('campaign_id', campaignId).eq('status','queued')
      .order('created_at', { ascending: true }).limit(50);
    if (recipientsError) throw recipientsError;

    let sent = 0;
    let failed = 0;
    for (const recipient of recipients || []) {
      try {
        const { data: conversation, error: conversationError } = await db.from('whatsapp_conversations').upsert({
          workspace_id: workspaceId,
          connection_id: connection.id,
          contact_id: recipient.contact_id || null,
          phone: recipient.phone,
          contact_name: recipient.name || null,
          status: 'open',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id,phone' }).select('id').single();
        if (conversationError || !conversation) throw conversationError || new Error('Unable to create campaign conversation.');

        const { data: message, error: messageError } = await db.from('whatsapp_messages').insert({
          workspace_id: workspaceId,
          connection_id: connection.id,
          conversation_id: conversation.id,
          contact_id: recipient.contact_id || null,
          direction: 'outbound',
          type: 'template',
          body: 'Template: ' + template.name,
          provider_status: 'queued',
          template_name: template.name,
          template_language: template.language,
          template_parameters: parameters,
          sent_by_user_id: user.id,
          metadata: { source: 'campaign', campaign_id: campaignId },
        }).select('id').single();
        if (messageError) throw messageError;

        const bodyParameters = parameters.map(value => ({ type: 'text', text: value })).filter((item: {text:string}) => item.text.length);
        const result = await graphRequest(encodeURIComponent(connection.phone_number_id || '') + '/messages', connection.access_token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: recipient.phone,
            type: 'template',
            template: {
              name: template.name,
              language: { code: template.language },
              ...(bodyParameters.length ? { components: [{ type: 'body', parameters: bodyParameters }] } : {}),
            },
          }),
        });
        const providerId = result?.messages?.[0]?.id ? String(result.messages[0].id) : null;
        await db.from('whatsapp_messages').update({
          provider_message_id: providerId,
          provider_status: 'sent',
          updated_at: new Date().toISOString(),
        }).eq('id', message.id);
        await db.from('whatsapp_campaign_recipients').update({
          status: 'sent',
          provider_message_id: providerId,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', recipient.id);
        await db.from('whatsapp_conversations').update({
          last_message_preview: ('Template: ' + template.name).slice(0,220),
          last_message_at: new Date().toISOString(),
          last_outbound_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', conversation.id);
        sent++;
      } catch (e) {
        failed++;
        await db.from('whatsapp_campaign_recipients').update({
          status: 'failed',
          error_message: e instanceof Error ? e.message : 'Send failed.',
          updated_at: new Date().toISOString(),
        }).eq('id', recipient.id);
      }
    }

    const { data: counts, error: countsError } = await db.from('whatsapp_campaign_recipients').select('status').eq('campaign_id', campaignId);
    if (countsError) throw countsError;
    const rows = counts || [];
    const total = rows.length;
    const sentCount = rows.filter((x:any) => ['sent','delivered','read'].includes(x.status)).length;
    const deliveredCount = rows.filter((x:any) => ['delivered','read'].includes(x.status)).length;
    const readCount = rows.filter((x:any) => x.status === 'read').length;
    const failedCount = rows.filter((x:any) => x.status === 'failed').length;
    const queuedCount = rows.filter((x:any) => x.status === 'queued').length;
    const status = queuedCount === 0 ? 'completed' : 'running';
    await db.from('whatsapp_campaigns').update({
      status,
      total_recipients: total,
      sent_count: sentCount,
      delivered_count: deliveredCount,
      read_count: readCount,
      failed_count: failedCount,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', campaignId).eq('workspace_id', workspaceId);

    return NextResponse.json({ ok: true, campaignId, sent, failed, remaining: queuedCount, status });
  } catch (e) {
    return jsonError(e);
  }
}
