import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type PublishBody = { accountId?: string; message?: string; link?: string };

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  const userAccessToken = authorization?.replace(/^Bearer\s+/i, '');
  if (!userAccessToken) {
    return NextResponse.json({ error: 'Your Social Manager session has expired.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as PublishBody | null;
  const message = body?.message?.trim();
  const accountId = body?.accountId?.trim();
  const link = body?.link?.trim();

  if (!accountId || !message) {
    return NextResponse.json({ error: 'Facebook Page and post message are required.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: 'Supabase configuration is missing.' }, { status: 500 });
  }

  try {
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userAccessToken}` } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(userAccessToken);
    if (userError || !userData.user) throw new Error('Invalid Social Manager session.');

    const { data: account, error: accountError } = await supabase
      .from('social_accounts')
      .select('id,name,platform_account_id,access_token,platform,status')
      .eq('id', accountId)
      .eq('user_id', userData.user.id)
      .eq('platform', 'facebook')
      .single();

    if (accountError || !account) throw new Error('Connected Facebook Page not found.');
    if (account.status !== 'connected' || !account.access_token) throw new Error('Facebook Page connection is not active. Please reconnect it.');

    const params = new URLSearchParams({
      message,
      access_token: account.access_token,
    });
    if (link) params.set('link', link);

    const publishResponse = await fetch(`https://graph.facebook.com/v23.0/${account.platform_account_id}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      cache: 'no-store',
    });

    const result = await publishResponse.json();
    if (!publishResponse.ok || result.error) {
      throw new Error(result.error?.message || 'Facebook rejected the post.');
    }

    return NextResponse.json({
      published: true,
      postId: result.id || null,
      page: account.name,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to publish to Facebook.',
    }, { status: 400 });
  }
}
