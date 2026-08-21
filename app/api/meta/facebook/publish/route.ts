import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type PublishBody = { accountId?: string; message?: string; link?: string; mediaType?: 'none' | 'image' | 'video' };
type Account = { id: string; name: string; platform_account_id: string; access_token: string | null; platform: string; status: string; brand_id: string | null };
type SocialPostInsert = Database['public']['Tables']['social_posts']['Insert'];

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  const userAccessToken = authorization?.replace(/^Bearer\s+/i, '');
  if (!userAccessToken) return NextResponse.json({ error: 'Your Social Manager session has expired.' }, { status: 401 });
  const contentType = request.headers.get('content-type') || '';
  let body: PublishBody = {};
  let media: File | null = null;
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    body = { accountId: String(form.get('accountId') || ''), message: String(form.get('message') || ''), link: String(form.get('link') || ''), mediaType: String(form.get('mediaType') || 'none') as PublishBody['mediaType'] };
    const file = form.get('media');
    media = file instanceof File ? file : null;
  } else body = (await request.json().catch(() => null)) as PublishBody | null || {};
  const message = body.message?.trim();
  const accountId = body.accountId?.trim();
  const link = body.link?.trim();
  const mediaType = body.mediaType || 'none';
  if (!accountId || !message) return NextResponse.json({ error: 'Facebook Page and post message are required.' }, { status: 400 });
  if (!['none', 'image', 'video'].includes(mediaType)) return NextResponse.json({ error: 'Invalid media type.' }, { status: 400 });
  if (mediaType !== 'none' && !media) return NextResponse.json({ error: `${mediaType} file is required.` }, { status: 400 });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return NextResponse.json({ error: 'Supabase configuration is missing.' }, { status: 500 });
  let supabase: SupabaseClient<Database> | null = null;
  let userId = '';
  let account: Account | null = null;
  const attemptedAt = new Date().toISOString();
  try {
    supabase = createClient<Database>(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${userAccessToken}` } } });
    const { data: userData, error: userError } = await supabase.auth.getUser(userAccessToken);
    if (userError || !userData.user) throw new Error('Invalid Social Manager session.');
    userId = userData.user.id;
    const { data: foundAccount, error: accountError } = await supabase.from('social_accounts').select('id,name,platform_account_id,access_token,platform,status,brand_id').eq('id', accountId).eq('user_id', userId).eq('platform', 'facebook').single();
    if (accountError || !foundAccount) throw new Error('Connected Facebook Page not found.');
    account = foundAccount as Account;
    if (account.status !== 'connected' || !account.access_token) throw new Error('Facebook Page connection is not active. Please reconnect it.');
    const pageId = account.platform_account_id;
    const pageToken = account.access_token;
    let endpoint = `https://graph.facebook.com/v23.0/${pageId}/feed`;
    let formData: FormData | URLSearchParams = new URLSearchParams({ message, access_token: pageToken });
    if (mediaType === 'image' && media) {
      endpoint = `https://graph.facebook.com/v23.0/${pageId}/photos`;
      const upload = new FormData();
      upload.append('source', media, media.name); upload.append('caption', message); upload.append('published', 'true'); upload.append('access_token', pageToken); if (link) upload.append('link', link);
      formData = upload;
    } else if (mediaType === 'video' && media) {
      endpoint = `https://graph.facebook.com/v23.0/${pageId}/videos`;
      const upload = new FormData();
      upload.append('source', media, media.name); upload.append('description', message); upload.append('published', 'true'); upload.append('access_token', pageToken);
      formData = upload;
    } else if (link) (formData as URLSearchParams).set('link', link);
    const publishResponse = await fetch(endpoint, { method: 'POST', body: formData, cache: 'no-store' });
    const result = await publishResponse.json();
    if (!publishResponse.ok || result.error) throw new Error(result.error?.message || 'Facebook rejected the post.');
    const postId = result.id || result.post_id || result.video_id || null;
    const trackingPayload: SocialPostInsert = { user_id: userId, brand_id: account.brand_id, social_account_id: account.id, platform: 'facebook', platform_post_id: postId, message, link: link || null, media_type: mediaType, status: 'published', published_at: new Date().toISOString(), attempted_at: attemptedAt, platform_response: result };
    const { error: trackingError } = await supabase.from('social_posts').insert(trackingPayload);
    if (trackingError) console.error('social_posts tracking failed:', trackingError.message);
    return NextResponse.json({ published: true, postId, page: account.name });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unable to publish to Facebook.';
    if (supabase && userId && account) {
      const failedPayload: SocialPostInsert = { user_id: userId, brand_id: account.brand_id, social_account_id: account.id, platform: 'facebook', platform_post_id: null, message: message || '', link: link || null, media_type: mediaType, status: 'failed', attempted_at: attemptedAt, error_message: errorMessage };
      const { error: trackingError } = await supabase.from('social_posts').insert(failedPayload);
      if (trackingError) console.error('failed-post tracking failed:', trackingError.message);
    }
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}
