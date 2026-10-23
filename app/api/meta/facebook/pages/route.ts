import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../../lib/workspace-auth';

type Page = { id: string; name: string; username?: string; instagram_business_account?: { id: string; username?: string; name?: string } | null };

export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const workspaceId = String(new URL(request.url).searchParams.get('workspaceId') || '').trim();
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });

    const store = await cookies();
    const userToken = store.get('meta_fb_user_token')?.value;
    const cookieWorkspaceId = store.get('workspace_brand_id')?.value || '';
    if (!userToken) return NextResponse.json({ error: 'Facebook session expired. Please reconnect.' }, { status: 401 });
    if (!cookieWorkspaceId || cookieWorkspaceId !== workspaceId) {
      return NextResponse.json({ error: 'Facebook session belongs to another workspace. Reconnect from Settings.' }, { status: 409 });
    }

    const access = await workspaceAccess(adminDb(), user.id, workspaceId);
    const privileged = Boolean(access && (access.globalAdmin || access.isOwner || ['owner', 'admin'].includes(String(access.role || '').toLowerCase())));
    if (!access?.hasAccess || !privileged) {
      return NextResponse.json({ error: 'Only a Workspace Owner or Admin can view Facebook Pages for this workspace.' }, { status: 403 });
    }

    const response = await fetch(`https://graph.facebook.com/v23.0/me/accounts?fields=id,name,username,instagram_business_account{id,username,name}&access_token=${encodeURIComponent(userToken)}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) return NextResponse.json({ error: data.error?.message || 'Unable to load Facebook Pages.' }, { status: 400 });
    return NextResponse.json({ pages: (data.data || []).map((page: Page) => ({
      id: page.id, name: page.name, handle: page.username || null, instagram_business_account: page.instagram_business_account || null,
    })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Facebook Pages.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
