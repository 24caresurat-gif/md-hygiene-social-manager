import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../../lib/workspace-auth';

type ReviewRow = {
  id: string;
  profile_id: string;
  rating: number | null;
  review_time: string | null;
  reply_status: string;
  comment: string | null;
};

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const params = new URL(request.url).searchParams;
    const workspaceId = String(params.get('workspaceId') || '').trim();
    const daysRaw = Number(params.get('days') || 90);
    const days = Number.isFinite(daysRaw) ? Math.min(365, Math.max(7, Math.trunc(daysRaw))) : 90;

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });

    const db = adminDb();
    const access = await workspaceAccess(db, user.id, workspaceId);
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });

    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: reviews, error: reviewError }, { data: profiles, error: profileError }, { data: connections, error: connectionError }] =
      await Promise.all([
        db.from('google_business_reviews')
          .select('id,profile_id,rating,review_time,reply_status,comment')
          .eq('workspace_id', workspaceId)
          .gte('review_time', from)
          .order('review_time', { ascending: true })
          .limit(5000),
        db.from('google_business_profiles')
          .select('id,business_name,status,updated_at')
          .eq('workspace_id', workspaceId)
          .order('business_name'),
        db.from('google_business_connections')
          .select('id,account_name,token_status,token_error,updated_at')
          .eq('workspace_id', workspaceId)
          .order('updated_at', { ascending: false }),
      ]);

    if (reviewError) throw reviewError;
    if (profileError) throw profileError;
    if (connectionError) throw connectionError;

    const rows = (reviews || []) as ReviewRow[];
    const profileMap = new Map((profiles || []).map((p) => [String(p.id), p]));

    const ratingValues = rows.map((r) => Number(r.rating || 0)).filter((r) => r >= 1 && r <= 5);
    const averageRating = ratingValues.length
      ? Math.round((ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length) * 100) / 100
      : null;
    const replied = rows.filter((r) => r.reply_status === 'replied').length;
    const needsReply = rows.length - replied;
    const negative = rows.filter((r) => Number(r.rating || 0) <= 2).length;
    const positive = rows.filter((r) => Number(r.rating || 0) >= 4).length;

    const daily = new Map<string, { reviews: number; replied: number; ratingSum: number; ratingCount: number }>();
    const monthly = new Map<string, { reviews: number; replied: number; negative: number; ratingSum: number; ratingCount: number }>();

    for (const row of rows) {
      const date = row.review_time ? new Date(row.review_time) : null;
      if (!date || Number.isNaN(date.getTime())) continue;

      const dKey = dayKey(date);
      const d = daily.get(dKey) || { reviews: 0, replied: 0, ratingSum: 0, ratingCount: 0 };
      d.reviews += 1;
      if (row.reply_status === 'replied') d.replied += 1;
      const rating = Number(row.rating || 0);
      if (rating >= 1 && rating <= 5) { d.ratingSum += rating; d.ratingCount += 1; }
      daily.set(dKey, d);

      const mKey = monthKey(date);
      const m = monthly.get(mKey) || { reviews: 0, replied: 0, negative: 0, ratingSum: 0, ratingCount: 0 };
      m.reviews += 1;
      if (row.reply_status === 'replied') m.replied += 1;
      if (rating >= 1 && rating <= 2) m.negative += 1;
      if (rating >= 1 && rating <= 5) { m.ratingSum += rating; m.ratingCount += 1; }
      monthly.set(mKey, m);
    }

    const locationMetrics = (profiles || []).map((profile) => {
      const locationRows = rows.filter((r) => String(r.profile_id) === String(profile.id));
      const values = locationRows.map((r) => Number(r.rating || 0)).filter((r) => r >= 1 && r <= 5);
      const avg = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null;
      const locationReplied = locationRows.filter((r) => r.reply_status === 'replied').length;
      return {
        id: profile.id,
        business_name: profile.business_name,
        status: profile.status,
        reviews: locationRows.length,
        averageRating: avg,
        needsReply: Math.max(locationRows.length - locationReplied, 0),
        negative: locationRows.filter((r) => Number(r.rating || 0) <= 2).length,
      };
    });

    return NextResponse.json({
      workspaceId,
      periodDays: days,
      access: { role: access.role, globalAdmin: access.globalAdmin },
      metrics: {
        reviews: rows.length,
        replied,
        needsReply: Math.max(needsReply, 0),
        responseRate: rows.length ? Math.round((replied / rows.length) * 100) : 0,
        averageRating,
        positive,
        negative,
        locations: (profiles || []).length,
        connections: (connections || []).length,
      },
      ratingDistribution: [1, 2, 3, 4, 5].map((rating) => ({
        rating,
        count: rows.filter((r) => Number(r.rating) === rating).length,
      })),
      daily: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({
        date,
        reviews: value.reviews,
        replied: value.replied,
        averageRating: value.ratingCount ? Math.round((value.ratingSum / value.ratingCount) * 100) / 100 : null,
      })),
      monthly: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({
        month,
        reviews: value.reviews,
        replied: value.replied,
        negative: value.negative,
        averageRating: value.ratingCount ? Math.round((value.ratingSum / value.ratingCount) * 100) / 100 : null,
      })),
      locations: locationMetrics,
      connections: (connections || []).map((connection) => ({
        id: connection.id,
        account_name: connection.account_name,
        token_status: connection.token_status,
        token_error: connection.token_error,
        updated_at: connection.updated_at,
      })),
      topRecentReviews: rows.slice(-8).reverse().map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        review_time: review.review_time,
        reply_status: review.reply_status,
        business_name: profileMap.get(String(review.profile_id))?.business_name || null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Google Business analytics.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
