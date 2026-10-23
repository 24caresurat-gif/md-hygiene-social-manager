import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, bearerToken, workspaceAccess } from '../../../../../lib/workspace-auth';

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || '1327116485900860';
const SCOPES = 'instagram_business_basic,instagram_business_content_publish';

export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const token = bearerToken(request);
    const url = new URL(request.url);
    const workspaceId = String(url.searchParams.get('brandId') || url.searchParams.get('workspaceId') || '').trim();
    if (!workspaceId) {
      return NextResponse.json({ error: 'Select a workspace before connecting Instagram.' }, { status: 400 });
    }

    const db = adminDb();
    const access = await workspaceAccess(db, user.id, workspaceId);
    const privileged = Boolean(access && (access.globalAdmin || access.isOwner || ['owner', 'admin'].includes(String(access.role || '').toLowerCase())));
    if (!access?.hasAccess || !privileged) {
      return NextResponse.json({ error: 'Only a Workspace Owner or Admin can connect Instagram.' }, { status: 403 });
    }

    const state = crypto.randomUUID();
    const redirectUri = `${url.origin}/api/meta/instagram/callback`;
    const oauth = new URL('https://www.instagram.com/oauth/authorize');
    oauth.searchParams.set('client_id', INSTAGRAM_APP_ID);
    oauth.searchParams.set('redirect_uri', redirectUri);
    oauth.searchParams.set('response_type', 'code');
    oauth.searchParams.set('scope', SCOPES);
    oauth.searchParams.set('state', state);

    const response = NextResponse.json({ url: oauth.toString() });
    const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 600 };
    response.cookies.set('instagram_oauth_state', state, cookieOptions);
    response.cookies.set('instagram_brand_id', workspaceId, cookieOptions);
    response.cookies.set('instagram_user_token', token, cookieOptions);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start Instagram connection.';
    const status = /Authentication|required|Invalid session/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
