import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { authorizeWorkspace } from '@/lib/workspace';
import { userFromRequest } from '@/lib/auth';

export async function GET(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = admin();
  const { data, error } = await db.from('scheduled_posts').select('*').eq('user_id', user.id).order('scheduled_for', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data ?? [] });
}

export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.brandId || !Array.isArray(body.accountIds) || !body.accountIds.length || !body.scheduledFor) return NextResponse.json({ error: 'brandId, accountIds and scheduledFor are required.' }, { status: 400 });
  const when = new Date(body.scheduledFor);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) return NextResponse.json({ error: 'scheduledFor must be a valid future date.' }, { status: 400 });
  const accountIds: string[] = [...new Set((body.accountIds as unknown[]).map(String))];
  const db = admin();
  if (!(await authorizeWorkspace(db, user.id, String(body.brandId), accountIds))) return NextResponse.json({ error: 'Workspace or social account access denied.' }, { status: 403 });
  const { data, error } = await db.from('scheduled_posts').insert({ user_id: user.id, brand_id: body.brandId, account_ids: accountIds, caption: String(body.caption || ''), link: body.link || null, media_url: body.mediaUrl || null, scheduled_for: when.toISOString(), status: body.status === 'draft' ? 'draft' : 'scheduled' }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data }, { status: 201 });
}

export async function DELETE(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const postId = String(body?.id || '');
  if (!postId) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const db = admin();
  const { error } = await db.from('scheduled_posts').delete().eq('id', postId).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
