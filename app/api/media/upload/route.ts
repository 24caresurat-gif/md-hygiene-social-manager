import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });
  const form = await request.formData();
  const file = form.get('file');
  const brandId = String(form.get('brandId') || '').trim();
  if (!(file instanceof File) || !brandId) return NextResponse.json({ error: 'Workspace and media file are required.' }, { status: 400 });
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Instagram publishing currently requires an image.' }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'Image must be 20MB or smaller.' }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData.user) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 });
  const { data: brand } = await supabase.from('brands').select('id').eq('id', brandId).eq('user_id', userData.user.id).single();
  if (!brand) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: 'Media storage is not configured on the server.' }, { status: 500 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
  const bucket = 'social-media';
  const { data: bucketInfo } = await admin.storage.getBucket(bucket);
  if (!bucketInfo) {
    const { error } = await admin.storage.createBucket(bucket, { public: true, fileSizeLimit: 20 * 1024 * 1024, allowedMimeTypes: ['image/*'] });
    if (error && !/already exists/i.test(error.message)) return NextResponse.json({ error: `Unable to initialize media storage: ${error.message}` }, { status: 500 });
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${userData.user.id}/${brandId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await admin.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });
  const { data: publicData } = admin.storage.from(bucket).getPublicUrl(path);
  return NextResponse.json({ url: publicData.publicUrl, path, bucket });
}
