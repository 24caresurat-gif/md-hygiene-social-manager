import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

async function getUser(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data } = await client.auth.getUser(token);
  return data.user || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, brandId, format, prompt, accountIds } = body || {};
    if (!imageUrl || !brandId) return NextResponse.json({ error: 'imageUrl and brandId are required.' }, { status: 400 });

    const user = await getUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const supabase = supabaseAdmin();
    const accounts = Array.isArray(accountIds) ? [...new Set(accountIds.filter(Boolean).map(String))] : [];
    const source = await fetch(String(imageUrl));
    if (!source.ok) return NextResponse.json({ error: 'Generated creative could not be fetched.' }, { status: 400 });
    const blob = await source.blob();
    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
    const path = `${user.id}/creative-studio/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('social-media').upload(path, blob, { contentType: blob.type || `image/${ext}`, upsert: false });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });

    const { data: publicData } = supabase.storage.from('social-media').getPublicUrl(path);
    const mediaUrl = publicData.publicUrl;

    if (!accounts.length) {
      await supabase.storage.from('social-media').remove([path]);
      return NextResponse.json({ error: 'Connect/select at least one social account before saving this creative as a draft.' }, { status: 400 });
    }

    const { data: brand } = await supabase.from('brands').select('id').eq('id', brandId).eq('user_id', user.id).maybeSingle();
    if (!brand) {
      await supabase.storage.from('social-media').remove([path]);
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 403 });
    }

    const { data: socialAccounts, error: accountsError } = await supabase.from('social_accounts').select('id,brand_id').eq('user_id', user.id).in('id', accounts);
    if (accountsError || (socialAccounts || []).length !== accounts.length || (socialAccounts || []).some(a => a.brand_id !== brandId)) {
      await supabase.storage.from('social-media').remove([path]);
      return NextResponse.json({ error: accountsError?.message || 'Selected social accounts do not belong to this workspace.' }, { status: 403 });
    }

    const { data, error } = await supabase.from('scheduled_posts').insert({
      user_id: user.id,
      brand_id: brandId,
      account_ids: accounts,
      caption: prompt || '',
      link: null,
      media_url: mediaUrl,
      scheduled_for: new Date().toISOString(),
      status: 'draft',
    }).select('id').single();

    if (error) {
      await supabase.storage.from('social-media').remove([path]);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, draftId: data.id, mediaUrl, format });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save draft.' }, { status: 500 });
  }
}
