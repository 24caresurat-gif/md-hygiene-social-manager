import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imageUrl, brandId, format, prompt } = body || {};
    if (!imageUrl || !brandId) return NextResponse.json({ error: 'imageUrl and brandId are required.' }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRole) return NextResponse.json({ error: 'Supabase server configuration is missing.' }, { status: 500 });

    const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const source = await fetch(String(imageUrl));
    if (!source.ok) return NextResponse.json({ error: 'Generated creative could not be fetched.' }, { status: 400 });
    const blob = await source.blob();
    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
    const path = `${user.id}/creative-studio/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('social-media').upload(path, blob, { contentType: blob.type || `image/${ext}`, upsert: false });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });

    const { data: publicData } = supabase.storage.from('social-media').getPublicUrl(path);
    const mediaUrl = publicData.publicUrl;
    const { data, error } = await supabase.from('post_drafts').insert({
      brand_id: brandId,
      user_id: user.id,
      message: prompt || '',
      media_urls: [mediaUrl],
      platforms: [],
      approval_status: 'draft',
      creative_source_url: mediaUrl,
      creative_format: format || null,
      creative_prompt: prompt || null,
    }).select('id').single();

    if (error) {
      await supabase.storage.from('social-media').remove([path]);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, draftId: data.id, mediaUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save draft.' }, { status: 500 });
  }
}
