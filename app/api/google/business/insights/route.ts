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

    const [{ data: reviews, error: reviewError }, { data: feedback, error: feedbackError }, { data: settings, error: settingsError }] = await Promise.all([
      db.from('google_business_reviews').select('rating,comment,reply_status,review_time').eq('workspace_id', workspaceId).order('review_time', { ascending: false }).limit(500),
      db.from('feedback_responses').select('rating,sentiment,answers,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(200),
      db.from('workspace_review_settings').select('ai_enabled,ai_business_name,ai_business_context,ai_services,ai_tone').eq('workspace_id', workspaceId).maybeSingle(),
    ]);
    if (reviewError) throw reviewError;
    if (feedbackError) throw feedbackError;
    if (settingsError) throw settingsError;

    const rows = reviews || [];
    const feedbackRows = feedback || [];
    const ratings = rows.map(r => Number(r.rating || 0)).filter(r => r >= 1 && r <= 5);
    const average = ratings.length ? ratings.reduce((a,b) => a + b, 0) / ratings.length : null;
    const needsReply = rows.filter(r => r.reply_status !== 'replied').length;
    const lowRatings = rows.filter(r => Number(r.rating || 0) <= 2).length;
    const positive = rows.filter(r => Number(r.rating || 0) >= 4).length;

    const fallback = [
      'Reviews: ' + rows.length + (average == null ? '' : ' · average ' + average.toFixed(2) + '/5'),
      'Needs reply: ' + needsReply,
      'Positive reviews (4–5★): ' + positive,
      'Low-rating reviews (1–2★): ' + lowRatings,
      'Feedback responses available: ' + feedbackRows.length,
      lowRatings ? 'Priority: review the recurring themes in low-rating comments and assign human follow-up.' : 'Priority: maintain consistent service and continue collecting authentic feedback.',
    ].join('\n');

    if (!process.env.OPENAI_API_KEY || (settings as any)?.ai_enabled === false) {
      return NextResponse.json({ workspaceId, insight: fallback, model: 'rule-based-fallback' });
    }

    const reviewText = rows.filter(r => r.comment).slice(0, 80).map(r => String(r.rating || '') + '/5 — ' + String(r.comment)).join('\n').slice(0, 9000);
    const feedbackText = feedbackRows.slice(0, 40).map(r => String(r.rating || '') + '/5 ' + String(r.sentiment || '') + ' ' + JSON.stringify(r.answers || {})).join('\n').slice(0, 5000);
    const context = 'Business: ' + String((settings as any)?.ai_business_name || '') + '. Services: ' + String((settings as any)?.ai_services || '') + '. Context: ' + String((settings as any)?.ai_business_context || '') + '. Tone: ' + String((settings as any)?.ai_tone || 'Warm, professional, concise');
    const prompt = 'Analyze the imported reputation data. Return 5 concise insights and 5 prioritized actions. Never invent facts and explicitly note that imported data may be incomplete. ' + context + '\nREVIEWS:\n' + reviewText + '\nFEEDBACK:\n' + feedbackText;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_INSIGHTS_MODEL || 'gpt-5-mini', input: prompt, max_output_tokens: 600, store: false }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.error) throw new Error(data?.error?.message || 'AI insights generation failed.');
    const insight = String(data?.output_text || '').trim();
    if (!insight) throw new Error('AI returned an empty insight report.');
    return NextResponse.json({ workspaceId, insight, model: process.env.OPENAI_INSIGHTS_MODEL || 'gpt-5-mini' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate AI business insights.';
    return NextResponse.json({ error: message }, { status: /Authentication|session|Unauthorized/i.test(message) ? 401 : 500 });
  }
}
