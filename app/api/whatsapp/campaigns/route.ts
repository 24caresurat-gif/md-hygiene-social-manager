import { NextResponse } from 'next/server';
import { getActiveConnection, jsonError, requireWhatsAppAccess, WhatsAppHttpError } from '../../../../lib/whatsapp-server';

export async function GET(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get('workspaceId') || '';
    const { db } = await requireWhatsAppAccess(request, workspaceId);
    const { data, error } = await db.from('whatsapp_campaigns')
      .select('id,name,status,scheduled_at,started_at,completed_at,total_recipients,sent_count,delivered_count,read_count,failed_count,template_id,whatsapp_templates(name,language,status),created_at,updated_at')
      .eq('workspace_id', workspaceId).order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ campaigns: data || [] });
  } catch (e) { return jsonError(e); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const workspaceId = String(body?.workspaceId || '');
    const name = String(body?.name || '').trim();
    const templateId = String(body?.templateId || '');
    const contactIds = Array.isArray(body?.contactIds) ? body.contactIds.map((v: unknown) => String(v)) : [];
    const templateParameters = Array.isArray(body?.templateParameters) ? body.templateParameters.map((v: unknown) => String(v ?? '').trim()).filter(Boolean) : [];
    const scheduledAt = body?.scheduledAt ? String(body.scheduledAt) : null;
    const { db, user } = await requireWhatsAppAccess(request, workspaceId, 'can_create');
    if (!name || !templateId) throw new WhatsAppHttpError('Campaign name and an approved template are required.', 400);

    const { data: template, error: templateError } = await db.from('whatsapp_templates').select('id,name,language,status')
      .eq('workspace_id', workspaceId).eq('id', templateId).maybeSingle();
    if (templateError) throw templateError;
    if (!template) throw new WhatsAppHttpError('Template not found.', 404);
    if (template.status !== 'APPROVED') throw new WhatsAppHttpError('Only an APPROVED WhatsApp template can be used for a campaign.', 400);

    let contactQuery = db.from('whatsapp_contacts').select('id,name,phone').eq('workspace_id', workspaceId).eq('active', true).order('name', { ascending: true, nullsFirst: false });
    if (contactIds.length) contactQuery = contactQuery.in('id', contactIds);
    const { data: contacts, error: contactError } = await contactQuery;
    if (contactError) throw contactError;
    const selectedContacts = contacts || [];

    const connection = await getActiveConnection(db, workspaceId);
    const { data: campaign, error: campaignError } = await db.from('whatsapp_campaigns').insert({
      workspace_id: workspaceId, connection_id: connection?.id || null, name, template_id: template.id,
      audience_filter: { selection: contactIds.length ? 'selected' : 'all_active', template_parameters: templateParameters },
      status: scheduledAt ? 'scheduled' : 'draft', scheduled_at: scheduledAt,
      total_recipients: selectedContacts.length, created_by: user.id, updated_at: new Date().toISOString(),
    }).select('id,name,status,total_recipients,scheduled_at').single();
    if (campaignError) throw campaignError;

    if (selectedContacts.length) {
      const { error: recipientError } = await db.from('whatsapp_campaign_recipients').insert(
        selectedContacts.map((contact: any) => ({ campaign_id: campaign.id, contact_id: contact.id, phone: contact.phone, name: contact.name || null }))
      );
      if (recipientError) throw recipientError;
    }
    return NextResponse.json({ ok: true, campaign });
  } catch (e) { return jsonError(e); }
}
