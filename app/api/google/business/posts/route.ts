import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../../lib/workspace-auth';

function canManage(access: any) {
  return Boolean(access?.canManage);
}

function validStatus(value: string) {
  return ['draft','pending_approval','approved'].includes(value);
}

export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const params = new URL(request.url).searchParams;
    const workspaceId = String(params.get('workspaceId') || '').trim();
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });

    const db = adminDb();
    const access = await workspaceAccess(db, user.id, workspaceId);
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });

    const [{ data: posts, error: postsError }, { data: profiles, error: profilesError }] = await Promise.all([
      db.from('social_posts')
        .select('id,user_id,social_account_id,platform,platform_post_id,message,media_type,status,created_at,updated_at,link,attempted_at,error_message,platform_response,brand_id,scheduled_post_id,approval_status,media_url,workspace_id')
        .eq('workspace_id', workspaceId)
        .eq('platform', 'google_business')
        .order('created_at', { ascending: false })
        .limit(200),
      db.from('google_business_profiles')
        .select('id,business_name,review_url,status')
        .eq('workspace_id', workspaceId)
        .order('business_name'),
    ]);

    if (postsError) throw postsError;
    if (profilesError) throw profilesError;

    return NextResponse.json({
      workspaceId,
      access: { role: access.role, canManage: access.canManage, globalAdmin: access.globalAdmin },
      profiles: profiles || [],
      posts: (posts || []).map((post: any) => ({
        ...post,
        gmb: post.platform_response?.gmb || null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Google posts.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const workspaceId = String(body.workspaceId || '').trim();
    const profileId = String(body.profileId || '').trim();
    const message = String(body.message || '').trim();
    const link = body.link ? String(body.link).trim() : null;
    const mediaUrl = body.mediaUrl ? String(body.mediaUrl).trim() : null;
    const topic = body.topic ? String(body.topic).trim() : 'UPDATE';
    const ctaType = body.ctaType ? String(body.ctaType).trim() : '';
    const ctaUrl = body.ctaUrl ? String(body.ctaUrl).trim() : '';
    const approvalStatus = body.approvalStatus ? String(body.approvalStatus).trim() : 'pending';

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });
    if (!profileId) return NextResponse.json({ error: 'Business Profile location is required.' }, { status: 400 });
    if (!message) return NextResponse.json({ error: 'Post text is required.' }, { status: 400 });
    if (message.length > 1500) return NextResponse.json({ error: 'Google post text must be 1500 characters or less.' }, { status: 400 });
    if (!['UPDATE','EVENT','OFFER'].includes(topic)) return NextResponse.json({ error: 'Invalid post topic.' }, { status: 400 });
    if (ctaType && !['BOOK','ORDER','SHOP','LEARN_MORE','SIGN_UP','CALL'].includes(ctaType)) return NextResponse.json({ error: 'Invalid CTA type.' }, { status: 400 });
    if (approvalStatus && !['pending','approved'].includes(approvalStatus)) return NextResponse.json({ error: 'Invalid approval status.' }, { status: 400 });

    const db = adminDb();
    const access = await workspaceAccess(db, user.id, workspaceId);
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
    if (!canManage(access)) return NextResponse.json({ error: 'Only a workspace manager can manage Google Business posts.' }, { status: 403 });

    const { data: profile, error: profileError } = await db
      .from('google_business_profiles')
      .select('id,workspace_id,social_account_id')
      .eq('id', profileId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ error: 'Business Profile location not found.' }, { status: 404 });

    const now = new Date().toISOString();
    const payload = {
      user_id: user.id,
      social_account_id: profile.social_account_id || null,
      platform: 'google_business',
      message,
      link,
      media_url: mediaUrl,
      media_type: mediaUrl ? 'image' : 'none',
      status: 'draft',
      approval_status: approvalStatus,
      workspace_id: workspaceId,
      brand_id: workspaceId,
      platform_response: {
        gmb: {
          profile_id: profileId,
          topic,
          cta_type: ctaType || null,
          cta_url: ctaUrl || null,
          connection_required_for_publish: true,
        },
      },
      created_at: now,
      updated_at: now,
    };

    const { data: post, error } = await db.from('social_posts').insert(payload).select('id,message,link,media_url,status,approval_status,created_at,updated_at,platform_response').single();
    if (error) throw error;

    return NextResponse.json({ ok: true, post }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create Google Business post.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const postId = String(body.postId || '').trim();
    if (!postId) return NextResponse.json({ error: 'postId is required.' }, { status: 400 });

    const db = adminDb();
    const { data: existing, error: existingError } = await db
      .from('social_posts')
      .select('id,workspace_id,platform,platform_response')
      .eq('id', postId)
      .eq('platform', 'google_business')
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return NextResponse.json({ error: 'Google post not found.' }, { status: 404 });

    const access = await workspaceAccess(db, user.id, String(existing.workspace_id));
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
    if (!canManage(access)) return NextResponse.json({ error: 'Only a workspace manager can edit Google Business posts.' }, { status: 403 });

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.message !== undefined) {
      const message = String(body.message || '').trim();
      if (!message) return NextResponse.json({ error: 'Post text is required.' }, { status: 400 });
      if (message.length > 1500) return NextResponse.json({ error: 'Google post text must be 1500 characters or less.' }, { status: 400 });
      patch.message = message;
    }
    if (body.link !== undefined) patch.link = body.link ? String(body.link).trim() : null;
    if (body.mediaUrl !== undefined) {
      patch.media_url = body.mediaUrl ? String(body.mediaUrl).trim() : null;
      patch.media_type = patch.media_url ? 'image' : 'none';
    }
    if (body.approvalStatus !== undefined) {
      const approvalStatus = String(body.approvalStatus).trim();
      if (!['pending','approved'].includes(approvalStatus)) return NextResponse.json({ error: 'Invalid approval status.' }, { status: 400 });
      patch.approval_status = approvalStatus;
    }

    const gmb = existing.platform_response?.gmb && typeof existing.platform_response.gmb === 'object' ? { ...existing.platform_response.gmb } : {};
    for (const key of ['profile_id','topic','cta_type','cta_url']) {
      if (body[key] !== undefined) gmb[key] = body[key] || null;
    }
    patch.platform_response = { ...(existing.platform_response || {}), gmb };

    const { data: post, error } = await db.from('social_posts').update(patch).eq('id', postId).eq('workspace_id', existing.workspace_id).select('id,message,link,media_url,status,approval_status,updated_at,platform_response').single();
    if (error) throw error;

    return NextResponse.json({ ok: true, post });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update Google Business post.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const postId = String(new URL(request.url).searchParams.get('postId') || '').trim();
    if (!postId) return NextResponse.json({ error: 'postId is required.' }, { status: 400 });

    const db = adminDb();
    const { data: existing, error: existingError } = await db
      .from('social_posts')
      .select('id,workspace_id,platform')
      .eq('id', postId)
      .eq('platform', 'google_business')
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return NextResponse.json({ error: 'Google post not found.' }, { status: 404 });

    const access = await workspaceAccess(db, user.id, String(existing.workspace_id));
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
    if (!canManage(access)) return NextResponse.json({ error: 'Only a workspace manager can delete Google Business posts.' }, { status: 403 });

    const { error } = await db.from('social_posts').delete().eq('id', postId).eq('workspace_id', existing.workspace_id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete Google Business post.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
