import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, authorizeImmediatePublishing } from '../../../../../lib/workspace-auth';

type PublishBody = { accountId?: string; message?: string; link?: string; mediaType?: 'none' | 'image' | 'video' };
type Account = { id: string; name: string; platform_account_id: string; access_token: string | null; platform: string; status: string; workspace_id: string | null; brand_id: string | null };

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Your Social Manager session has expired.' }, { status: 401 });

  try {
    const user = await authenticatedUser(request);
    const contentType = request.headers.get('content-type') || '';
    let body: PublishBody = {};
    let media: File | null = null;
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      body = {
        accountId: String(form.get('accountId') || ''),
        message: String(form.get('message') || ''),
        link: String(form.get('link') || ''),
        mediaType: String(form.get('mediaType') || 'none') as PublishBody['mediaType'],
      };
      const file = form.get('media');
      media = file instanceof File ? file : null;
    } else {
      body = (await request.json().catch(() => null)) as PublishBody | null || {};
    }

    const message = body.message?.trim();
    const accountId = body.accountId?.trim();
    const link = body.link?.trim();
    const mediaType = body.mediaType || 'none';
    if (!accountId || !message) return NextResponse.json({ error: 'Facebook Page and post message are required.' }, { status: 400 });
    if (!['none', 'image', 'video'].includes(mediaType)) return NextResponse.json({ error: 'Invalid media type.' }, { status: 400 });
    if (mediaType !== 'none' && !media) return NextResponse.json({ error: `${mediaType} file is required.` }, { status: 400 });

    const db = adminDb();
    const { data: accountRow, error: accountError } = await db
      .from('social_accounts')
      .select('id,name,platform_account_id,access_token,platform,status,workspace_id,brand_id')
      .eq('id', accountId).eq('platform', 'facebook').maybeSingle();
    if (accountError) throw accountError;
    if (!accountRow) return NextResponse.json({ error: 'Connected Facebook Page not found.' }, { status: 404 });
    const account = accountRow as Account;
    const workspaceId = account.workspace_id || account.brand_id;
    if (!workspaceId) return NextResponse.json({ error: 'Facebook Page is not assigned to a workspace.' }, { status: 403 });

    const authorization = await authorizeImmediatePublishing(db, user.id, workspaceId);
    if (!authorization.allowed) return NextResponse.json({ error: authorization.reason || 'Publishing is not permitted.' }, { status: 403 });
    if (account.status !== 'connected' || !account.access_token) return NextResponse.json({ error: 'Facebook Page connection is not active. Please reconnect it.' }, { status: 400 });

    const pageId = account.platform_account_id;
    const pageToken = account.access_token;
    let endpoint = `https://graph.facebook.com/v23.0/${pageId}/feed`;
    let payload: FormData | URLSearchParams = new URLSearchParams({ message, access_token: pageToken });
    if (mediaType === 'image' && media) {
      endpoint = `https://graph.facebook.com/v23.0/${pageId}/photos`;
      const form = new FormData();
      form.append('source', media, media.name);
      form.append('caption', message);
      form.append('published', 'true');
      form.append('access_token', pageToken);
      if (link) form.append('link', link);
      payload = form;
    } else if (mediaType === 'video' && media) {
      endpoint = `https://graph.facebook.com/v23.0/${pageId}/videos`;
      const form = new FormData();
      form.append('source', media, media.name);
      form.append('description', message);
      form.append('published', 'true');
      form.append('access_token', pageToken);
      payload = form;
    } else if (link) {
      (payload as URLSearchParams).set('link', link);
    }

    const response = await fetch(endpoint, { method: 'POST', body: payload, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error?.message || 'Facebook rejected the post.');
    const postId = result.id || result.post_id || result.video_id || null;
    return NextResponse.json({ published: true, postId, page: account.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to publish to Facebook.';
    const status = /authentication|required|invalid session/i.test(message) ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
