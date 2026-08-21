import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function userFromRequest(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user } } = await client.auth.getUser(token);
  return user;
}
async function validateWorkspace(db: ReturnType<typeof admin>, userId: string, brandId: string, accountIds: string[]) {
  const { data: brand } = await db.from('brands').select('id').eq('id', brandId).eq('user_id', userId).maybeSingle();
  if (!brand) return 'Workspace not found.';
  const ids: string[] = [...new Set(accountIds.filter(Boolean))];
  if (!ids.length) return 'At least one social account is required.';
  const { data: accounts, error } = await db.from('social_accounts').select('id,brand_id').eq('user_id', userId).in('id', ids);
  if (error) return error.message;
  if ((accounts || []).length !== ids.length) return 'One or more social accounts are not connected to your account.';
  if ((accounts || []).some(a => a.brand_id !== brandId)) return 'All selected social accounts must belong to the selected workspace.';
  return null;
}

export async function GET(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const brandId = new URL(req.url).searchParams.get('brandId');
  const db = admin();
  let q = db.from('scheduled_posts').select('*').eq('user_id', user.id).order('scheduled_for', { ascending: true });
  if (brandId) q = q.eq('brand_id', brandId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.brandId || !Array.isArray(body.accountIds) || !body.accountIds.length || !body.scheduledFor) return NextResponse.json({ error: 'brandId, accountIds and scheduledFor are required.' }, { status: 400 });
  const accountIds: string[] = body.accountIds.map((id: unknown) => String(id)).filter(Boolean);
  const when = new Date(body.scheduledFor);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) return NextResponse.json({ error: 'scheduledFor must be a valid future date.' }, { status: 400 });
  const db = admin();
  const validationError = await validateWorkspace(db, user.id, String(body.brandId), accountIds);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 403 });
  const { data, error } = await db.from('scheduled_posts').insert({ user_id: user.id, brand_id: body.brandId, account_ids: accountIds, caption: String(body.caption || ''), link: body.link || null, media_url: body.mediaUrl || null, scheduled_for: when.toISOString(), status: body.status === 'draft' ? 'draft' : 'scheduled' }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const { error } = await admin().from('scheduled_posts').delete().eq('id', id).eq('user_id', user.id).in('status', ['draft', 'scheduled', 'failed', 'cancelled']);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
