-- One provider account may be connected in multiple workspaces. Keep provider
-- account identity unique per workspace so reconnecting in Workspace B never moves
-- the saved account out of Workspace A. Legacy rows without workspace_id keep their
-- old per-user uniqueness rule until they are assigned to a workspace.
alter table public.social_accounts
  drop constraint if exists social_accounts_user_id_platform_platform_account_id_key;

-- Restore workspace_id for legacy account rows whose brand_id still points at
-- a real workspace-linked brand. Leave ambiguous rows untouched to avoid merging
-- two independent connections into one workspace.
update public.social_accounts sa
set workspace_id = b.workspace_id
from public.brands b
where sa.workspace_id is null
  and sa.brand_id = b.id
  and b.workspace_id is not null
  and not exists (
    select 1
    from public.social_accounts current_scoped
    where current_scoped.workspace_id = b.workspace_id
      and current_scoped.platform = sa.platform
      and current_scoped.platform_account_id = sa.platform_account_id
      and current_scoped.id <> sa.id
  );

alter table public.social_accounts
  add constraint social_accounts_workspace_platform_account_id_key
  unique (workspace_id, platform, platform_account_id);

create unique index if not exists social_accounts_unscoped_user_platform_account_key
  on public.social_accounts (user_id, platform, platform_account_id)
  where workspace_id is null;
