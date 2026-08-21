import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type PublishBody = { accountId?: string; message?: string; link?: string; mediaType?: 'none' | 'image' | 'video' };
type Account = { id: string; name: string; platform_account_id: string; access_token: string | null; platform: string; status: string; brand_id: string | null };
export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Your Social Manager session has expired.' }, { status: 401 });
  const contentType = request.headers.get('content-type') || ''; let body: PublishBody = {}; let media: File | null = null;
  if (contentType.includes('multipart/form-data')) { const form = await request.formData(); body = { accountId: String(form.get('accountId') || ''), message: String(form.get('message') || ''), link: String(form.get('link') || ''), mediaType: String(form.get('mediaType') || 'none') as PublishBody['mediaType'] }; const file = form.get('media'); media = file instanceof File ? file : null; } else body = (await request.json().catch(() => null)) as PublishBody | null || {};
  const message = body.message?.trim(); const accountId = body.accountId?.trim(); const link = body.link?.trim(); const mediaType = body.mediaType || 'none';
  if (!accountId || !message) return NextResponse.json({ error: 'Facebook Page and post message are required.' }, { status: 400 });
  if (!['none', 'image', 'video'].includes(mediaType)) return NextResponse.json({ error: 'Invalid media type.' }, { status: 400 });
  if (mediaType !== 'none' && !media) return NextResponse.json({ error: `${mediaType} file is required.` }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; if (!url || !anon) return NextResponse.json({ error: 'Supabase configuration is missing.' }, { status: 500 });
  let supabase: ReturnType<typeof createClient<Database>> | null = null; let userId = ''; let account: Account | null = null; const attemptedAt = new Date().toISOString();
  try {
    supabase = createClient<Database>(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } }); const { data: userData, error: userError } = await supabase.auth.getUser(token); if (userError || !userData.user) throw new Error('Invalid Social Manager session.'); userId = userData.user.id;
    const { data: found, error: accountError } = await supabase.from('social_accounts').select('id,name,platform_account_id,access_token,platform,status,brand_id').eq('id', accountId).eq('user_id', userId).eq('platform', 'facebook').single(); if (accountError || !found) throw new Error('Connected Facebook Page not found.'); account = found as Account;
    if (account.status !== 'connected' || !account.access_token) throw new Error('Facebook Page connection is not active. Please reconnect it.');
