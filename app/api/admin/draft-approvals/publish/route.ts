import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, publishToAccount, type SocialAccount } from '@/lib/social-publish';

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id || '');
  if (!id) return NextResponse.json({ error: 'Draft id is required.' }, { status: 400 });
  const db = admin.db;
  try {
    const { data: d, error: de } = await db
      .from('scheduled_posts')
      .select('id,user_id,brand_id,caption,link,media_url,account_ids,status,approval_status')
      .eq('id', id)
      .single();
    if (de || !d) return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
    if (d.status !== 'draft' || d.approval_status !== 'approved') return NextResponse.json({ error: 'Draft must be approved before publishing.' }, { status: 400 });

    const ids = Array.isArray(d.account_ids) ? d.account_ids.map(String) : [];
    if (!ids.length) return NextResponse.json({ error: 'No social accounts are attached to this approved draft.' }, { status: 400 });

    const { data: accounts, error: ae } = await db
      .from('social_accounts')
      .select('id,user_id,name,platform,platform_account_id,access_token,refresh_token,token_expires_at,status,brand_id')
      .in('id', ids);
    if (ae) throw ae;
    if ((accounts || []).length !== ids.length) throw new Error('One or more selected social accounts are no longer connected.');
    if ((accounts || []).some((x: any) => x.user_id !== d.user_id || x.brand_id !== d.brand_id || x.status !== 'connected')) {
      throw new Error('Approved post accounts no longer match the approved workspace.');
    }

    const caption = String(d.caption || '').trim();
    if (!caption) throw new Error('Approved draft has no caption.');

    const results = [];
    for (const account of accounts as SocialAccount[]) {
      if (account.platform !== 'facebook' && account.platform !== 'instagram' && account.platform !== 'google_business') continue;
      const postId = await publishToAccount(account, caption, null, d.media_url);
      const { error: pe } = await db.from('social_posts').insert({
        user_id: d.user_id,
        brand_id: d.brand_id,
        social_account_id: account.id,
        platform: account.platform,
        platform_post_id: postId,
        message: caption,
        media_type: d.media_url ? 'image' : 'none',
        status: 'published',
        published_at: new Date().toISOString(),
        attempted_at: new Date().toISOString(),
        approval_status: 'approved',
      });
      if (pe) throw pe;
      results.push({ platform: account.platform, account: account.name, postId });
    }

    await db.from('scheduled_posts').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', id);
    return NextResponse.json({ published: true, results });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unable to publish approved draft.' }, { status: 400 });
  }
}
