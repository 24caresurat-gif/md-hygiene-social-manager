import { NextResponse } from 'next/server';
import { adminDb } from '../../../lib/workspace-auth';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const standeeId = String(id || '').trim();
    if (!standeeId) return NextResponse.json({ error: 'QR code not found.' }, { status: 404 });
    const db = adminDb();
    const { data: standee, error } = await db.from('qr_standees')
      .select('id,workspace_id,profile_id,form_id,scan_count')
      .eq('id', standeeId).maybeSingle();
    if (error) throw error;
    if (!standee?.profile_id || !standee?.form_id) return NextResponse.json({ error: 'This QR code is unavailable.' }, { status: 404 });

    const [profile, form] = await Promise.all([
      db.from('google_business_profiles').select('id,business_name')
        .eq('id', standee.profile_id).eq('workspace_id', standee.workspace_id).maybeSingle(),
      db.from('feedback_forms').select('id,active')
        .eq('id', standee.form_id).eq('workspace_id', standee.workspace_id).maybeSingle()
    ]);
    if (profile.error) throw profile.error;
    if (form.error) throw form.error;
    if (!profile.data || !form.data?.active) return NextResponse.json({ error: 'The business location or feedback form is no longer active.' }, { status: 410 });

    const token = crypto.randomUUID();
    const created = await db.from('review_requests').insert({
      workspace_id: standee.workspace_id,
      profile_id: standee.profile_id,
      form_id: standee.form_id,
      source: 'qr',
      status: 'sent',
      public_token: token,
      message: 'Please share your experience with ' + profile.data.business_name + '.',
      sent_at: new Date().toISOString()
    });
    if (created.error) throw created.error;

    // A best-effort counter must not block the customer's feedback journey.
    await db.from('qr_standees').update({ scan_count: Number(standee.scan_count || 0) + 1 })
      .eq('id', standee.id).eq('workspace_id', standee.workspace_id);

    return NextResponse.redirect(new URL('/review-request/' + encodeURIComponent(token), request.url), 302);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to open this QR code.' }, { status: 500 });
  }
}
