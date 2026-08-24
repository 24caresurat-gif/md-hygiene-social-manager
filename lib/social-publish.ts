import { createClient } from '@supabase/supabase-js';

export type SocialAccount = {
  id: string;
  user_id: string;
  name: string;
  platform: string;
  platform_account_id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  status: string;
  brand_id: string | null;
};

const GRAPH = 'https://graph.facebook.com/v23.0';

export function serviceDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Validates the bearer token on an admin-only request and confirms the
 * caller has an active admin profile. Returns null when unauthenticated,
 * unauthorized, or inactive so routes can uniformly respond with 403.
 */
export async function requireAdmin(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const anonUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonUrl || !anonKey) return null;
  const client = createClient(anonUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) return null;
  const db = serviceDb();
  const { data: profile } = await db.from('profiles').select('role,active').eq('id', userData.user.id).maybeSingle();
  if (profile?.role !== 'admin' || profile.active === false) return null;
  return { user: userData.user, db };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Publishes a text (and optionally link/photo) post to a Facebook Page.
 * Uses the /photos endpoint when media is present, /feed otherwise.
 */
export async function publishToFacebook(account: SocialAccount, message: string, link: string | null, mediaUrl: string | null) {
  if (!account.access_token) throw new Error(`${account.name}: Facebook connection is not active.`);
  const base = `${GRAPH}/${account.platform_account_id}`;
  let response: Response;
  if (mediaUrl) {
    const form = new FormData();
    form.append('url', mediaUrl);
    form.append('caption', message);
    form.append('published', 'true');
    form.append('access_token', account.access_token);
    if (link) form.append('link', link);
    response = await fetch(`${base}/photos`, { method: 'POST', body: form });
  } else {
    const params = new URLSearchParams({ message, access_token: account.access_token });
    if (link) params.set('link', link);
    response = await fetch(`${base}/feed`, { method: 'POST', body: params });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error?.message || `${account.name}: Facebook rejected the post.`);
  return data.id || data.post_id || null;
}

/**
 * Publishes an image post to Instagram via the two-step container/publish
 * flow, polling media_publish since the container can take a moment to
 * finish processing.
 */
export async function publishToInstagram(account: SocialAccount, message: string, mediaUrl: string | null) {
  if (!account.access_token) throw new Error(`${account.name}: Instagram connection is not active.`);
  if (!mediaUrl) throw new Error(`${account.name}: Instagram requires an image.`);
  const base = `https://graph.instagram.com/v23.0/${account.platform_account_id}`;
  const createResponse = await fetch(`${base}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ image_url: mediaUrl, caption: message, access_token: account.access_token }),
  });
  const created = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok || created.error || !created.id) {
    throw new Error(created.error?.message || `${account.name}: Instagram media creation failed.`);
  }
  let lastError = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(3000);
    const publishResponse = await fetch(`${base}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ creation_id: created.id, access_token: account.access_token }),
    });
    const published = await publishResponse.json().catch(() => ({}));
    if (publishResponse.ok && published.id) return published.id;
    if (published.error?.message) lastError = published.error.message;
  }
  throw new Error(lastError || `${account.name}: Instagram publish failed.`);
}

/**
 * Refreshes a Google Business account's access token when it is missing
 * or expiring within 60s. Returns the (possibly refreshed) access token
 * plus a new expiry when a refresh happened, so callers can persist it.
 */
export async function refreshGoogleToken(account: SocialAccount) {
  if (!account.access_token) throw new Error(`${account.name}: Google Business connection is not active.`);
  const needsRefresh = account.refresh_token && (!account.token_expires_at || new Date(account.token_expires_at).getTime() <= Date.now() + 60_000);
  if (!needsRefresh) return { access_token: account.access_token, expires_at: null as string | null };
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_BUSINESS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token!,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'Google token refresh failed.');
  const expires_at = data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : null;
  return { access_token: String(data.access_token), expires_at };
}

/**
 * Publishes a local post to Google Business Profile. Refreshes the token
 * first when needed; callers should persist the returned token if it was
 * refreshed (see refreshGoogleToken).
 */
export async function publishToGoogleBusiness(account: SocialAccount, message: string, link: string | null, mediaUrl: string | null) {
  const { access_token } = await refreshGoogleToken(account);
  const payload: Record<string, unknown> = { summary: message };
  if (mediaUrl) payload.media = [{ mediaFormat: 'PHOTO', sourceUrl: mediaUrl }];
  if (link) payload.callToAction = { actionType: 'LEARN_MORE', url: link };
  const response = await fetch(`https://mybusiness.googleapis.com/v4/${account.platform_account_id}/localPosts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error?.message || `${account.name}: Google Business rejected the post.`);
  return data.name || data.localPost?.name || null;
}

/**
 * Publishes to whichever platform the account belongs to. Returns null
 * for unsupported platforms so callers can skip them.
 */
export async function publishToAccount(account: SocialAccount, message: string, link: string | null, mediaUrl: string | null) {
  if (account.platform === 'facebook') return publishToFacebook(account, message, link, mediaUrl);
  if (account.platform === 'instagram') return publishToInstagram(account, message, mediaUrl);
  if (account.platform === 'google_business') return publishToGoogleBusiness(account, message, link, mediaUrl);
  return null;
}
