import { NextResponse } from 'next/server';
import { requireAdmin, publishToAccount, type SocialAccount } from '@/lib/social-publish';

type AdminSession = NonNullable<Awaited<ReturnType<typeof requireAdmin>>>;

async function log(db: AdminSession['db'], id: string, actor: string, action: string, note: string | null, metadata: any = {}) {
  const { error } = await db.from('scheduled_post_activity_log').insert({ scheduled_post_id: id, actor_user_id: actor, action, note, metadata });
  if (error) console.error('activity log failed', error.message);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  const { id } = await params;
  const db = admin.db;
  try {
    const { data: d, error: de } = await db
      .from('scheduled_posts')
      .select('id,user_id,brand_id,account_ids,caption,link,media_url,status,approval_status,publish_status')
      .eq('id', id)
      .single();
    if (de || !d) return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
    if (d.status !== 'draft' || d.approval_status !== 'approved') return NextResponse.json({ error: 'Draft must be approved before publishing.' }, { status: 400 });
    if (d.publish_status === 'published') return NextResponse.json({ error: 'Draft is already published.' }, { status: 409 });

    const ids = Array.isArray(d.account_ids) ? d.account_ids.map(String) : [];
    if (!ids.length) return NextResponse.json({ error: 'No social accounts attached.' }, { status: 400 });

    const { data: accounts, error: ae } = await db
      .from('social_accounts')
      .select('id,user_id,name,platform,platform_account_id,access_token,refresh_token,token_expires_at,status,brand_id')
      .in('id', ids);
    if (ae) throw ae;
    if ((accounts || []).length !== ids.length) throw new Error('One or more selected accounts are no longer connected.');
    if ((accounts || []).some((x: any) => x.user_id !== d.user_id || x.brand_id !== d.brand_id || x.status !== 'connected')) {
      throw new Error('Selected accounts no longer match the approved workspace.');
    }

    const msg = String(d.caption || '').trim();
    if (!msg) throw new Error('Approved draft has no caption.');

    const results = [];
    for (const acct of accounts as SocialAccount[]) {
      // This route only supports Facebook/Instagram, matching the original behavior.
      if (acct.platform !== 'facebook' && acct.platform !== 'instagram') continue;
      const postId = await publishToAccount(acct, msg, d.link || d.media_url || null, d.media_url);
      const { error: pe } = await db.from('social_posts').insert({
        user_id: d.user_id,
        brand_id: d.brand_id,
        social_account_id: acct.id,
        platform: acct.platform,
        platform_post_id: postId,
        message: msg,
        media_type: d.media_url ? 'image' : 'none',
        status: 'published',
        published_at: new Date().toISOString(),
        attempted_at: new Date().toISOString(),
        approval_status: 'approved',
      });
      if (pe) throw pe;
      results.push({ platform: acct.platform, account: acct.name, postId });
    }
    if (!results.length) throw new Error('No supported connected social account found.');

    const { error: ue } = await db.from('scheduled_posts').update({ status: 'published', publish_status: 'published', published_at: new Date().toISOString(), publish_error: null }).eq('id', d.id);
    if (ue) throw ue;
    await log(db, d.id, admin.user.id, 'published', null, { results });
    return NextResponse.json({ published: true, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unable to publish approved draft.';
    await db.from('scheduled_posts').update({ publish_status: 'failed', publish_error: msg }).eq('id', id);
    await log(db, id, admin.user.id, 'publish_failed', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
