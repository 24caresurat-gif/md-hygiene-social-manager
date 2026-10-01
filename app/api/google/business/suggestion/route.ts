import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../../lib/workspace-auth';

function fallback(review: any, keywords: string[]) {
  const name = String(review?.reviewer_name || 'there').split(' ')[0];
  const keyword = keywords[0] || '';
  if (Number(review?.rating || 0) >= 4) {
    return 'Hi ' + name + ', thank you for sharing your experience. We really appreciate your feedback' + (keyword ? ' about ' + keyword : '') + '. We look forward to serving you again soon!';
  }
  return 'Hi ' + name + ', thank you for taking the time to share this feedback. We are sorry your experience did not meet expectations. Your comments are important to us, and we would appreciate the opportunity to understand what happened and make it better.';
}

export async function POST(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const reviewId = String(body.reviewId || '').trim();
    if (!reviewId) return NextResponse.json({ error: 'reviewId is required.' }, { status: 400 });

    const db = adminDb();
    const { data: review, error: reviewError } = await db
      .from('google_business_reviews')
      .select('id,workspace_id,reviewer_name,rating,comment')
      .eq('id', reviewId)
      .maybeSingle();
    if (reviewError) throw reviewError;
    if (!review) return NextResponse.json({ error: 'Review not found.' }, { status: 404 });

    const access = await workspaceAccess(db, user.id, String(review.workspace_id));
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
    if (!access.canManage) return NextResponse.json({ error: 'You do not have permission to generate review suggestions in this workspace.' }, { status: 403 });

    const [{ data: keywordRows, error: keywordError }, { data: settings, error: settingsError }] = await Promise.all([
      db.from('workspace_keywords').select('keyword').eq('workspace_id', review.workspace_id).eq('active', true).limit(30),
      db.from('workspace_review_settings').select('ai_enabled,ai_business_name,ai_business_context,ai_services,ai_tone,ai_signature').eq('workspace_id', review.workspace_id).maybeSingle(),
    ]);
    if (keywordError) throw keywordError;
    if (settingsError) throw settingsError;

    const keywords = (keywordRows || []).map((row) => String(row.keyword || '').trim()).filter(Boolean);
    const business: any = settings || {};
    const businessContext = business.ai_enabled
      ? 'Business name: ' + String(business.ai_business_name || '') + '. Services/focus: ' + String(business.ai_services || '') + '. Verified business context: ' + String(business.ai_business_context || '') + '. Tone: ' + String(business.ai_tone || 'Warm, professional, concise') + '. Preferred sign-off: ' + String(business.ai_signature || '')
      : '';

    const apiKey = process.env.OPENAI_API_KEY;
    let content = '';
    let model = 'template-fallback';

    if (apiKey && business.ai_enabled !== false) {
      const requested = process.env.OPENAI_REVIEW_MODEL || 'gpt-5.6-luna';
      const prompt =
        'Write one concise, warm, professional Google Business Profile reply. Never invent facts, discounts, remedies, policies, or promises. Do not mention AI. Keep it under 450 characters. Reviewer: ' +
        String(review.reviewer_name || 'Customer') +
        '. Rating: ' +
        String(review.rating || 'unknown') +
        '/5. Review: ' +
        String(review.comment || 'Rating only') +
        '. ' +
        businessContext +
        ' Preferred business keywords, only when natural: ' +
        (keywords.join(', ') || 'none') +
        '.';

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: requested,
          input: [
            { role: 'developer', content: 'You draft customer-facing review replies for a business.' },
            { role: 'user', content: prompt },
          ],
          max_output_tokens: 180,
          store: false,
        }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) throw new Error(data?.error?.message || 'AI suggestion generation failed.');
      content = String(data?.output_text || '').trim();
      model = requested;
      const signature = String(business.ai_signature || '').trim();
      if (signature && !content.includes(signature)) content = (content + '\n\n' + signature).trim();
      if (!content) throw new Error('AI returned an empty suggestion.');
    } else {
      content = fallback(review, keywords);
    }

    const saved = await db
      .from('ai_review_suggestions')
      .insert({
        workspace_id: review.workspace_id,
        review_id: review.id,
        suggestion_type: 'reply',
        content,
        model,
        approved: false,
      })
      .select('id,content,model,created_at')
      .single();
    if (saved.error) throw saved.error;

    return NextResponse.json({ ok: true, suggestion: saved.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate review suggestion.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
