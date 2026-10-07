import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../../lib/workspace-auth';

export async function POST(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const workspaceId = String(body.workspaceId || '').trim();
    const profileId = String(body.profileId || '').trim();
    const topic = String(body.topic || 'UPDATE').trim().toUpperCase();
    const seed = String(body.seed || '').trim();
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });
    if (!seed) return NextResponse.json({ error: 'Add a short direction for the AI writer.' }, { status: 400 });

    const db = adminDb();
    const access = await workspaceAccess(db, user.id, workspaceId);
    if (!access?.hasAccess || !access.canManage) return NextResponse.json({ error: 'You do not have permission to generate Google post content.' }, { status: 403 });

    const [{ data: profile }, { data: settings }] = await Promise.all([
      profileId ? db.from('google_business_profiles').select('id,business_name,category').eq('workspace_id', workspaceId).eq('id', profileId).maybeSingle() : Promise.resolve({ data: null }),
      db.from('workspace_review_settings').select('ai_enabled,ai_business_name,ai_business_context,ai_services,ai_tone').eq('workspace_id', workspaceId).maybeSingle(),
    ]);
    const business = String((settings as any)?.ai_business_name || profile?.business_name || 'the business');
    const fallback = seed + '. Learn more from the business and check current details before visiting.';

    if (!process.env.OPENAI_API_KEY || (settings as any)?.ai_enabled === false) {
      return NextResponse.json({ ok: true, content: fallback, model: 'template-fallback' });
    }

    const context = 'Business: ' + business + '. Category: ' + String(profile?.category || '') + '. Services: ' + String((settings as any)?.ai_services || '') + '. Context: ' + String((settings as any)?.ai_business_context || '') + '. Tone: ' + String((settings as any)?.ai_tone || 'Warm, professional, concise');
    const prompt = 'Write one concise Google Business Profile post under 700 characters. Topic: ' + topic + '. Direction: ' + seed + '. ' + context + ' Never invent prices, dates, URLs, certifications, opening hours, discounts or offers. Return only the post text.';
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_GMB_POST_MODEL || 'gpt-5-mini', input: prompt, max_output_tokens: 260, store: false }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.error) throw new Error(data?.error?.message || 'AI post generation failed.');
    const content = String(data?.output_text || '').trim();
    if (!content) throw new Error('AI returned an empty post.');
    return NextResponse.json({ ok: true, content, model: process.env.OPENAI_GMB_POST_MODEL || 'gpt-5-mini' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate Google Business post.';
    return NextResponse.json({ error: message }, { status: /Authentication|session|Unauthorized/i.test(message) ? 401 : 500 });
  }
}
