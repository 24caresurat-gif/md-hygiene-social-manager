import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const HISTORY_BUCKET = 'creative-history';

function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server database configuration is missing.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function ensureHistoryBucket(db: ReturnType<typeof adminDb>) {
  const { data: existing } = await db.storage.getBucket(HISTORY_BUCKET);
  if (existing) return null;
  const { error: createError } = await db.storage.createBucket(HISTORY_BUCKET, {
    public: false,
    fileSizeLimit: 15 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });
  if (!createError) return null;
  // A concurrent request may have created the bucket after the first lookup.
  const { data: createdByAnotherRequest } = await db.storage.getBucket(HISTORY_BUCKET);
  return createdByAnotherRequest ? null : createError.message;
}

async function authorize(request: Request, workspaceId: string, permissionColumn: 'can_view' | 'can_create' | 'can_edit' = 'can_view') {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return { error: 'Authentication required.', status: 401 as const };
  const auth = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: authData } = await auth.auth.getUser(token);
  if (!authData.user) return { error: 'Invalid session.', status: 401 as const };
  const db = adminDb();
  const [{ data: profile, error: profileError }, { data: workspace, error: workspaceError }, { data: membership, error: membershipError }] = await Promise.all([
    db.from('profiles').select('role,active').eq('id', authData.user.id).maybeSingle(),
    db.from('brands').select('id,user_id').eq('id', workspaceId).maybeSingle(),
    db.from('workplace_members').select('role,active').eq('workspace_id', workspaceId).eq('user_id', authData.user.id).maybeSingle(),
  ]);
  if (profileError || workspaceError || membershipError) return { error: 'Unable to verify workspace access.', status: 500 as const };
  if (!profile || profile.active === false) return { error: 'Your account is inactive.', status: 403 as const };
  if (!workspace) return { error: 'Workspace not found.', status: 404 as const };
  const role = String(profile.role || '').toLowerCase();
  const memberRole = String(membership?.role || '').toLowerCase();
  const privileged = ['admin','owner'].includes(role) || workspace.user_id === authData.user.id || (membership?.active === true && ['admin','owner'].includes(memberRole));
  if (!privileged && membership?.active !== true) return { error: 'You do not have access to this workspace.', status: 403 as const };
  if (!privileged) {
    const { data: permission, error } = await db.from('workspace_member_permissions').select('can_view,can_create,can_edit').eq('workspace_id', workspaceId).eq('user_id', authData.user.id).eq('module', 'content').maybeSingle();
    if (error) return { error: 'Unable to verify content permissions.', status: 500 as const };
    if (permission?.[permissionColumn] !== true) return { error: 'You do not have the required Content permission.', status: 403 as const };
  }
  return { user: authData.user, db };
}

export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId') || '';
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });
  const access = await authorize(request, workspaceId);
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const bucketError = await ensureHistoryBucket(access.db);
  if (bucketError) return NextResponse.json({ error: 'Private image storage is unavailable.' }, { status: 503 });
  const { data, error } = await access.db.from('creative_image_history').select('id,image_path,prompt,format,source_type,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const storage = access.db.storage.from(HISTORY_BUCKET);
  const items = await Promise.all((data || []).map(async item => {
    const { data: signed, error: signedError } = await storage.createSignedUrl(item.image_path, 60 * 60);
    if (signedError || !signed?.signedUrl) throw new Error('Could not create a secure image link.');
    return { ...item, url: signed.signedUrl };
  }).map(promise => promise.catch(() => null)));
  if (items.some(item => !item)) return NextResponse.json({ error: 'Could not load secure image previews.' }, { status: 500 });
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const workspaceId = String(body?.workspaceId || '');
  const images = Array.isArray(body?.images) ? body.images.slice(0, 2) : [];
  const prompt = String(body?.prompt || '').slice(0, 4000);
  const format = String(body?.format || '1:1');
  const sourceType = body?.sourceType === 'edited' ? 'edited' : 'generated';
  if (!workspaceId || !images.length) return NextResponse.json({ error: 'Workspace and generated images are required.' }, { status: 400 });
  if (!['9:16','4:5','1:1','16:9'].includes(format)) return NextResponse.json({ error: 'Unsupported image format.' }, { status: 400 });
  const access = await authorize(request, workspaceId, 'can_create');
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const bucketError = await ensureHistoryBucket(access.db);
  if (bucketError) return NextResponse.json({ error: 'Private image storage is unavailable.' }, { status: 503 });
  const storage = access.db.storage.from(HISTORY_BUCKET);
  const saved = [];
  for (const [index, value] of images.entries()) {
    if (typeof value !== 'string' || value.length > 22 * 1024 * 1024) return NextResponse.json({ error: 'Image data is invalid or too large.' }, { status: 413 });
    const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return NextResponse.json({ error: 'Only PNG, JPEG and WebP image data is accepted.' }, { status: 400 });
    const mime = match[1];
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 15 * 1024 * 1024) return NextResponse.json({ error: 'Each image must be 15MB or smaller.' }, { status: 413 });
    const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isWebp = bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if ((mime === 'image/png' && !isPng) || (mime === 'image/jpeg' && !isJpeg) || (mime === 'image/webp' && !isWebp)) {
      return NextResponse.json({ error: 'Image content does not match its declared file type.' }, { status: 400 });
    }
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const path = `${access.user.id}/${workspaceId}/ai-history/${crypto.randomUUID()}-${index + 1}.${ext}`;
    const { error: uploadError } = await storage.upload(path, bytes, { contentType: mime, upsert: false });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });
    const { data, error } = await access.db.from('creative_image_history').insert({ workspace_id: workspaceId, user_id: access.user.id, image_path: path, prompt, format, source_type: sourceType }).select('id,image_path,prompt,format,source_type,created_at').single();
    if (error) {
      await storage.remove([path]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    saved.push({ ...data, url: (await storage.createSignedUrl(path, 60 * 60)).data?.signedUrl || '' });
  }
  return NextResponse.json({ items: saved });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const workspaceId = String(body?.workspaceId || '');
  const id = String(body?.id || '');
  if (!workspaceId || !id) return NextResponse.json({ error: 'Workspace and image id are required.' }, { status: 400 });
  const access = await authorize(request, workspaceId, 'can_edit');
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { data: item, error: findError } = await access.db.from('creative_image_history').select('id,image_path').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
  const { error } = await access.db.from('creative_image_history').delete().eq('id', id).eq('workspace_id', workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { error: removeError } = await access.db.storage.from(HISTORY_BUCKET).remove([item.image_path]);
  if (removeError) {
    console.error('creative image history storage cleanup failed', { historyId: id, error: removeError.message });
    return NextResponse.json({ ok: true, warning: 'History entry deleted; stored image cleanup is pending.' });
  }
  return NextResponse.json({ ok: true });
}
