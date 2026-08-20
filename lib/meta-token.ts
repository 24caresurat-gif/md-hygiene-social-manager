export type MetaTokenStatus = 'unknown' | 'active' | 'expiring' | 'expired' | 'reconnect_required';

export type MetaTokenInfo = {
  valid: boolean;
  expiresAt: string | null;
  status: MetaTokenStatus;
  error: string | null;
};

const EXPIRING_WINDOW_SECONDS = 7 * 24 * 60 * 60;

function appAccessToken() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error('Meta app credentials are not configured.');
  return `${appId}|${appSecret}`;
}

export async function inspectMetaToken(token: string): Promise<MetaTokenInfo> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v23.0/debug_token?${new URLSearchParams({
        input_token: token,
        access_token: appAccessToken(),
      })}`,
      { cache: 'no-store' },
    );
    const payload = await response.json();
    const data = payload?.data;

    if (!response.ok || !data?.is_valid) {
      return {
        valid: false,
        expiresAt: null,
        status: 'reconnect_required',
        error: payload?.error?.message || 'Meta token is invalid or has expired.',
      };
    }

    const candidates = [data.expires_at, data.data_access_expiration_time]
      .filter((value): value is number => typeof value === 'number' && value > 0);
    const expiresSeconds = candidates.length ? Math.min(...candidates) : null;
    const expiresAt = expiresSeconds ? new Date(expiresSeconds * 1000).toISOString() : null;
    const now = Math.floor(Date.now() / 1000);
    const status: MetaTokenStatus = !expiresSeconds
      ? 'active'
      : expiresSeconds <= now
        ? 'expired'
        : expiresSeconds - now <= EXPIRING_WINDOW_SECONDS
          ? 'expiring'
          : 'active';

    return { valid: true, expiresAt, status, error: null };
  } catch (error) {
    return {
      valid: false,
      expiresAt: null,
      status: 'reconnect_required',
      error: error instanceof Error ? error.message : 'Unable to validate Meta token.',
    };
  }
}

export function reconnectRequired(status: MetaTokenStatus) {
  return status === 'expired' || status === 'reconnect_required';
}
