-- SmartyD-style digital loyalty programme foundation.
-- Additive only: existing CRM/catalogue data is preserved.

create table if not exists public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  stamps_required integer not null default 7 check (stamps_required between 1 and 50),
  reward_description text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_programs_workspace_id_id_key unique (workspace_id, id)
);

create unique index if not exists loyalty_programs_workspace_name_unique
  on public.loyalty_programs (workspace_id, lower(name));

create table if not exists public.loyalty_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  program_id uuid not null,
  customer_name text not null,
  phone text not null,
  stamps integer not null default 0 check (stamps >= 0),
  rewards_available integer not null default 0 check (rewards_available >= 0),
  rewards_redeemed integer not null default 0 check (rewards_redeemed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_members_workspace_id_id_key unique (workspace_id, id),
  constraint loyalty_members_program_workspace_fkey
    foreign key (workspace_id, program_id)
    references public.loyalty_programs (workspace_id, id) on delete cascade,
  constraint loyalty_members_workspace_program_phone_unique
    unique (workspace_id, program_id, phone)
);

create index if not exists loyalty_members_workspace_program_idx
  on public.loyalty_members (workspace_id, program_id, created_at desc);

create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  program_id uuid not null,
  member_id uuid not null,
  transaction_type text not null check (transaction_type in ('stamp', 'redeem', 'adjustment')),
  stamps_delta integer not null default 0,
  rewards_delta integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  constraint loyalty_transactions_program_workspace_fkey
    foreign key (workspace_id, program_id)
    references public.loyalty_programs (workspace_id, id) on delete cascade,
  constraint loyalty_transactions_member_workspace_fkey
    foreign key (workspace_id, member_id)
    references public.loyalty_members (workspace_id, id) on delete cascade
);

create index if not exists loyalty_transactions_workspace_member_created_idx
  on public.loyalty_transactions (workspace_id, member_id, created_at desc);

alter table public.loyalty_programs enable row level security;
alter table public.loyalty_members enable row level security;
alter table public.loyalty_transactions enable row level security;

drop policy if exists loyalty_programs_member_select on public.loyalty_programs;
create policy loyalty_programs_member_select on public.loyalty_programs
  for select to authenticated using (private.is_workspace_member(workspace_id));
drop policy if exists loyalty_programs_manager_insert on public.loyalty_programs;
create policy loyalty_programs_manager_insert on public.loyalty_programs
  for insert to authenticated with check (private.is_workspace_manager(workspace_id));
drop policy if exists loyalty_programs_manager_update on public.loyalty_programs;
create policy loyalty_programs_manager_update on public.loyalty_programs
  for update to authenticated using (private.is_workspace_manager(workspace_id))
  with check (private.is_workspace_manager(workspace_id));
drop policy if exists loyalty_programs_manager_delete on public.loyalty_programs;
create policy loyalty_programs_manager_delete on public.loyalty_programs
  for delete to authenticated using (private.is_workspace_manager(workspace_id));

drop policy if exists loyalty_members_member_select on public.loyalty_members;
create policy loyalty_members_member_select on public.loyalty_members
  for select to authenticated using (private.is_workspace_member(workspace_id));
drop policy if exists loyalty_members_manager_insert on public.loyalty_members;
create policy loyalty_members_manager_insert on public.loyalty_members
  for insert to authenticated with check (private.is_workspace_manager(workspace_id));
drop policy if exists loyalty_members_manager_update on public.loyalty_members;
create policy loyalty_members_manager_update on public.loyalty_members
  for update to authenticated using (private.is_workspace_manager(workspace_id))
  with check (private.is_workspace_manager(workspace_id));
drop policy if exists loyalty_members_manager_delete on public.loyalty_members;
create policy loyalty_members_manager_delete on public.loyalty_members
  for delete to authenticated using (private.is_workspace_manager(workspace_id));

drop policy if exists loyalty_transactions_member_select on public.loyalty_transactions;
create policy loyalty_transactions_member_select on public.loyalty_transactions
  for select to authenticated using (private.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.loyalty_programs to authenticated;
grant select, insert, update, delete on public.loyalty_members to authenticated;
grant select on public.loyalty_transactions to authenticated;

create or replace function public.loyalty_apply_stamp(
  p_workspace_id uuid,
  p_member_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_member record;
  v_stamps integer;
  v_reward_delta integer := 0;
  v_available integer;
begin
  select m.id, m.program_id, m.stamps, m.rewards_available, p.stamps_required
    into v_member
  from public.loyalty_members m
  join public.loyalty_programs p
    on p.id = m.program_id and p.workspace_id = m.workspace_id
  where m.workspace_id = p_workspace_id
    and m.id = p_member_id
    and p.is_active = true
  for update of m;

  if not found then
    raise exception 'Active loyalty member or programme not found.';
  end if;

  v_stamps := v_member.stamps + 1;
  if v_stamps >= v_member.stamps_required then
    v_stamps := v_stamps - v_member.stamps_required;
    v_reward_delta := 1;
  end if;

  update public.loyalty_members
    set stamps = v_stamps,
        rewards_available = rewards_available + v_reward_delta,
        updated_at = pg_catalog.now()
  where workspace_id = p_workspace_id and id = p_member_id
  returning rewards_available into v_available;

  insert into public.loyalty_transactions (
    workspace_id, program_id, member_id, transaction_type,
    stamps_delta, rewards_delta, note
  ) values (
    p_workspace_id, v_member.program_id, p_member_id, 'stamp',
    1, v_reward_delta, nullif(pg_catalog.btrim(coalesce(p_note, '')), '')
  );

  return pg_catalog.jsonb_build_object(
    'stamps', v_stamps,
    'rewards_available', v_available,
    'reward_earned', v_reward_delta > 0
  );
end;
$function$;

create or replace function public.loyalty_redeem_reward(
  p_workspace_id uuid,
  p_member_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_member record;
  v_available integer;
  v_redeemed integer;
begin
  select m.id, m.program_id, m.rewards_available, m.rewards_redeemed
    into v_member
  from public.loyalty_members m
  join public.loyalty_programs p
    on p.id = m.program_id and p.workspace_id = m.workspace_id
  where m.workspace_id = p_workspace_id
    and m.id = p_member_id
    and p.is_active = true
  for update of m;

  if not found then
    raise exception 'Active loyalty member or programme not found.';
  end if;
  if v_member.rewards_available < 1 then
    raise exception 'No reward is available to redeem.';
  end if;

  update public.loyalty_members
    set rewards_available = rewards_available - 1,
        rewards_redeemed = rewards_redeemed + 1,
        updated_at = pg_catalog.now()
  where workspace_id = p_workspace_id and id = p_member_id
  returning rewards_available, rewards_redeemed into v_available, v_redeemed;

  insert into public.loyalty_transactions (
    workspace_id, program_id, member_id, transaction_type,
    stamps_delta, rewards_delta, note
  ) values (
    p_workspace_id, v_member.program_id, p_member_id, 'redeem',
    0, -1, nullif(pg_catalog.btrim(coalesce(p_note, '')), '')
  );

  return pg_catalog.jsonb_build_object(
    'rewards_available', v_available,
    'rewards_redeemed', v_redeemed
  );
end;
$function$;

revoke all on function public.loyalty_apply_stamp(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.loyalty_redeem_reward(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.loyalty_apply_stamp(uuid, uuid, text) to service_role;
grant execute on function public.loyalty_redeem_reward(uuid, uuid, text) to service_role;
