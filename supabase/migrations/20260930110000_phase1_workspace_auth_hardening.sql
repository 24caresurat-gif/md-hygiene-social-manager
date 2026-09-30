-- Phase 1: workspace/auth hardening
-- Applied to the production Supabase project as migration:
-- phase1_workspace_auth_hardening

alter function public.workspace_role_defaults(text) set search_path = '';

revoke execute on function public.workspace_role_defaults(text) from public;
revoke execute on function public.workspace_role_defaults(text) from anon;
revoke execute on function public.workspace_role_defaults(text) from authenticated;
grant execute on function public.workspace_role_defaults(text) to service_role;

revoke all on table public.google_business_connections from anon;
revoke all on table public.google_business_connections from authenticated;

create index if not exists workplace_members_user_active_idx
  on public.workplace_members (user_id, active);

create index if not exists workspace_member_permissions_user_id_idx
  on public.workspace_member_permissions (user_id);
