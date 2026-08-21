-- Phase 1: Meta token expiry / reconnect architecture
-- Safe to run multiple times.

alter table public.social_accounts
  add column if not exists token_expires_at timestamptz,
  add column if not exists token_checked_at timestamptz,
  add column if not exists token_last_refreshed_at timestamptz,
  add column if not exists token_status text not null default 'unknown',
  add column if not exists token_error text;

create index if not exists social_accounts_token_status_idx
  on public.social_accounts (token_status, token_expires_at);

create index if not exists social_accounts_reconnect_idx
  on public.social_accounts (user_id, brand_id, platform, token_status);

comment on column public.social_accounts.token_expires_at is 'Earliest known Meta token/data-access expiry. Null means Meta did not provide an expiry.';
comment on column public.social_accounts.token_checked_at is 'Last server-side validation/debug check of the platform token.';
comment on column public.social_accounts.token_last_refreshed_at is 'Last time a fresh OAuth token was stored for this account.';
comment on column public.social_accounts.token_status is 'unknown, active, expiring, expired, or reconnect_required.';
comment on column public.social_accounts.token_error is 'Last non-secret token validation/reconnect error. Never store the token itself.';
