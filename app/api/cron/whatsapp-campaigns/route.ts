import { NextResponse } from 'next/server';
import { adminClient, graphRequest } from '../../../../lib/whatsapp-server';

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET || '';
  return Boolean(secret) && (
    request.headers.get('authorization') === 'Bearer ' + secret ||
    request.headers.get('x-cron-secret') === secret
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = adminClient();
  const now = new Date();
  const { data: campaigns, error } = await db.from('whatsapp_campaigns')
    .select('id,name,status,template_id,audience_filter,connection_id,scheduled_at,created_by')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const campaign of campaigns || []) {
    const { data: claim } = await db.from('whatsapp_campaigns')
      .update({ status: 'running', started_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('id', campaign.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle();
    if (!claim) continue;

    processed++;

    try {
      const { data: template, error: templateError } = await db.from('whatsapp_templates')
        .select('id,name,language,status')
        .eq('workspace_id', (await db.from('whatsapp_campaigns').select('workspace_id').eq('id', campaign.id).single()).data?.workspace_id)
        .eq('id', campaign.template_id)
        .maybeSingle();
      if (templateError) throw templateError;
      if (!template || template.status !== 'APPROVED') throw new Error('Campaign template is not approved.');

      const workspaceResult = await db.from('whatsapp_campaigns').select('workspace_id').eq('id', campaign.id).single();
      const workspaceId = workspaceResult.data?.workspace_id;
      if (!workspaceId) throw new Error('Campaign workspace could not be resolved.');

      const { data: connection } = await db.from('whatsapp_connections')
        .select('id,workspace_id,waba_id,phone_number_id,access_token,status')
        .eq('workspace_id', workspaceId)
        .eq('status', 'connected')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!connection) throw new Error('WhatsApp connection is unavailable for this workspace.');

      const filter = (campaign.audience_filter || {}) as { template_parameters?: string[] };
      const parameters = Array.isArray(filter.template_parameters) ? filter.template_parameters : [];

      const { data: recipients, error: recipientError } = await db.from('whatsapp_campaign_recipients')
        .select('id,phone,name,contact_id,status')
        .eq('campaign_id', campaign.id)
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(50);
      if (recipientError) throw recipientError;

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
          if (conversationError || !conversation) throw conversationError || new Error('Unable to create conversation.');

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
            sent_by_user_id: campaign.created_by || null,
            metadata: { source: 'scheduled_campaign', campaign_id: campaign.id },
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
            last_message_preview: ('Template: ' + template.name).slice(0, 220),
            last_message_at: new Date().toISOString(),
            last_outbound_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', conversation.id);

          sent++;
        } catch (e) {
          failed++;
          await db.from('whatsapp_campaign_recipients').update({
            status: 'failed',
            error_message: e instanceof Error ? e.message : 'Scheduled send failed.',
            updated_at: new Date().toISOString(),
          }).eq('id', recipient.id);
        }
      }

      const { data: rows } = await db.from('whatsapp_campaign_recipients').select('status').eq('campaign_id', campaign.id);
      const stats = rows || [];
      const queued = stats.filter((x:any) => x.status === 'queued').length;
      const sentCount = stats.filter((x:any) => ['sent','delivered','read'].includes(x.status)).length;
      const deliveredCount = stats.filter((x:any) => ['delivered','read'].includes(x.status)).length;
      const readCount = stats.filter((x:any) => x.status === 'read').length;
      const failedCount = stats.filter((x:any) => x.status === 'failed').length;

      await db.from('whatsapp_campaigns').update({
        connection_id: connection.id,
        status: queued > 0 ? 'scheduled' : 'completed',
        total_recipients: stats.length,
        sent_count: sentCount,
        delivered_count: deliveredCount,
        read_count: readCount,
        failed_count: failedCount,
        completed_at: queued > 0 ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', campaign.id);
    } catch (e) {
      failed++;
      await db.from('whatsapp_campaigns').update({
        status: 'scheduled',
        updated_at: new Date().toISOString(),
      }).eq('id', campaign.id);
    }
  }

  return NextResponse.json({ ok: true, processed, sent, failed });
}
