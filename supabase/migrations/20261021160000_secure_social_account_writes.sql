-- Provider credentials are read/written only by trusted server-side routes.
-- Authenticated users retain their existing column-level metadata SELECT grants,
-- but can no longer insert/update/delete account rows or use table-level DDL-like
-- privileges that bypass row-level security.
revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.social_accounts from anon, authenticated;

-- Explicitly deny credential-column permissions as defense in depth. This also
-- removes any future column-specific grants that could outlive table grants.
revoke select (access_token, refresh_token),
       insert (access_token, refresh_token),
       update (access_token, refresh_token),
       references (access_token, refresh_token)
  on table public.social_accounts from anon, authenticated;

-- WhatsApp access tokens remain service-role only; Google connection rows were
-- already protected by the existing client-deny policy. Do not grant any new
-- client access to either credential store.
