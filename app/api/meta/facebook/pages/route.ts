import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const store = await cookies();
  const userToken = store.get('meta_fb_user_token')?.value;

  if (!userToken) {
    return NextResponse.json({ error: 'Facebook session expired. Please reconnect.' }, { status: 401 });
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v23.0/me/accounts?fields=id,name,username&access_token=${encodeURIComponent(userToken)}`,
      { cache: 'no-store' }
    );
    const data = await response.json();
    if (!response.ok || data.error) {
      return NextResponse.json({ error: data.error?.message || 'Unable to load Facebook Pages.' }, { status: 400 });
    }

    return NextResponse.json({
      pages: (data.data || []).map((page: { id: string; name: string; username?: string }) => ({
        id: page.id,
        name: page.name,
        handle: page.username || null,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load Facebook Pages.' }, { status: 500 });
  }
}
