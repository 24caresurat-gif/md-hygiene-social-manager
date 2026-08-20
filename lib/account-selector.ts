export type ConnectedAccount = {
  id: string;
  platform: 'facebook' | 'instagram' | 'google_business' | string;
  name: string;
  handle?: string | null;
  status?: string;
};

export const ALL_ACCOUNTS_ID = 'all';

export function accountLabel(account: ConnectedAccount) {
  const platform = account.platform === 'google_business' ? 'Google Business' : account.platform.charAt(0).toUpperCase() + account.platform.slice(1);
  return `${platform} — ${account.handle || account.name}`;
}

export function selectedAccountIds(accounts: ConnectedAccount[], selectedId: string) {
  return selectedId === ALL_ACCOUNTS_ID ? accounts.map((account) => account.id) : accounts.filter((account) => account.id === selectedId).map((account) => account.id);
}
