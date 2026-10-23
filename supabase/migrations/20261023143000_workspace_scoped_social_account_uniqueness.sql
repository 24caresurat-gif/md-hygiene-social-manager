-- One provider account may be connected in multiple workspaces. Keep provider
-- account identity unique per workspace so reconnecting in Workspace B never moves
-- the saved account out of Workspace A. Legacy rows without workspace_id keep their
-- old per-user uniqueness rule until they are assigned to a workspace.
alter table public.social_accounts
  drop constraint if exists social_accounts_user_id_platform_platform_account_id_key;

alter table public.social_accounts
  add constraint social_accounts_workspace_platform_account_id_key
  unique (workspace_id, platform, platform_account_id);

create unique index if not exists social_accounts_unscoped_user_platform_account_key
  on public.social_accounts (user_id, platform, platform_account_id)
  where workspace_id is null;
