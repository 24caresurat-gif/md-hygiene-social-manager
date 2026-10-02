import { NextResponse } from 'next/server';
import { adminClient, WhatsAppHttpError } from '../../../../lib/whatsapp-server';
import { runWhatsAppCampaignBatch } from '../../../../lib/whatsapp-campaign-worker';

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
  const now = new Date().toISOString();
  const { data: campaigns, error } = await db.from('whatsapp_campaigns')
    .select('id,workspace_id,created_by')
    .eq('status', 'scheduled')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let processed = 0;
  let completed = 0;
  let failed = 0;
  let sent = 0;

  for (const campaign of campaigns || []) {
    const claimed = await db.from('whatsapp_campaigns')
      .update({ status: 'running', updated_at: now })
      .eq('id', campaign.id)
      .eq('workspace_id', campaign.workspace_id)
      .eq('status', 'scheduled')
      .select('id,workspace_id,created_by')
      .maybeSingle();

    if (!claimed.data) continue;
    processed++;

    try {
      const result = await runWhatsAppCampaignBatch(
        db,
        String(campaign.workspace_id),
        String(campaign.id),
        claimed.data.created_by ? String(claimed.data.created_by) : null,
      );
      sent += result.sent;
      if (result.status === 'completed') completed++;
    } catch (e) {
      failed++;
      // Leave it scheduled so a future run can retry after Settings is connected
      // or after a transient provider/database error is resolved.
      await db.from('whatsapp_campaigns').update({
        status: 'scheduled',
        updated_at: new Date().toISOString(),
      }).eq('id', campaign.id).eq('workspace_id', campaign.workspace_id);
      if (e instanceof WhatsAppHttpError && e.status >= 500) {
        // Keep the worker response stable for callers; the retry stays database-driven.
      }
    }
  }

  return NextResponse.json({ ok: true, processed, completed, failed, sent });
}
