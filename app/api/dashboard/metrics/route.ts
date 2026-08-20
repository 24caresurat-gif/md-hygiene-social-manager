import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Account = {
  id: string;
  platform: string;
  name: string;
  handle: string | null;
  platform_account_id: string;
  access_token: string | null;
  status: string;
};

const GRAPH_VERSION = 'v23.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function graph(path: string, token: string) {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`${GRAPH}${path}${separator}access_token=${encodeURIComponent(token)}`, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error?.message || `Meta API request failed (${response.status})`);
  return data;
}

function sumInsightValues(data: any, metric: string) {
  const item = (data?.data || []).find((entry: any) => entry.name === metric);
  return (item?.values || []).reduce((sum: number, value: any) => sum + Number(value?.value || 0), 0);
}

async function facebookMetrics(account: Account) {
  if (!account.access_token) return { followers: null, reach: null, engagement: null, posts: null, postsData: [], warning: 'Facebook token is missing.' };
  try {
    const [insights, posts] = await Promise.all([
      graph(`/${account.platform_account_id}/insights?metric=page_reach,page_post_engagements&period=day&date_preset=last_28_days`, account.access_token),
      graph(`/${account.platform_account_id}/posts?fields=id,message,created_time,permalink_url&limit=10&summary=true`, account.access_token),
    ]);

    let followers: number | null = null;
    try {
      const followerData = await graph(`/${account.platform_account_id}?fields=followers_count`, account.access_token);
      followers = typeof followerData?.followers_count === 'number' ? followerData.followers_count : null;
    } catch { /* permissions can vary by Page */ }

    return {
      followers,
      reach: sumInsightValues(insights, 'page_reach'),
      engagement: sumInsightValues(insights, 'page_post_engagements'),
      posts: typeof posts?.summary?.total_count === 'number' ? posts.summary.total_count : null,
      postsData: (posts?.data || []).map((post: any) => ({
        id: post.id,
        platform: 'Facebook',
        title: post.message || 'Facebook post',
        date: post.created_time,
        url: post.permalink_url || null,
        reach: null,
        engagement: null,
      })),
      warning: null,
    };
  } catch (error) {
    return { followers: null, reach: null, engagement: null, posts: null, postsData: [], warning: error instanceof Error ? error.message : 'Facebook metrics unavailable.' };
  }
}

async function instagramMetrics(account: Account) {
  if (!account.access_token) return { followers: null, reach: null, engagement: null, posts: null, postsData: [], warning: 'Instagram token is missing.' };
  try {
    const profile = await graph(`/${account.platform_account_id}?fields=followers_count,media_count`, account.access_token);
    let reach: number | null = null;
    let engagement: number | null = null;
    try {
      const insights = await graph(`/${account.platform_account_id}/insights?metric=reach,accounts_engaged&period=day&metric_type=total_value&time_range=${encodeURIComponent(JSON.stringify({ since: Math.floor(Date.now() / 1000) - 28 * 86400, until: Math.floor(Date.now() / 1000) }))}`, account.access_token);
      reach = sumInsightValues(insights, 'reach');
      engagement = sumInsightValues(insights, 'accounts_engaged');
    } catch { /* insights permissions vary by account */ }

    const media = await graph(`/${account.platform_account_id}/media?fields=id,caption,media_type,permalink,timestamp,like_count,comments_count&limit=10`, account.access_token);
    return {
      followers: typeof profile?.followers_count === 'number' ? profile.followers_count : null,
      reach,
      engagement,
      posts: typeof profile?.media_count === 'number' ? profile.media_count : null,
      postsData: (media?.data || []).map((post: any) => ({
        id: post.id,
        platform: 'Instagram',
        title: post.caption || 'Instagram post',
        date: post.timestamp,
        url: post.permalink || null,
        reach: null,
        engagement: Number(post.like_count || 0) + Number(post.comments_count || 0),
      })),
      warning: null,
    };
  } catch (error) {
    return { followers: null, reach: null, engagement: null, posts: null, postsData: [], warning: error instanceof Error ? error.message : 'Instagram metrics unavailable.' };
  }
}

export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return NextResponse.json({ error: 'Supabase configuration is missing.' }, { status: 500 });

  try {
    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 });

    const { data: accounts, error: accountsError } = await supabase
      .from('social_accounts')
      .select('id,platform,name,handle,platform_account_id,access_token,status')
      .eq('user_id', userData.user.id)
      .eq('status', 'connected');
    if (accountsError) throw accountsError;

    const connected = (accounts || []) as Account[];
    const results = await Promise.all(connected.map((account) => account.platform === 'instagram' ? instagramMetrics(account) : facebookMetrics(account)));

    const activeResults = results.filter((result) => result);
    const totals = {
      totalPosts: activeResults.reduce((sum, item) => sum + (item.posts || 0), 0),
      reach: activeResults.every((item) => item.reach === null) ? null : activeResults.reduce((sum, item) => sum + (item.reach || 0), 0),
      engagement: activeResults.every((item) => item.engagement === null) ? null : activeResults.reduce((sum, item) => sum + (item.engagement || 0), 0),
      followers: activeResults.every((item) => item.followers === null) ? null : activeResults.reduce((sum, item) => sum + (item.followers || 0), 0),
    };

    const recentPosts = activeResults.flatMap((item) => item.postsData).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
    const warnings = results.map((item) => item.warning).filter(Boolean);

    const { count: trackedPublished } = await supabase
      .from('social_posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userData.user.id)
      .eq('status', 'published');

    return NextResponse.json({
      source: 'meta_graph_api',
      fetchedAt: new Date().toISOString(),
      accounts: connected.map((account) => ({ id: account.id, platform: account.platform, name: account.name, handle: account.handle })),
      stats: { ...totals, trackedPublished: trackedPublished || 0 },
      recentPosts,
      warnings,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load live dashboard metrics.' }, { status: 500 });
  }
}
