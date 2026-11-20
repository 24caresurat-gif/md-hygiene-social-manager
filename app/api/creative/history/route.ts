import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server database configuration is missing.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
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
  const { data, error } = await access.db.from('creative_image_history').select('id,image_path,prompt,format,source_type,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items = (data || []).map(item => ({ ...item, url: access.db.storage.from('social-media').getPublicUrl(item.image_path).data.publicUrl }));
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
  const saved = [];
  for (const [index, value] of images.entries()) {
    if (typeof value !== 'string' || value.length > 22 * 1024 * 1024) return NextResponse.json({ error: 'Image data is invalid or too large.' }, { status: 413 });
    const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return NextResponse.json({ error: 'Only PNG, JPEG and WebP image data is accepted.' }, { status: 400 });
    const mime = match[1];
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 15 * 1024 * 1024) return NextResponse.json({ error: 'Each image must be 15MB or smaller.' }, { status: 413 });
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const path = `${access.user.id}/${workspaceId}/ai-history/${crypto.randomUUID()}-${index + 1}.${ext}`;
    const { error: uploadError } = await access.db.storage.from('social-media').upload(path, bytes, { contentType: mime, upsert: false });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });
    const { data, error } = await access.db.from('creative_image_history').insert({ workspace_id: workspaceId, user_id: access.user.id, image_path: path, prompt, format, source_type: sourceType }).select('id,image_path,prompt,format,source_type,created_at').single();
    if (error) {
      await access.db.storage.from('social-media').remove([path]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    saved.push({ ...data, url: access.db.storage.from('social-media').getPublicUrl(path).data.publicUrl });
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
  const { error: removeError } = await access.db.storage.from('social-media').remove([item.image_path]);
  if (removeError) return NextResponse.json({ error: removeError.message }, { status: 500 });
  const { error } = await access.db.from('creative_image_history').delete().eq('id', id).eq('workspace_id', workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
