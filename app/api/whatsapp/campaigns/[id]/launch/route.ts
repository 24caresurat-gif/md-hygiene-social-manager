import { NextResponse } from 'next/server';
import { jsonError, requireWhatsAppAccess } from '../../../../../../lib/whatsapp-server';
import { runWhatsAppCampaignBatch } from '../../../../../../lib/whatsapp-campaign-worker';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json().catch(() => ({}));
    const workspaceId = String(body?.workspaceId || '').trim();
    const { id: campaignId } = await context.params;
    const { db, user } = await requireWhatsAppAccess(request, workspaceId, 'can_publish');
    const result = await runWhatsAppCampaignBatch(db, workspaceId, campaignId, user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return jsonError(e);
  }
}
