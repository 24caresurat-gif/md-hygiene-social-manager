import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

type MetaPage = { id: string; name: string; access_token?: string; username?: string };

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  const userAccessToken = authorization?.replace(/^Bearer\s+/i, '');
  const metaUserToken = (await cookies()).get('meta_fb_user_token')?.value;

  if (!userAccessToken || !metaUserToken) {
    return NextResponse.json({ error: 'Your session has expired. Please reconnect Facebook.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { pageId?: string } | null;
  if (!body?.pageId) {
    return NextResponse.json({ error: 'Facebook Page is required.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: 'Supabase configuration is missing.' }, { status: 500 });
  }

  try {
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v23.0/me/accounts?fields=id,name,access_token,username&access_token=${encodeURIComponent(metaUserToken)}`,
      { cache: 'no-store' }
    );
    const pages = await pagesResponse.json();
    if (!pagesResponse.ok || pages.error) {
      throw new Error(pages.error?.message || 'Unable to read Facebook Pages.');
    }

    const page = (pages.data || []).find((item: MetaPage) => item.id === body.pageId) as MetaPage | undefined;
    if (!page) throw new Error('Selected Facebook Page was not found.');
    if (!page.access_token) throw new Error('Facebook did not provide a Page access token.');

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userAccessToken}` } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(userAccessToken);
    if (userError || !userData.user) throw new Error('Supabase login session is invalid.');

    const { error: insertError } = await supabase.from('social_accounts').upsert({
      user_id: userData.user.id,
      platform: 'facebook',
      name: page.name,
      handle: page.username || null,
      platform_account_id: page.id,
      access_token: page.access_token,
      status: 'connected',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform,platform_account_id' });

    if (insertError) throw new Error(insertError.message);

    const response = NextResponse.json({ connected: true, page: { id: page.id, name: page.name, handle: page.username || null } });
    response.cookies.set('meta_fb_user_token', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to connect Facebook Page.' }, { status: 400 });
  }
}
