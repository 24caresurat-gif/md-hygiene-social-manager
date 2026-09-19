export const GOOGLE_BUSINESS_SCOPE = 'https://www.googleapis.com/auth/business.manage';

type Json = Record<string, any>;

export async function googleJson<T = Json>(url: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  headers.set('Accept', 'application/json');
  const response = await fetch(url, { ...init, headers, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const message =
      data?.error?.message ||
      data?.error_description ||
      `Google API request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function exchangeGoogleCode(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams({
    code: args.code,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
    grant_type: 'authorization_code',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error || !data?.access_token) {
    throw new Error(data?.error_description || data?.error?.message || 'Google token exchange failed.');
  }
  return data as { access_token: string; expires_in?: number; refresh_token?: string; scope?: string; token_type?: string };
}

export async function refreshGoogleToken(args: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}) {
  const body = new URLSearchParams({
    refresh_token: args.refreshToken,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error || !data?.access_token) {
    throw new Error(data?.error_description || data?.error?.message || 'Google token refresh failed.');
  }
  return data as { access_token: string; expires_in?: number; scope?: string; token_type?: string };
}

export async function listGoogleAccounts(accessToken: string) {
  const accounts: Json[] = [];
  let pageToken = '';
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await googleJson<{ accounts?: Json[]; nextPageToken?: string }>(
      `https://mybusinessaccountmanagement.googleapis.com/v1/accounts?${params.toString()}`,
      accessToken,
    );
    accounts.push(...(data.accounts || []));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return accounts;
}

export async function listGoogleLocations(accessToken: string, accountName: string) {
  const locations: Json[] = [];
  let pageToken = '';
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({
      pageSize: '100',
      readMask: 'name,title,storefrontAddress,phoneNumbers,websiteUri,metadata,categories,openInfo',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await googleJson<{ locations?: Json[]; nextPageToken?: string }>(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?${params.toString()}`,
      accessToken,
    );
    locations.push(...(data.locations || []));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return locations;
}

export async function listGoogleReviews(accessToken: string, locationName: string) {
  const reviews: Json[] = [];
  let pageToken = '';
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({
      pageSize: '100',
      orderBy: 'updateTime desc',
      ignoreRatingOnlyReviews: 'false',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await googleJson<{ reviews?: Json[]; nextPageToken?: string }>(
      `https://mybusiness.googleapis.com/v4/${locationName}/reviews?${params.toString()}`,
      accessToken,
    );
    reviews.push(...(data.reviews || []));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return reviews;
}

export function formatGoogleAddress(address: any): string | null {
  if (!address) return null;
  const lines = Array.isArray(address.addressLines) ? address.addressLines.filter(Boolean) : [];
  const parts = [
    ...lines,
    address.locality,
    address.administrativeArea,
    address.postalCode,
    address.regionCode,
  ].filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);
  return parts.length ? parts.join(', ') : null;
}

export function ratingToNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5) return value;
  const raw = String(value || '').trim().toUpperCase();
  if (/^[1-5]$/.test(raw)) return Number(raw);
  const map: Record<string, number> = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
  };
  return map[raw] || null;
}

export function locationReviewUrl(location: any): string | null {
  return (
    location?.metadata?.newReviewUrl ||
    location?.metadata?.newReviewUri ||
    location?.metadata?.mapsUrl ||
    location?.metadata?.mapsUri ||
    null
  );
}
