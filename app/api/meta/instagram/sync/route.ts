import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminDb, workspaceAccess } from '../../../../../lib/workspace-auth';
import { inspectMetaToken } from '../../../../../lib/meta-token';

type FacebookAccount = { id: string; name: string; platform_account_id: string; access_token: string | null; brand_id: string | null; workspace_id: string | null };
type InstagramProfile = { id: string; username?: string; name?: string };

export async function POST(request: Request) {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\\s+/i, '');
  const body = await request.json().catch(() => ({})) as { brandId?: string };
  if (!bearer) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Supabase configuration is missing.' }, { status: 500 });

  try {
    const userClient = createClient(url, key, { global: { headers: { Authorization: `Bearer ${bearer}` } } });
    const { data: user, error: userError } = await userClient.auth.getUser(bearer);
    if (userError || !user.user) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 });

    const workspaceId = String(body.brandId || '').trim();
    if (!workspaceId) return NextResponse.json({ error: 'Select a workspace before connecting Instagram.' }, { status: 400 });
    const db = adminDb();
    const access = await workspaceAccess(db, user.user.id, workspaceId);
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
    if (!(access.globalAdmin || access.isOwner || ['owner', 'admin'].includes(String(access.role || '').toLowerCase()))) {
      return NextResponse.json({ error: 'Only Workspace Owner or Admin can sync connected social accounts.' }, { status: 403 });
    }

    const { data: brand, error: brandError } = await db.from('brands')
      .select('id').eq('workspace_id', workspaceId).limit(1).maybeSingle();
    if (brandError) throw brandError;

    let pageQuery = db.from('social_accounts')
      .select('id,name,platform_account_id,access_token,brand_id,workspace_id')
      .eq('platform', 'facebook').eq('status', 'connected')
      .eq('workspace_id', workspaceId);
    if (brand?.id) {
      pageQuery = db.from('social_accounts')
        .select('id,name,platform_account_id,access_token,brand_id,workspace_id')
        .eq('platform', 'facebook').eq('status', 'connected')
        .or(`workspace_id.eq.${workspaceId},brand_id.eq.${brand.id}`);
    }
    const { data: pages, error: pagesError } = await pageQuery;
    if (pagesError) throw pagesError;

    let connected = 0;
    const skipped: string[] = [];
    for (const page of (pages || []) as FacebookAccount[]) {
      if (!page.access_token) { skipped.push(`${page.name}: missing Page token`); continue; }
      const tokenInfo = await inspectMetaToken(page.access_token);
      const checkedAt = new Date().toISOString();
      const updateHealth = await db.from('social_accounts').update({
        token_expires_at: tokenInfo.expiresAt, token_checked_at: checkedAt,
        token_status: tokenInfo.status, token_error: tokenInfo.error,
      }).eq('id', page.id);
      if (updateHealth.error) throw updateHealth.error;
      if (!tokenInfo.valid) { skipped.push(`${page.name}: Facebook connection needs to be reconnected`); continue; }

      const response = await fetch(`https://graph.facebook.com/v23.0/${page.platform_account_id}?fields=instagram_business_account{id,username,name}&access_token=${encodeURIComponent(page.access_token)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data?.error) { skipped.push(`${page.name}: ${data?.error?.message || 'Instagram lookup failed'}`); continue; }
      const ig = data?.instagram_business_account as InstagramProfile | undefined;
      if (!ig?.id) { skipped.push(`${page.name}: no Instagram Business account linked`); continue; }

      let existingQuery = db.from('social_accounts').select('id')
        .eq('platform', 'instagram').eq('platform_account_id', ig.id)
        .eq('workspace_id', workspaceId);
      if (brand?.id) {
        existingQuery = db.from('social_accounts').select('id')
          .eq('platform', 'instagram').eq('platform_account_id', ig.id)
          .or(`workspace_id.eq.${workspaceId},brand_id.eq.${brand.id}`);
      }
      const { data: existing, error: existingError } = await existingQuery
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (existingError) throw existingError;
      const payload = {
        platform: 'instagram',
        name: ig.name || ig.username || page.name, handle: ig.username || null,
        platform_account_id: ig.id, access_token: page.access_token, status: 'connected',
        brand_id: brand?.id || null, workspace_id: workspaceId, updated_at: checkedAt,
        token_expires_at: tokenInfo.expiresAt, token_checked_at: checkedAt,
        token_last_refreshed_at: checkedAt, token_status: tokenInfo.status, token_error: null,
      };
      const save = existing
        ? await db.from('social_accounts').update(payload).eq('id', existing.id)
        : await db.from('social_accounts').insert({ ...payload, user_id: user.user.id });
      if (save.error) throw save.error;
      connected++;
    }
    return NextResponse.json({ connected, skipped });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sync Instagram accounts.';
    return NextResponse.json({ error: message }, { status: /Invalid session|Authentication/i.test(message) ? 401 : 400 });
  }
}
