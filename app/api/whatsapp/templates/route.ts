import { NextResponse } from 'next/server';
import { getActiveConnection, graphRequest, jsonError, requireWhatsAppAccess, WhatsAppHttpError } from '../../../../lib/whatsapp-server';

export async function GET(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get('workspaceId') || '';
    const { db } = await requireWhatsAppAccess(request, workspaceId);
    const { data, error } = await db.from('whatsapp_templates')
      .select('id,name,language,category,status,provider_template_id,body_preview,components,rejection_reason,created_at,updated_at')
      .eq('workspace_id', workspaceId).order('updated_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ templates: data || [] });
  } catch (e) { return jsonError(e); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const workspaceId = String(body?.workspaceId || '');
    const mode = String(body?.mode || 'sync');
    const { db, user } = await requireWhatsAppAccess(request, workspaceId, 'can_manage');
    const connection = await getActiveConnection(db, workspaceId);
    if (!connection) throw new WhatsAppHttpError('WhatsApp is not connected for this workspace. Open Settings to connect first.', 412);

    if (mode === 'sync') {
      const result = await graphRequest(encodeURIComponent(connection.waba_id) + '/message_templates?fields=id,name,language,status,category,components', connection.access_token);
      const rows = (Array.isArray(result?.data) ? result.data : []).map((item: any) => ({
        workspace_id: workspaceId, connection_id: connection.id,
        provider_template_id: item?.id ? String(item.id) : null,
        name: String(item?.name || ''), language: String(item?.language || ''),
        category: String(item?.category || 'UTILITY').toUpperCase(),
        status: String(item?.status || 'PENDING').toUpperCase(),
        components: Array.isArray(item?.components) ? item.components : [],
        body_preview: Array.isArray(item?.components) ? String((item.components.find((c: any) => String(c?.type).toUpperCase() === 'BODY') || {}).text || '') : '',
        updated_at: new Date().toISOString(),
      })).filter((row: any) => row.name && row.language);
      if (rows.length) {
        const { error } = await db.from('whatsapp_templates').upsert(rows, { onConflict: 'workspace_id,name,language' });
        if (error) throw error;
      }
      return NextResponse.json({ ok: true, synced: rows.length });
    }

    if (mode === 'create') {
      const name = String(body?.name || '').trim();
      const language = String(body?.language || '').trim();
      const category = String(body?.category || 'UTILITY').toUpperCase();
      const templateBody = String(body?.templateBody || '').trim();
      const examples = Array.isArray(body?.exampleParameters) ? body.exampleParameters.map((v: unknown) => String(v ?? '').trim()).filter(Boolean) : [];
      if (!/^[a-z0-9_]{1,512}$/.test(name)) throw new WhatsAppHttpError('Template name must use lowercase letters, numbers and underscores only.', 400);
      if (!language || !templateBody) throw new WhatsAppHttpError('Template name, language and body are required.', 400);
      if (!['MARKETING','UTILITY','AUTHENTICATION'].includes(category)) throw new WhatsAppHttpError('Invalid template category.', 400);

      const component: Record<string, unknown> = { type: 'BODY', text: templateBody };
      if (examples.length) component.example = { body_text: [examples] };
      const components = [component];
      const result = await graphRequest(encodeURIComponent(connection.waba_id) + '/message_templates', connection.access_token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, language, category, components }),
      });
      const status = String(result?.status || 'PENDING').toUpperCase();
      const { data, error } = await db.from('whatsapp_templates').upsert({
        workspace_id: workspaceId, connection_id: connection.id,
        provider_template_id: result?.id ? String(result.id) : null,
        name, language, category, status, components, body_preview: templateBody,
        rejection_reason: null, created_by: user.id, updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id,name,language' }).select('id,name,language,category,status,provider_template_id').single();
      if (error) throw error;
      return NextResponse.json({ ok: true, template: data });
    }

    throw new WhatsAppHttpError('Unsupported template operation.', 400);
  } catch (e) { return jsonError(e); }
}
