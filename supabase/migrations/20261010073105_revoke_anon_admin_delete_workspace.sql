-- Remove anonymous execute access to the destructive workspace-admin RPC.
-- Authenticated execution is retained because the function body itself checks auth.uid()
-- and requires public.is_admin(); this keeps the admin UI path intact.
REVOKE EXECUTE ON FUNCTION public.admin_delete_workspace(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_workspace(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_workspace(uuid) TO authenticated, service_role;
