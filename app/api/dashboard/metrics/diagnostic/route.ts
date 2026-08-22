import { NextResponse } from 'next/server';

const GRAPH_VERSION = 'v23.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const url = new URL(request.url);
  const accountId = url.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });

  const tests = [
    ['profile', `/${accountId}?fields=id,name,followers_count,media_count`],
    ['posts', `/${accountId}/posts?fields=id,created_time&limit=1&summary=true`],
    ['page_insights', `/${accountId}/insights?metric=page_reach,page_post_engagements&period=day&date_preset=last_28_days`],
    ['instagram_insights', `/${accountId}/insights?metric=reach,accounts_engaged&period=day&metric_type=total_value`],
  ];

  const results = await Promise.all(tests.map(async ([name, path]) => {
    try {
      const response = await fetch(`${GRAPH}${path}&access_token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      return { name, ok: response.ok && !data?.error, status: response.status, data: response.ok ? data : { error: data?.error || data } };
    } catch (error) {
      return { name, ok: false, status: 0, data: { error: error instanceof Error ? error.message : 'Request failed.' } };
    }
  }));

  return NextResponse.json({ graphVersion: GRAPH_VERSION, accountId, tests: results });
}
