-- This legacy RPC references the old public.orders/products/coupons tables,
-- which are not present in the current schema. Current catalogue checkout uses
-- the workspace-scoped catalog_* tables through its server-side API route.
-- Prevent direct execution from browser-facing Supabase roles while preserving
-- the service-role grant for controlled server-side maintenance.
REVOKE EXECUTE ON FUNCTION public.create_order_with_csr(jsonb, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_order_with_csr(jsonb, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_order_with_csr(jsonb, jsonb, text) FROM authenticated;
