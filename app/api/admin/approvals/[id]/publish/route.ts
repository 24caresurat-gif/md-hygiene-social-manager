import { NextResponse } from 'next/server';
import { requireAdmin, publishToAccount, type SocialAccount } from '@/lib/social-publish';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  const { id } = await params;
  const db = admin.db;
  try {
    const { data: approval, error: ae } = await db.from('post_approvals').select('id,draft_id,workplace_id,submitted_by,status,publish_status').eq('id', id).single();
    if (ae || !approval) return NextResponse.json({ error: 'Approval record not found.' }, { status: 404 });
    if (approval.status !== 'approved') return NextResponse.json({ error: 'Post must be approved before publishing.' }, { status: 400 });
    if (approval.publish_status === 'published') return NextResponse.json({ error: 'This approved post has already been published.' }, { status: 409 });

    const { data: draft, error: de } = await db.from('post_drafts').select('id,user_id,brand_id,message,media_urls,account_ids,approval_status').eq('id', approval.draft_id).single();
    if (de || !draft) return NextResponse.json({ error: 'Post draft not found.' }, { status: 404 });
    if (draft.approval_status !== 'approved') return NextResponse.json({ error: 'Draft approval state is not approved.' }, { status: 400 });

    const ids = Array.isArray(draft.account_ids) ? draft.account_ids.map(String) : [];
    if (!ids.length) return NextResponse.json({ error: 'No social accounts are attached to this approved post.' }, { status: 400 });

    const { data: accounts, error: se } = await db
      .from('social_accounts')
      .select('id,user_id,name,platform,platform_account_id,access_token,refresh_token,token_expires_at,status,brand_id')
      .in('id', ids);
    if (se) throw se;
    if ((accounts || []).length !== ids.length) throw new Error('One or more selected social accounts are no longer connected.');
    if ((accounts || []).some((x: any) => x.brand_id !== draft.brand_id || x.user_id !== draft.user_id || x.status !== 'connected')) {
      throw new Error('Approved post accounts no longer match the approved workspace.');
    }

    const message = String(draft.message || '').trim();
    if (!message) throw new Error('Approved post has no caption.');
    const mediaUrl = Array.isArray(draft.media_urls) && draft.media_urls.length ? String(draft.media_urls[0]) : null;

    const published = [];
    for (const account of accounts as SocialAccount[]) {
      const postId = await publishToAccount(account, message, null, mediaUrl);
      if (postId === null && account.platform !== 'facebook' && account.platform !== 'instagram' && account.platform !== 'google_business') continue;
      await db.from('social_posts').insert({
        user_id: draft.user_id,
        brand_id: draft.brand_id,
        social_account_id: account.id,
        platform: account.platform,
        platform_post_id: postId,
        message,
        media_type: mediaUrl ? 'image' : 'none',
        status: 'published',
        published_at: new Date().toISOString(),
        attempted_at: new Date().toISOString(),
        approval_status: 'approved',
      });
      published.push({ platform: account.platform, account: account.name, postId });
    }

    await db.from('post_approvals').update({ publish_status: 'published', published_at: new Date().toISOString(), publish_error: null }).eq('id', approval.id);
    await db.from('post_drafts').update({ status: 'published' }).eq('id', draft.id);
    return NextResponse.json({ published: true, results: published });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unable to publish approved post.';
    await db.from('post_approvals').update({ publish_status: 'failed', publish_error: msg }).eq('id', id);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
