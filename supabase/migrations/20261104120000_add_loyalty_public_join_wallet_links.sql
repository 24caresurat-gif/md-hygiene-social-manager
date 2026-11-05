-- Public loyalty join QR + private customer wallet links.
-- Tokens are isolated in service-role-only tables and never exposed to member queries.

create table if not exists public.loyalty_program_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  program_id uuid not null,
  join_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint loyalty_program_links_token_unique unique (join_token),
  constraint loyalty_program_links_program_unique unique (workspace_id, program_id),
  constraint loyalty_program_links_program_fk
    foreign key (workspace_id, program_id)
    references public.loyalty_programs (workspace_id, id) on delete cascade
);

create table if not exists public.loyalty_wallet_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  member_id uuid not null,
  wallet_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint loyalty_wallet_links_token_unique unique (wallet_token),
  constraint loyalty_wallet_links_member_unique unique (workspace_id, member_id),
  constraint loyalty_wallet_links_member_fk
    foreign key (workspace_id, member_id)
    references public.loyalty_members (workspace_id, id) on delete cascade
);

create index if not exists loyalty_program_links_workspace_idx
  on public.loyalty_program_links(workspace_id, program_id);
create index if not exists loyalty_wallet_links_workspace_idx
  on public.loyalty_wallet_links(workspace_id, member_id);

alter table public.loyalty_program_links enable row level security;
alter table public.loyalty_wallet_links enable row level security;

-- No authenticated/public policy: these random bearer tokens are only resolved by server APIs.
revoke all on public.loyalty_program_links from public, anon, authenticated;
revoke all on public.loyalty_wallet_links from public, anon, authenticated;
grant select, insert, delete on public.loyalty_program_links to service_role;
grant select, insert, delete on public.loyalty_wallet_links to service_role;

-- Backfill a join token for every existing programme in the additive schema.
insert into public.loyalty_program_links(workspace_id, program_id)
select p.workspace_id, p.id
from public.loyalty_programs p
on conflict (workspace_id, program_id) do nothing;

-- Existing members receive a private wallet URL too.
insert into public.loyalty_wallet_links(workspace_id, member_id)
select m.workspace_id, m.id
from public.loyalty_members m
on conflict (workspace_id, member_id) do nothing;
