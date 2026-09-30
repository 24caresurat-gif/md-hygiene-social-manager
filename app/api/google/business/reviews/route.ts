import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../../lib/workspace-auth';

function intParam(value: string | null, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const url = new URL(request.url);
    const workspaceId = String(url.searchParams.get('workspaceId') || '').trim();
    const rating = intParam(url.searchParams.get('rating'), 0);
    const replyStatus = String(url.searchParams.get('replyStatus') || 'all').trim();
    const profileId = String(url.searchParams.get('profileId') || 'all').trim();
    const query = String(url.searchParams.get('q') || '').trim().toLowerCase();

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });

    const db = adminDb();
    const access = await workspaceAccess(db, user.id, workspaceId);
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });

    let reviewQuery = db
      .from('google_business_reviews')
      .select('id,profile_id,google_review_id,reviewer_name,rating,comment,review_time,reply_text,replied_at,reply_status,review_data,created_at,updated_at')
      .eq('workspace_id', workspaceId)
      .order('review_time', { ascending: false })
      .limit(500);

    if (rating >= 1 && rating <= 5) reviewQuery = reviewQuery.eq('rating', rating);
    if (['not_replied', 'replied'].includes(replyStatus)) reviewQuery = reviewQuery.eq('reply_status', replyStatus);
    if (profileId !== 'all') reviewQuery = reviewQuery.eq('profile_id', profileId);

    const [{ data: reviews, error: reviewsError }, { data: profiles, error: profilesError }, { data: suggestions, error: suggestionsError }] =
      await Promise.all([
        reviewQuery,
        db.from('google_business_profiles').select('id,business_name,location_id').eq('workspace_id', workspaceId).order('business_name'),
        db.from('ai_review_suggestions').select('id,review_id,content,model,created_at').eq('workspace_id', workspaceId).not('review_id', 'is', null).order('created_at', { ascending: false }).limit(500),
      ]);

    if (reviewsError) throw reviewsError;
    if (profilesError) throw profilesError;
    if (suggestionsError) throw suggestionsError;

    const profileMap = new Map((profiles || []).map((p) => [String(p.id), p]));
    const suggestionMap = new Map<string, { id: string; content: string; model: string | null; created_at: string }>();
    for (const s of suggestions || []) {
      const reviewId = String(s.review_id || '');
      if (reviewId && !suggestionMap.has(reviewId)) {
        suggestionMap.set(reviewId, {
          id: String(s.id),
          content: String(s.content || ''),
          model: s.model ? String(s.model) : null,
          created_at: String(s.created_at),
        });
      }
    }

    const filtered = (reviews || []).filter((review) => {
      if (!query) return true;
      const name = String(review.reviewer_name || '').toLowerCase();
      const comment = String(review.comment || '').toLowerCase();
      const business = String(profileMap.get(String(review.profile_id))?.business_name || '').toLowerCase();
      return name.includes(query) || comment.includes(query) || business.includes(query);
    });

    const all = reviews || [];
    const total = all.length;
    const replied = all.filter((r) => r.reply_status === 'replied').length;
    const ratingValues = all.map((r) => Number(r.rating || 0)).filter((n) => n >= 1 && n <= 5);
    const averageRating = ratingValues.length ? Math.round((ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length) * 100) / 100 : null;

    return NextResponse.json({
      workspaceId,
      access: { role: access.role, canManage: access.canManage, globalAdmin: access.globalAdmin },
      profiles: profiles || [],
      reviews: filtered.map((review) => ({
        ...review,
        business_name: profileMap.get(String(review.profile_id))?.business_name || null,
        suggestion: suggestionMap.get(String(review.id)) || null,
      })),
      metrics: {
        total,
        replied,
        needsReply: Math.max(total - replied, 0),
        responseRate: total ? Math.round((replied / total) * 100) : 0,
        averageRating,
        fiveStar: all.filter((r) => Number(r.rating) === 5).length,
        fourStar: all.filter((r) => Number(r.rating) === 4).length,
        threeStar: all.filter((r) => Number(r.rating) === 3).length,
        twoStar: all.filter((r) => Number(r.rating) === 2).length,
        oneStar: all.filter((r) => Number(r.rating) === 1).length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Google reviews.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
