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

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const workspaceId = String(body?.workspaceId || '').trim();
    const campaignId = String(body?.campaignId || '').trim();
    const action = String(body?.action || '').trim();
    const { db } = await requireWhatsAppAccess(request, workspaceId, 'can_edit');
    if (!campaignId) throw new WhatsAppHttpError('campaignId is required.', 400);

    const { data: campaign, error } = await db.from('whatsapp_campaigns')
      .select('id,status,scheduled_at')
      .eq('workspace_id', workspaceId)
      .eq('id', campaignId)
      .maybeSingle();
    if (error) throw error;
    if (!campaign) throw new WhatsAppHttpError('Campaign not found.', 404);

    if (action === 'cancel') {
      if (['completed','cancelled'].includes(String(campaign.status))) {
        throw new WhatsAppHttpError('This campaign is already finished.', 400);
      }
      const { data: updated, error: updateError } = await db.from('whatsapp_campaigns')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', campaignId).eq('workspace_id', workspaceId)
        .select('id,status,scheduled_at,updated_at').single();
      if (updateError) throw updateError;
      return NextResponse.json({ ok: true, campaign: updated });
    }

    if (action === 'reschedule') {
      if (!['draft','scheduled'].includes(String(campaign.status))) {
        throw new WhatsAppHttpError('Only draft or scheduled campaigns can be rescheduled.', 400);
      }
      const raw = String(body?.scheduledAt || '').trim();
      if (!raw) throw new WhatsAppHttpError('scheduledAt is required.', 400);
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        throw new WhatsAppHttpError('Scheduled time must be in the future.', 400);
      }
      const { data: updated, error: updateError } = await db.from('whatsapp_campaigns')
        .update({ status: 'scheduled', scheduled_at: parsed.toISOString(), updated_at: new Date().toISOString() })
        .eq('id', campaignId).eq('workspace_id', workspaceId)
        .select('id,status,scheduled_at,updated_at').single();
      if (updateError) throw updateError;
      return NextResponse.json({ ok: true, campaign: updated });
    }

    throw new WhatsAppHttpError('Unsupported campaign action.', 400);
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const workspaceId = String(body?.workspaceId || '');
    const name = String(body?.name || '').trim();
    const templateId = String(body?.templateId || '');
    const contactIds = Array.isArray(body?.contactIds) ? body.contactIds.map((v: unknown) => String(v)) : [];
    const templateParameters = Array.isArray(body?.templateParameters) ? body.templateParameters.map((v: unknown) => String(v ?? '').trim()).filter(Boolean) : [];
    const audience = String(body?.audience || (contactIds.length ? 'selected' : 'all')).trim();
    const crmFilters = body?.crmFilters && typeof body.crmFilters === 'object' ? body.crmFilters : {};
    const scheduledAtRaw = body?.scheduledAt ? String(body.scheduledAt).trim() : '';
    let scheduledAt: string | null = null;
    if (scheduledAtRaw) {
      const parsed = new Date(scheduledAtRaw);
      if (Number.isNaN(parsed.getTime())) throw new WhatsAppHttpError('Campaign schedule is not a valid date/time.', 400);
      scheduledAt = parsed.toISOString();
      if (parsed.getTime() <= Date.now()) throw new WhatsAppHttpError('Scheduled time must be in the future.', 400);
    }
    const { db, user } = await requireWhatsAppAccess(request, workspaceId, 'can_create');
    if (!name || !templateId) throw new WhatsAppHttpError('Campaign name and an approved template are required.', 400);
    if (!['all','selected','crm'].includes(audience)) throw new WhatsAppHttpError('Invalid campaign audience.', 400);
    if (audience === 'selected' && !contactIds.length) throw new WhatsAppHttpError('Select at least one contact for a selected audience.', 400);
    if (audience === 'crm' && typeof crmFilters !== 'object') throw new WhatsAppHttpError('CRM audience filters are invalid.', 400);

    const { data: template, error: templateError } = await db.from('whatsapp_templates').select('id,name,language,status,components')
      .eq('workspace_id', workspaceId).eq('id', templateId).maybeSingle();
    if (templateError) throw templateError;
    if (!template) throw new WhatsAppHttpError('Template not found.', 404);
    if (template.status !== 'APPROVED') throw new WhatsAppHttpError('Only an APPROVED WhatsApp template can be used for a campaign.', 400);

    const bodyComponent = Array.isArray(template.components)
      ? template.components.find((component: any) => String(component?.type || '').toUpperCase() === 'BODY')
      : null;
    const bodyText = String(bodyComponent?.text || '');
    const placeholderNumbers = Array.from(bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g))
      .map(match => Number(match[1]))
      .filter(Number.isInteger);
    const requiredParameterCount = placeholderNumbers.length ? Math.max(...placeholderNumbers) : 0;
    if (templateParameters.length !== requiredParameterCount) {
      throw new WhatsAppHttpError(
        requiredParameterCount
          ? `This template requires exactly ${requiredParameterCount} body parameter${requiredParameterCount === 1 ? '' : 's'}.`
          : 'This template does not define body parameters, so template parameters must be empty.',
        400,
      );
    }

    let selectedContacts:any[]=[];
    if(audience==='crm'){
      let crmQuery=db.from('crm_contacts').select('id,name,phone,whatsapp_opt_in,status,lifecycle_stage').eq('workspace_id',workspaceId).eq('status','active');
      if(crmFilters.lifecycle_stage)crmQuery=crmQuery.eq('lifecycle_stage',String(crmFilters.lifecycle_stage));
      if(crmFilters.whatsapp_opt_in_only)crmQuery=crmQuery.eq('whatsapp_opt_in',true);
      const {data:crmContacts,error:crmError}=await crmQuery;
      if(crmError)throw crmError;
      const crmIds=(crmContacts||[]).map((x:any)=>x.id);
      const leadMap=new Map<string,any>();
      if(crmIds.length){
        const {data:leads,error:leadError}=await db.from('crm_leads').select('contact_id,score,stage')
          .eq('workspace_id',workspaceId).in('contact_id',crmIds).order('created_at',{ascending:false});
        if(leadError)throw leadError;
        for(const lead of leads||[])if(!leadMap.has(String(lead.contact_id)))leadMap.set(String(lead.contact_id),lead);
      }
      selectedContacts=(crmContacts||[])
        .map((contact:any)=>({...contact,lead:leadMap.get(String(contact.id))||null}))
        .filter((contact:any)=>{
          if(crmFilters.lead_stage && contact.lead?.stage!==String(crmFilters.lead_stage))return false;
          if(crmFilters.lead_score_min!=null && Number(contact.lead?.score||0)<Number(crmFilters.lead_score_min))return false;
          return Boolean(contact.phone);
        })
        .map((contact:any)=>({id:contact.id,name:contact.name||null,phone:contact.phone}));
    }else{
      let contactQuery=db.from('whatsapp_contacts').select('id,name,phone').eq('workspace_id',workspaceId).eq('active',true).order('name',{ascending:true,nullsFirst:false});
      if(audience==='selected')contactQuery=contactQuery.in('id',contactIds);
      const {data:contacts,error:contactError}=await contactQuery;
      if(contactError)throw contactError;
      selectedContacts=contacts||[];
    }

    const connection = await getActiveConnection(db, workspaceId);
    const { data: campaign, error: campaignError } = await db.from('whatsapp_campaigns').insert({
      workspace_id: workspaceId, connection_id: connection?.id || null, name, template_id: template.id,
      audience_filter: { selection: audience, crm_filters: crmFilters, template_parameters: templateParameters },
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
