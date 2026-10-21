-- Keep provider credentials server-side. Public-facing clients may read only
-- non-secret connection metadata; only the service_role may read stored tokens.

begin;

-- social_accounts keeps compatibility with existing metadata UI and RLS policy
-- checks, but authenticated users may no longer SELECT provider token columns.
revoke all privileges on table public.social_accounts from anon, public;
revoke select on table public.social_accounts from authenticated;
revoke select (access_token, refresh_token) on table public.social_accounts from anon, authenticated, public;

grant select (
  id, user_id, platform, name, handle, platform_account_id, status,
  created_at, updated_at, token_expires_at, brand_id, token_checked_at,
  token_last_refreshed_at, token_error, token_status, workspace_id
) on table public.social_accounts to authenticated;

-- WhatsApp credentials are already consumed through server-only endpoints and
-- lib/whatsapp-server.ts. No browser role needs table-level direct access.
revoke all privileges on table public.whatsapp_connections from anon, authenticated, public;
revoke select (access_token) on table public.whatsapp_connections from anon, authenticated, public;

commit;
