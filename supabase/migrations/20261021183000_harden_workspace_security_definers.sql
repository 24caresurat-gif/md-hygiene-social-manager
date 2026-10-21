-- Harden workspace authorization helpers against search_path object shadowing.
-- These SECURITY DEFINER functions are referenced by live RLS policies, so EXECUTE
-- cannot be blindly revoked from authenticated without a reviewed policy redesign.
-- Their object references are schema-qualified; an empty path is therefore safe.
alter function public.can_access_workplace(uuid, uuid) set search_path = '';
alter function public.has_workplace_permission(uuid, text, text, uuid) set search_path = '';
alter function public.is_admin(uuid) set search_path = '';
