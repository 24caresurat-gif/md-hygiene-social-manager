import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function db() {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!u || !k) throw new Error('Server database configuration is missing.');
  return createClient(u, k, { auth: { autoRefreshToken: false, persistSession: false } });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notice(message: string, status: number) {
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Feedback</title></head>' +
    '<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f7fbfa;color:#1f2933">' +
    '<div style="max-width:380px;padding:28px;text-align:center"><h1 style="font-size:20px;margin:0 0 10px">Feedback</h1>' +
    '<p style="font-size:14px;line-height:1.6;color:#667085;margin:0">' + message + '</p></div></body></html>';
  return new NextResponse(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// Public QR standee entry point. One permanent QR code points here; every scan
// creates a fresh anonymous review request and sends the customer into the
// existing /review-request/[token] rating-gate flow.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const standeeId = decodeURIComponent(String(id || '')).trim();
    if (!UUID.test(standeeId)) return notice('This QR code is not valid.', 404);

    const s = db();
    const st = await s
      .from('qr_standees')
      .select('id,workspace_id,profile_id,form_id,scan_count')
      .eq('id', standeeId)
      .maybeSingle();
    if (st.error) throw st.error;
    if (!st.data) return notice('This QR code is not valid.', 404);
    const standee: any = st.data;

    // Use the standee's chosen form if it is still active, otherwise fall back
    // to the workspace's oldest active form so a scan never dead-ends.
    let formId: string | null = standee.form_id || null;
    if (formId) {
      const f = await s
        .from('feedback_forms')
        .select('id,active')
        .eq('id', formId)
        .eq('workspace_id', standee.workspace_id)
        .maybeSingle();
      if (f.error) throw f.error;
      const row: any = f.data;
      if (!row || !row.active) formId = null;
    }
    if (!formId) {
      const f = await s
        .from('feedback_forms')
        .select('id')
        .eq('workspace_id', standee.workspace_id)
        .eq('active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (f.error) throw f.error;
      const row: any = f.data;
      formId = row ? String(row.id) : null;
    }
    if (!formId) return notice('Feedback is not available right now. Please try again later.', 409);

    const token = crypto.randomUUID();
    const ins = await s.from('review_requests').insert({
      workspace_id: standee.workspace_id,
      profile_id: standee.profile_id || null,
      form_id: formId,
      source: 'qr',
      status: 'sent',
      public_token: token,
      sent_at: new Date().toISOString(),
    });
    if (ins.error) throw ins.error;

    await s
      .from('qr_standees')
      .update({ scan_count: Number(standee.scan_count || 0) + 1 })
      .eq('id', standee.id);

    return NextResponse.redirect(new URL('/review-request/' + encodeURIComponent(token), request.url), 307);
  } catch {
    return notice('Something went wrong. Please try again.', 500);
  }
}
