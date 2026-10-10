import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isIP } from 'node:net';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server database configuration is missing.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getUser(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return null;
  const client = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user || null;
}

function safeImageUrl(value: string) {
  if (value.startsWith('data:image/png;base64,') || value.startsWith('data:image/jpeg;base64,') || value.startsWith('data:image/webp;base64,')) {
    return { kind: 'data' as const, value };
  }
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Generated image URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Image source must be a generated image data URL or a public HTTPS URL.');
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal' ||
    isIP(hostname) !== 0
  ) {
    throw new Error('Private, local and IP-literal image sources are not allowed.');
  }
  return { kind: 'https' as const, value: url.toString() };
}

async function loadGeneratedImage(value: string) {
  const source = safeImageUrl(value);
  const response = await fetch(source.value, {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Generated creative could not be fetched.');
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) {
    throw new Error('Generated creative must be a PNG, JPEG or WebP image.');
  }
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > 15 * 1024 * 1024) throw new Error('Generated creative is too large (15 MB maximum).');
  const blob = await response.blob();
  if (blob.size === 0 || blob.size > 15 * 1024 * 1024) throw new Error('Generated creative is empty or too large (15 MB maximum).');
  return { blob, contentType };
}

export async function POST(request: NextRequest) {
  let uploadedPath: string | null = null;
  try {
    const body = await request.json().catch(() => null);
    const imageUrl = String(body?.imageUrl || '');
    const brandId = String(body?.brandId || '').trim();
    const format = String(body?.format || '');
    const prompt = String(body?.prompt || '').trim();
    const rawAccountIds = Array.isArray(body?.accountIds) ? body.accountIds.map((id: unknown) => String(id).trim()).filter(Boolean) : [];
    const accounts = [...new Set(rawAccountIds)];

    if (!imageUrl || !brandId) return NextResponse.json({ error: 'imageUrl and brandId are required.' }, { status: 400 });
    if (!accounts.length) return NextResponse.json({ error: 'Select at least one connected social account before saving this creative as a draft.' }, { status: 400 });
    if (accounts.length !== rawAccountIds.length) return NextResponse.json({ error: 'Duplicate social accounts are not allowed.' }, { status: 400 });

    const user = await getUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const supabase = supabaseAdmin();
    const [{ data: profile, error: profileError }, { data: brand, error: brandError }] = await Promise.all([
      supabase.from('profiles').select('role,active').eq('id', user.id).maybeSingle(),
      supabase.from('brands').select('id,user_id').eq('id', brandId).maybeSingle(),
    ]);
    if (profileError) throw profileError;
    if (brandError) throw brandError;
    if (!profile || profile.active === false) return NextResponse.json({ error: 'Your account is inactive.' }, { status: 403 });
    if (!brand) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

    const [{ data: membership, error: membershipError }] = await Promise.all([
      supabase.from('workplace_members').select('role,active').eq('workspace_id', brandId).eq('user_id', user.id).maybeSingle(),
    ]);
    if (membershipError) throw membershipError;

    const globalRole = String(profile.role || '').toLowerCase();
    const isWorkspaceOwner = brand.user_id === user.id;
    const membershipRole = String(membership?.role || '').toLowerCase();
    const hasMembership = membership?.active === true;
    const isPrivileged = ['admin', 'owner'].includes(globalRole) || isWorkspaceOwner || (hasMembership && ['owner', 'admin'].includes(membershipRole));
    if (!isPrivileged && !hasMembership) {
      return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
    }

    if (!isPrivileged) {
      const { data: permission, error: permissionError } = await supabase.from('workspace_member_permissions')
        .select('can_create').eq('workspace_id', brandId).eq('user_id', user.id).eq('module', 'content').maybeSingle();
      if (permissionError) throw permissionError;
      if (permission?.can_create !== true) {
        return NextResponse.json({ error: 'You do not have Create permission for Content.' }, { status: 403 });
      }
    }

    // A connected account belongs to the workspace if either legacy brand_id or
    // the workspace_id column references the selected workspace. The creator of
    // that account need not be the current staff member.
    const { data: socialAccounts, error: accountsError } = await supabase.from('social_accounts')
      .select('id,brand_id,workspace_id,status')
      .in('id', accounts)
      .or(`brand_id.eq.${brandId},workspace_id.eq.${brandId}`)
      .eq('status', 'connected');
    if (accountsError) throw accountsError;
    if ((socialAccounts || []).length !== accounts.length) {
      return NextResponse.json({ error: 'One or more selected social accounts are not connected to this workspace.' }, { status: 403 });
    }

    // Authorize workspace and selected accounts before making a network request or upload.
    const { blob, contentType } = await loadGeneratedImage(imageUrl);
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const path = `${user.id}/creative-studio/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('social-media').upload(path, blob, { contentType, upsert: false });
    if (uploadError) throw uploadError;
    uploadedPath = path;

    const { data: publicData } = supabase.storage.from('social-media').getPublicUrl(path);
    const mediaUrl = publicData.publicUrl;
    const { data, error } = await supabase.from('scheduled_posts').insert({
      user_id: user.id,
      brand_id: brandId,
      workspace_id: brandId,
      account_ids: accounts,
      caption: prompt,
      link: null,
      media_url: mediaUrl,
      scheduled_for: new Date().toISOString(),
      status: 'draft',
      approval_status: 'draft',
    }).select('id').single();

    if (error) throw error;
    return NextResponse.json({ ok: true, draftId: data.id, mediaUrl, format });
  } catch (error) {
    if (uploadedPath) {
      try { await supabaseAdmin().storage.from('social-media').remove([uploadedPath]); } catch { /* preserve the primary error */ }
    }
    const message = error instanceof Error ? error.message : 'Could not save draft.';
    const status = /permission|workspace|account|connected|inactive|private|image source|image URL/i.test(message) ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
