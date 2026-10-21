-- Keep RLS helper functions out of the PostgREST-exposed public schema.
-- Existing policies keep their function OID references when ALTER FUNCTION SET SCHEMA runs.
-- The private schema already exists and is intentionally not USAGE-granted to anon/authenticated.
revoke all on schema private from public, anon, authenticated;

alter function public.is_admin(uuid) set schema private;
alter function public.can_access_workplace(uuid, uuid) set schema private;
alter function public.has_workplace_permission(uuid, text, text, uuid) set schema private;

create or replace function private.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(uid = auth.uid(), false)
     and exists (
       select 1
       from public.profiles
       where id = uid and role = 'admin' and active = true
     );
$function$;

create or replace function private.can_access_workplace(wid uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(uid = auth.uid(), false)
     and (
       private.is_admin(uid)
       or exists (
         select 1 from public.workplace_members
         where workplace_id = wid and user_id = uid and active = true
       )
     );
$function$;

create or replace function private.has_workplace_permission(
  wid uuid, plat text, perm text, uid uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  allowed boolean;
begin
  if uid is distinct from auth.uid() then return false; end if;
  if private.is_admin(uid) then return true; end if;
  if not private.can_access_workplace(wid, uid) then return false; end if;

  execute format(
    'select %I from public.workplace_permissions where workplace_id=$1 and user_id=$2 and platform=$3',
    perm
  ) into allowed using wid, uid, plat;

  return coalesce(allowed, false);
end;
$function$;

-- This server-side destructive helper also references the private admin check and
-- must never resolve objects through a mutable search path.
create or replace function public.admin_delete_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_admin() then
    raise exception 'Admin access required';
  end if;

  if not exists (select 1 from public.brands where id = p_workspace_id) then
    raise exception 'Workspace not found';
  end if;

  delete from public.social_posts where brand_id = p_workspace_id;
  delete from public.brands where id = p_workspace_id;
end;
$function$;

-- Policies execute these functions by stored OID; grant function permission, but
-- deliberately keep the private schema itself non-addressable via PostgREST.
grant execute on function private.is_admin(uuid) to authenticated, service_role;
grant execute on function private.can_access_workplace(uuid, uuid) to authenticated, service_role;
grant execute on function private.has_workplace_permission(uuid, text, text, uuid) to authenticated, service_role;

revoke execute on function private.is_admin(uuid) from public, anon;
revoke execute on function private.can_access_workplace(uuid, uuid) from public, anon;
revoke execute on function private.has_workplace_permission(uuid, text, text, uuid) from public, anon;
alter function public.admin_delete_workspace(uuid) set search_path = '';

do $verify$
begin
  if has_schema_privilege('authenticated', 'private', 'USAGE')
     or has_schema_privilege('anon', 'private', 'USAGE') then
    raise exception 'The private schema must remain inaccessible directly to API roles';
  end if;

  if not (select proconfig @> array['search_path=""']
          from pg_proc where oid = 'private.is_admin(uuid)'::regprocedure)
     or not (select proconfig @> array['search_path=""']
             from pg_proc where oid = 'private.can_access_workplace(uuid,uuid)'::regprocedure)
     or not (select proconfig @> array['search_path=""']
             from pg_proc where oid = 'private.has_workplace_permission(uuid,text,text,uuid)'::regprocedure) then
    raise exception 'Expected empty search_path on all private authorization helpers';
  end if;
end;
$verify$;
