import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Body = { accountId?: string; caption?: string; mediaUrl?: string; link?: string };

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Your Social Manager session has expired.' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Body | null;
  const accountId = body?.accountId?.trim(); const caption = body?.caption?.trim(); const mediaUrl = body?.mediaUrl?.trim();
  if (!accountId || !caption || !mediaUrl) return NextResponse.json({ error: 'Instagram account, caption and a public media URL are required.' }, { status: 400 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } });
  try {
    const { data: userData } = await supabase.auth.getUser(token); if (!userData.user) throw new Error('Invalid Social Manager session.');
    const { data: account, error } = await supabase.from('social_accounts').select('id,name,platform_account_id,access_token,status').eq('id', accountId).eq('user_id', userData.user.id).eq('platform','instagram').single();
    if (error || !account) throw new Error('Connected Instagram account not found.');
    if (account.status !== 'connected' || !account.access_token) throw new Error('Instagram connection is not active.');
    const base = `https://graph.facebook.com/v23.0/${account.platform_account_id}`;
    const create = await fetch(`${base}/media`, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({ image_url:mediaUrl, caption, access_token:account.access_token }) });
    const creation = await create.json(); if (!create.ok || creation.error || !creation.id) throw new Error(creation.error?.message || 'Instagram media container creation failed.');
    const publish = await fetch(`${base}/media_publish`, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({ creation_id:creation.id, access_token:account.access_token }) });
    const result = await publish.json(); if (!publish.ok || result.error || !result.id) throw new Error(result.error?.message || 'Instagram rejected the post.');
    await supabase.from('social_posts').insert({ user_id:userData.user.id, social_account_id:account.id, platform:'instagram', platform_post_id:result.id, message:caption, media_type:'image', status:'published', published_at:new Date().toISOString() });
    return NextResponse.json({ published:true, postId:result.id, account:account.name });
  } catch (error) { return NextResponse.json({ error:error instanceof Error ? error.message : 'Unable to publish to Instagram.' }, { status:400 }); }
}
