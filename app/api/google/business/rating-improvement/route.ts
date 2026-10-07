import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../../lib/workspace-auth';

export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const workspaceId = String(new URL(request.url).searchParams.get('workspaceId') || '').trim();
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });

    const db = adminDb();
    const access = await workspaceAccess(db, user.id, workspaceId);
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });

    const [{ data: reviews, error: reviewError }, { data: settings, error: settingsError }] = await Promise.all([
      db.from('google_business_reviews').select('rating,comment,reply_status').eq('workspace_id', workspaceId).limit(1000),
      db.from('workspace_review_settings').select('ai_enabled,ai_business_context,ai_services').eq('workspace_id', workspaceId).maybeSingle(),
    ]);
    if (reviewError) throw reviewError;
    if (settingsError) throw settingsError;

    const rows = reviews || [];
    const values = rows.map(r => Number(r.rating || 0)).filter(r => r >= 1 && r <= 5);
    const average = values.length ? values.reduce((a,b) => a + b, 0) / values.length : null;
    const pending = rows.filter(r => r.reply_status !== 'replied').length;
    const low = rows.filter(r => Number(r.rating || 0) <= 2).length;
    const neutral = rows.filter(r => Number(r.rating || 0) === 3).length;

    const suggestions = [
      low ? 'Prioritize a human service-recovery workflow for 1–2 star feedback.' : 'Keep a documented service-recovery workflow ready for future low ratings.',
      pending ? 'Reply consistently to unreplied reviews with specific verified details.' : 'Maintain consistent response coverage for every new review.',
      neutral ? 'Review recurring themes in 3-star feedback to find operational improvements.' : 'Monitor neutral feedback for early signs of customer friction.',
      'Ask customers for honest feedback after completed service moments without incentives or review gating.',
      'Use recurring review themes to choose one or two measurable service improvements each month.',
    ];

    if (!process.env.OPENAI_API_KEY || (settings as any)?.ai_enabled === false) {
      return NextResponse.json({ workspaceId, averageRating: average == null ? null : Math.round(average * 100) / 100, suggestions, model: 'rule-based-fallback' });
    }

    const comments = rows.filter(r => r.comment).slice(0, 80).map(r => String(r.rating || '') + '/5 — ' + String(r.comment)).join('\n').slice(0, 9000);
    const prompt = 'Create 5 prioritized rating-improvement actions. Never suggest fake reviews, review gating, suppression, incentives, or fabricated claims. Focus on operational improvements and ethical feedback collection. Context: ' + String((settings as any)?.ai_business_context || '') + '. Services: ' + String((settings as any)?.ai_services || '') + '.\n' + comments;
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_RATING_MODEL || 'gpt-5-mini', input: prompt, max_output_tokens: 450, store: false }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.error) throw new Error(data?.error?.message || 'AI improvement suggestions failed.');
    const text = String(data?.output_text || '').trim();
    const clean = text.split(/\n+/).map(s => s.replace(/^[-*0-9.\s]+/, '').trim()).filter(Boolean).slice(0, 8);
    return NextResponse.json({ workspaceId, averageRating: average == null ? null : Math.round(average * 100) / 100, suggestions: clean.length ? clean : suggestions, model: process.env.OPENAI_RATING_MODEL || 'gpt-5-mini' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to calculate rating improvement suggestions.';
    return NextResponse.json({ error: message }, { status: /Authentication|session|Unauthorized/i.test(message) ? 401 : 500 });
  }
}
