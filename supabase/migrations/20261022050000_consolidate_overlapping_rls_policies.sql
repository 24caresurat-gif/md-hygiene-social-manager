-- Remove Supabase "multiple permissive policies" warnings without changing
-- existing workspace access predicates.
-- A FOR ALL policy also applies to SELECT, so it overlaps the separate SELECT
-- policy. Split these 13 policies into INSERT/UPDATE/DELETE policies, keeping
-- the original USING and WITH CHECK expressions. Existing SELECT policies stay.
-- Fix search_path for the private SECURITY DEFINER workspace helper functions.

create or replace function private.is_workspace_manager(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.workplace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.active = true
      and wm.role in ('owner','admin','manager')
  );
$function$;

create or replace function private.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.workplace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.active = true
  );
$function$;

do $migration$
declare
  p record;
  v_role_list text;
  v_count integer := 0;
  v_split_count integer;
  v_remaining integer;
begin
  for p in
    select schemaname, tablename, policyname, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and policyname in (
        'workspace managers can manage ai review suggestions',
        'workspace managers can manage feedback forms',
        'workspace managers can manage feedback responses',
        'workspace managers can manage gmb profiles',
        'workspace managers can manage gmb reviews',
        'workspace managers can manage qr standees',
        'workspace managers can manage review images',
        'workspace managers can manage review requests',
        'workspace managers can manage keywords',
        'profiles_admin_manage',
        'workplace_members_admin_manage',
        'workplace_permissions_admin_manage',
        'workspace_member_permissions_manage'
      )
      and cmd = 'ALL'
  loop
    if p.qual is null or p.with_check is null then
      raise exception 'Unexpected policy definition: %.%', p.tablename, p.policyname;
    end if;

    v_role_list := array_to_string(p.roles, ', ');
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);

    execute format(
      'create policy %I on %I.%I as permissive for insert to %s with check (%s)',
      p.policyname || ' insert', p.schemaname, p.tablename, v_role_list, p.with_check
    );

    execute format(
      'create policy %I on %I.%I as permissive for update to %s using (%s) with check (%s)',
      p.policyname || ' update', p.schemaname, p.tablename, v_role_list, p.qual, p.with_check
    );

    execute format(
      'create policy %I on %I.%I as permissive for delete to %s using (%s)',
      p.policyname || ' delete', p.schemaname, p.tablename, v_role_list, p.qual
    );

    v_count := v_count + 1;
  end loop;

  if v_count <> 13 then
    raise exception 'Expected to split 13 overlapping ALL policies, found %', v_count;
  end if;

  select count(*) into v_split_count
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'workspace managers can manage ai review suggestions insert',
      'workspace managers can manage ai review suggestions update',
      'workspace managers can manage ai review suggestions delete',
      'workspace managers can manage feedback forms insert',
      'workspace managers can manage feedback forms update',
      'workspace managers can manage feedback forms delete',
      'workspace managers can manage feedback responses insert',
      'workspace managers can manage feedback responses update',
      'workspace managers can manage feedback responses delete',
      'workspace managers can manage gmb profiles insert',
      'workspace managers can manage gmb profiles update',
      'workspace managers can manage gmb profiles delete',
      'workspace managers can manage gmb reviews insert',
      'workspace managers can manage gmb reviews update',
      'workspace managers can manage gmb reviews delete',
      'workspace managers can manage qr standees insert',
      'workspace managers can manage qr standees update',
      'workspace managers can manage qr standees delete',
      'workspace managers can manage review images insert',
      'workspace managers can manage review images update',
      'workspace managers can manage review images delete',
      'workspace managers can manage review requests insert',
      'workspace managers can manage review requests update',
      'workspace managers can manage review requests delete',
      'workspace managers can manage keywords insert',
      'workspace managers can manage keywords update',
      'workspace managers can manage keywords delete',
      'profiles_admin_manage insert',
      'profiles_admin_manage update',
      'profiles_admin_manage delete',
      'workplace_members_admin_manage insert',
      'workplace_members_admin_manage update',
      'workplace_members_admin_manage delete',
      'workplace_permissions_admin_manage insert',
      'workplace_permissions_admin_manage update',
      'workplace_permissions_admin_manage delete',
      'workspace_member_permissions_manage insert',
      'workspace_member_permissions_manage update',
      'workspace_member_permissions_manage delete'
    );

  if v_split_count <> 39 then
    raise exception 'Expected 39 split policies, found %', v_split_count;
  end if;

  select count(*) into v_remaining
  from pg_policies
  where schemaname = 'public'
    and cmd = 'ALL'
    and policyname in (
      'workspace managers can manage ai review suggestions',
      'workspace managers can manage feedback forms',
      'workspace managers can manage feedback responses',
      'workspace managers can manage gmb profiles',
      'workspace managers can manage gmb reviews',
      'workspace managers can manage qr standees',
      'workspace managers can manage review images',
      'workspace managers can manage review requests',
      'workspace managers can manage keywords',
      'profiles_admin_manage',
      'workplace_members_admin_manage',
      'workplace_permissions_admin_manage',
      'workspace_member_permissions_manage'
    );

  if v_remaining <> 0 then
    raise exception 'Found % target ALL policies remaining', v_remaining;
  end if;

  if not (
    select proconfig @> array['search_path=""']
    from pg_proc where oid = 'private.is_workspace_manager(uuid)'::regprocedure
  ) or not (
    select proconfig @> array['search_path=""']
    from pg_proc where oid = 'private.is_workspace_member(uuid)'::regprocedure
  ) then
    raise exception 'Workspace helper function search_path was not hardened';
  end if;
end
$migration$;
