import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser } from '../../../../lib/workspace-auth';

const BUCKET = 'social-media';

async function authorizedScope(request: Request) {
  const user = await authenticatedUser(request);
  const brandId = String(new URL(request.url).searchParams.get('brandId') || '').trim();
  if (!brandId) throw new Error('brandId is required.');
  const db = adminDb();
  const { data: brand, error } = await db.from('brands').select('id,user_id').eq('id', brandId).maybeSingle();
  if (error) throw error;
  if (!brand || brand.user_id !== user.id) {
    const err = new Error('Workspace not found or access denied.');
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return { user, brandId, db, prefix: `${user.id}/${brandId}` };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Media library request failed.';
  const status = (error as { status?: number })?.status ||
    (/Authentication required|Invalid session/i.test(message) ? 401 : 500);
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const { db, prefix } = await authorizedScope(request);
    const { data, error } = await db.storage.from(BUCKET).list(prefix, {
      limit: 200,
      sortBy: { column: 'created_at', order: 'desc' },
    });
    if (error) throw error;
    const files = (data || [])
      .filter((item) => item.name && item.id)
      .map((item) => {
        const path = `${prefix}/${item.name}`;
        const { data: publicData } = db.storage.from(BUCKET).getPublicUrl(path);
        return {
          name: item.name,
          path,
          url: publicData.publicUrl,
          createdAt: item.created_at || null,
          metadata: item.metadata || null,
        };
      });
    return NextResponse.json({ files });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { db, prefix } = await authorizedScope(request);
    const body = await request.json().catch(() => null);
    const path = String(body?.path || '');
    if (!path || !path.startsWith(`${prefix}/`) || path.split('/').length !== 3) {
      return NextResponse.json({ error: 'Invalid media path.' }, { status: 400 });
    }
    const { error } = await db.storage.from(BUCKET).remove([path]);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return failure(error);
  }
}
