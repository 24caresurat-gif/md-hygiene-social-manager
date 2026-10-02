import { NextResponse } from 'next/server';
import { jsonError, requireWhatsAppAccess } from '../../../../lib/whatsapp-server';

export async function GET(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get('workspaceId') || '';
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });

    const { db } = await requireWhatsAppAccess(request, workspaceId);
    const { data: contacts, error } = await db.from('whatsapp_contacts')
      .select('id,name,phone')
      .eq('workspace_id', workspaceId)
      .eq('active', true)
      .order('name', { ascending: true, nullsFirst: false })
      .order('phone', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ contacts: contacts || [] });
  } catch (e) {
    return jsonError(e);
  }
}
