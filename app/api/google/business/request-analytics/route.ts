import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../../lib/workspace-auth';

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
    const [{ data: requests, error: requestsError }, { data: responses, error: responsesError }, { data: profiles, error: profilesError }] =
      await Promise.all([
        db.from('review_requests')
          .select('id,profile_id,form_id,name,email,phone,source,status,feedback_rating,google_clicked_at,created_at,sent_at')
          .eq('workspace_id', workspaceId)
          .gte('created_at', from)
          .order('created_at', { ascending: true })
          .limit(5000),
        db.from('feedback_responses')
          .select('id,request_id,rating,sentiment,created_at')
          .eq('workspace_id', workspaceId)
          .gte('created_at', from)
          .order('created_at', { ascending: true })
          .limit(5000),
        db.from('google_business_profiles')
          .select('id,business_name')
          .eq('workspace_id', workspaceId)
          .order('business_name'),
      ]);

    if (requestsError) throw requestsError;
    if (responsesError) throw responsesError;
    if (profilesError) throw profilesError;

    const rows = requests || [];
    const responseMap = new Map<string, any>();
    for (const response of responses || []) {
      const id = String(response.request_id || '');
      if (id) responseMap.set(id, response);
    }
    const profileMap = new Map((profiles || []).map(p => [String(p.id), p.business_name]));

    const sent = rows.length;
    const completed = rows.filter(r => String(r.status || '').toLowerCase() === 'completed' || responseMap.has(String(r.id))).length;
    const googleClicked = rows.filter(r => Boolean(r.google_clicked_at)).length;
    const ratingValues = rows.map(r => Number(r.feedback_rating || 0)).filter(n => n >= 1 && n <= 5);
    const responseRatings = (responses || []).map(r => Number(r.rating || 0)).filter(n => n >= 1 && n <= 5);
    const allRatings = responseRatings.length ? responseRatings : ratingValues;
    const averageRating = allRatings.length ? Math.round((allRatings.reduce((a,b)=>a+b,0) / allRatings.length) * 100) / 100 : null;
    const positive = allRatings.filter(n => n >= 4).length;
    const negative = allRatings.filter(n => n <= 2).length;

    const sourceValues = [...new Set(rows.map(r => String(r.source || 'unknown')))];
    const bySource = sourceValues.map(source => {
      const sourceRows = rows.filter(r => String(r.source || 'unknown') === source);
      const sourceCompleted = sourceRows.filter(r => responseMap.has(String(r.id)) || String(r.status || '').toLowerCase() === 'completed').length;
      const sourceClicked = sourceRows.filter(r => Boolean(r.google_clicked_at)).length;
      return {
        source,
        sent: sourceRows.length,
        completed: sourceCompleted,
        clicked: sourceClicked,
        completionRate: sourceRows.length ? Math.round((sourceCompleted / sourceRows.length) * 100) : 0,
        clickRate: sourceRows.length ? Math.round((sourceClicked / sourceRows.length) * 100) : 0,
      };
    }).sort((a,b) => b.sent - a.sent);

    const daily = new Map<string, {sent:number;completed:number;clicked:number}>();
    for (const row of rows) {
      const key = String(row.created_at || '').slice(0,10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      const item = daily.get(key) || {sent:0,completed:0,clicked:0};
      item.sent += 1;
      if (responseMap.has(String(row.id)) || String(row.status || '').toLowerCase() === 'completed') item.completed += 1;
      if (row.google_clicked_at) item.clicked += 1;
      daily.set(key, item);
    }

    const location = (profiles || []).map(profile => {
      const profileRows = rows.filter(r => String(r.profile_id || '') === String(profile.id));
      const profileClicked = profileRows.filter(r => Boolean(r.google_clicked_at)).length;
      const profileCompleted = profileRows.filter(r => responseMap.has(String(r.id)) || String(r.status || '').toLowerCase() === 'completed').length;
      const ratings = profileRows.map(r => Number(r.feedback_rating || 0)).filter(n => n >= 1 && n <= 5);
      return {
        id: profile.id,
        business_name: profile.business_name,
        sent: profileRows.length,
        completed: profileCompleted,
        clicked: profileClicked,
        completionRate: profileRows.length ? Math.round((profileCompleted / profileRows.length) * 100) : 0,
        clickRate: profileRows.length ? Math.round((profileClicked / profileRows.length) * 100) : 0,
        averageRating: ratings.length ? Math.round((ratings.reduce((a,b)=>a+b,0) / ratings.length) * 100) / 100 : null,
      };
    }).filter(x => x.sent > 0);

    return NextResponse.json({
      workspaceId,
      periodDays: days,
      access: { role: access.role, globalAdmin: access.globalAdmin },
      metrics: {
        sent,
        completed,
        pending: Math.max(sent - completed, 0),
        googleClicked,
        completionRate: sent ? Math.round((completed / sent) * 100) : 0,
        clickRate: sent ? Math.round((googleClicked / sent) * 100) : 0,
        averageRating,
        positive,
        negative,
        feedbackResponses: (responses || []).length,
      },
      statusDistribution: ['sent','completed','cancelled'].map(status => ({
        status,
        count: rows.filter(r => String(r.status || '').toLowerCase() === status).length,
      })).concat([{
        status: 'other',
        count: rows.filter(r => !['sent','completed','cancelled'].includes(String(r.status || '').toLowerCase())).length,
      }]),
      bySource,
      daily: [...daily.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([date, value]) => ({ date, ...value })),
      locations: location,
      recent: rows.slice(-10).reverse().map(row => ({
        id: row.id,
        name: row.name,
        source: row.source,
        status: row.status,
        feedback_rating: row.feedback_rating,
        google_clicked_at: row.google_clicked_at,
        created_at: row.created_at,
        business_name: profileMap.get(String(row.profile_id || '')) || null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load review request analytics.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
