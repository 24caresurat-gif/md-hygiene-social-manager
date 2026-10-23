import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, bearerToken, workspaceAccess } from '../../../../../lib/workspace-auth';

const DEFAULT_META_APP_ID = '1578165993688458';
const DEFAULT_META_CONFIG_ID = '1857783405201550';
const META_PAGE_SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_metadata,pages_manage_posts';

export async function POST(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const token = bearerToken(request);
    const body = await request.json().catch(() => ({}));
    const workspaceId = String(body.workspaceId || body.brandId || '').trim();
    if (!workspaceId) return NextResponse.json({ error: 'Select a workspace before connecting Facebook.' }, { status: 400 });

    const appId = process.env.META_APP_ID || DEFAULT_META_APP_ID;
    const configId = process.env.META_CONFIG_ID || DEFAULT_META_CONFIG_ID;
    if (!appId || !configId) return NextResponse.json({ error: 'Meta configuration is missing.' }, { status: 500 });

    const db = adminDb();
    const access = await workspaceAccess(db, user.id, workspaceId);
    const privileged = Boolean(access && (access.globalAdmin || access.isOwner || ['owner', 'admin'].includes(String(access.role || '').toLowerCase())));
    if (!access?.hasAccess || !privileged) {
      return NextResponse.json({ error: 'Only a Workspace Owner or Admin can connect Facebook.' }, { status: 403 });
    }

    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/meta/facebook/callback`;
    const state = crypto.randomUUID();
    const oauth = new URL('https://www.facebook.com/v23.0/dialog/oauth');
    oauth.searchParams.set('client_id', appId);
    oauth.searchParams.set('redirect_uri', redirectUri);
    oauth.searchParams.set('state', state);
    oauth.searchParams.set('config_id', configId);
    oauth.searchParams.set('response_type', 'code');
    oauth.searchParams.set('scope', META_PAGE_SCOPES);
    oauth.searchParams.set('auth_type', 'rerequest');

    const response = NextResponse.json({ url: oauth.toString() });
    const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 600 };
    // The Page-discovery token is temporary to the last OAuth session. Clear it
    // before changing the workspace binding so a cancelled re-connect cannot reuse it.
    response.cookies.set('meta_fb_user_token', '', { ...cookieOptions, maxAge: 0 });
    response.cookies.set('meta_oauth_state', state, cookieOptions);
    response.cookies.set('workspace_brand_id', workspaceId, cookieOptions);
    response.cookies.set('meta_fb_oauth_auth_token', token, cookieOptions);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start Facebook connection.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Start Facebook connection from Settings while signed in.' }, { status: 405 });
}
