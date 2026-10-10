-- The application deletes a workspace through the authenticated server route
-- /api/brands/[id], which validates workspace owner/admin membership and uses
-- the server-side service role. No current client code calls this RPC directly.
-- Keep the destructive helper available to service_role only.
REVOKE EXECUTE ON FUNCTION public.admin_delete_workspace(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_workspace(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_workspace(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_workspace(uuid) TO service_role;
