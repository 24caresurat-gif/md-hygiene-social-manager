import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, authorizeImmediatePublishing } from '../../../../../lib/workspace-auth';

type Body = { accountId?: string; caption?: string; mediaUrl?: string; link?: string };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Your Social Manager session has expired.' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Body | null;
  const accountId = body?.accountId?.trim();
  const caption = body?.caption?.trim();
  const mediaUrl = body?.mediaUrl?.trim();
  if (!accountId || !caption || !mediaUrl) return NextResponse.json({ error: 'Instagram account, caption and a public media URL are required.' }, { status: 400 });

  try {
    const user = await authenticatedUser(request);
    const db = adminDb();
    const { data: account, error } = await db.from('social_accounts')
      .select('id,name,platform_account_id,access_token,status,workspace_id,brand_id')
      .eq('id', accountId).eq('platform', 'instagram').maybeSingle();
    if (error) throw error;
    if (!account) return NextResponse.json({ error: 'Connected Instagram account not found.' }, { status: 404 });
    const workspaceId = account.workspace_id || account.brand_id;
    if (!workspaceId) return NextResponse.json({ error: 'Instagram account is not assigned to a workspace.' }, { status: 403 });

    const authorization = await authorizeImmediatePublishing(db, user.id, workspaceId);
    if (!authorization.allowed) return NextResponse.json({ error: authorization.reason || 'Publishing is not permitted.' }, { status: 403 });
    if (account.status !== 'connected' || !account.access_token) return NextResponse.json({ error: 'Instagram connection is not active. Please reconnect it.' }, { status: 400 });

    const base = `https://graph.instagram.com/v23.0/${account.platform_account_id}`;
    const create = await fetch(`${base}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ image_url: mediaUrl, caption, access_token: account.access_token }),
      cache: 'no-store',
    });
    const creation = await create.json();
    if (!create.ok || creation.error || !creation.id) throw new Error(creation.error?.message || 'Instagram media container creation failed.');

    let lastError = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await sleep(3000);
      const publish = await fetch(`${base}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ creation_id: creation.id, access_token: account.access_token }),
        cache: 'no-store',
      });
      const result = await publish.json();
      if (publish.ok && result.id) return NextResponse.json({ published: true, postId: result.id, account: account.name });
      if (result.error?.message) lastError = result.error.message;
    }
    throw new Error(lastError || 'Instagram rejected the post.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to publish to Instagram.';
    const status = /authentication|required|invalid session/i.test(message) ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
