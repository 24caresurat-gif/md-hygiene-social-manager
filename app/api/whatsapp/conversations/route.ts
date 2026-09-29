import { NextResponse } from 'next/server';
import { jsonError, requireWhatsAppAccess, WhatsAppHttpError } from '../../../../lib/whatsapp-server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId') || '';
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const status = url.searchParams.get('status') || '';
    const { db } = await requireWhatsAppAccess(request, workspaceId);
    let query = db.from('whatsapp_conversations')
      .select('id,phone,contact_id,contact_name,status,unread_count,last_message_preview,last_message_at,last_inbound_at,customer_window_expires_at,assigned_user_id,updated_at')
      .eq('workspace_id', workspaceId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false });
    if (['open','pending','closed'].includes(status)) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    const now = Date.now();
    const rows = (data || []).filter((row: any) => !q || String(row.contact_name || '').toLowerCase().includes(q) || String(row.phone || '').toLowerCase().includes(q));
    return NextResponse.json({ conversations: rows.map((row: any) => ({ ...row, service_window_open: !!row.customer_window_expires_at && new Date(row.customer_window_expires_at).getTime() > now })) });
  } catch (e) { return jsonError(e); }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const workspaceId = String(body?.workspaceId || '');
    const conversationId = String(body?.conversationId || '');
    const action = body?.action === 'read' ? 'can_view' : 'can_edit';
    const { db } = await requireWhatsAppAccess(request, workspaceId, action);
    if (!conversationId) throw new WhatsAppHttpError('conversationId is required.', 400);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body?.action === 'read') patch.unread_count = 0;
    if (['open','pending','closed'].includes(String(body?.status || ''))) patch.status = String(body.status);
    const { data, error } = await db.from('whatsapp_conversations').update(patch).eq('id', conversationId).eq('workspace_id', workspaceId)
      .select('id,phone,contact_name,status,unread_count,last_message_preview,last_message_at,last_inbound_at,customer_window_expires_at,updated_at').single();
    if (error) throw error;
    return NextResponse.json({ conversation: data });
  } catch (e) { return jsonError(e); }
}
