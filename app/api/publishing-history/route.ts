import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.replace(/^Bearer\s+/i, '');
  if (!accessToken) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const url = new URL(request.url);
  const brandId = url.searchParams.get('brandId')?.trim() || '';
  const platform = url.searchParams.get('platform')?.trim() || 'all';
  const status = url.searchParams.get('status')?.trim() || 'all';
  const q = url.searchParams.get('q')?.trim() || '';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 25), 1), 100);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return NextResponse.json({ error: 'Supabase configuration is missing.' }, { status: 500 });

  const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${accessToken}` } } });
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 });

  let query = supabase.from('social_posts').select('id,social_account_id,platform,platform_post_id,message,media_type,status,published_at,created_at,updated_at,brand_id,link,media_url,error_message,attempted_at', { count: 'exact' }).eq('user_id', userData.user.id).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (brandId) query = query.eq('brand_id', brandId);
  if (platform !== 'all') query = query.eq('platform', platform);
  if (status !== 'all') query = query.eq('status', status);
  if (q) query = query.ilike('message', `%${q}%`);

  const { data: posts, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const accountIds = [...new Set((posts || []).map((p) => p.social_account_id).filter(Boolean))];
  let accountMap = new Map<string, { name: string; handle: string | null; status: string }>();
  if (accountIds.length) {
    const { data: accounts } = await supabase.from('social_accounts').select('id,name,handle,status').in('id', accountIds).eq('user_id', userData.user.id);
    accountMap = new Map((accounts || []).map((a) => [a.id, a]));
  }

  const items = (posts || []).map((post) => ({ ...post, account: accountMap.get(post.social_account_id) || null }));
  const stats = { total: count || 0, published: 0, failed: 0, scheduled: 0, other: 0 };
  for (const item of items) {
    if (item.status === 'published') stats.published++;
    else if (item.status === 'failed') stats.failed++;
    else if (item.status === 'scheduled') stats.scheduled++;
    else stats.other++;
  }

  return NextResponse.json({ items, count: count || 0, limit, offset, stats });
}
