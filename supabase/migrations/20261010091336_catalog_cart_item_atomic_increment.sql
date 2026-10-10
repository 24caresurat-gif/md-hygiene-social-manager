-- Atomic add-to-cart increment for the public workspace catalogue.
-- Applied to production once as 20261010091336_catalog_cart_item_atomic_increment.
-- The partial unique index ensures one browser session has at most one cart
-- per workspace. This source file is for history/reproducibility; do not replay
-- it on the already-updated production database.

CREATE UNIQUE INDEX IF NOT EXISTS catalog_carts_workspace_session_key_uidx
  ON public.catalog_carts(workspace_id, session_key)
  WHERE session_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.add_catalog_cart_item(
  p_workspace_id uuid,
  p_session_key text,
  p_product_id uuid,
  p_quantity integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_product public.catalog_products%ROWTYPE;
  v_cart_id uuid;
  v_existing_quantity integer := 0;
  v_item public.catalog_cart_items%ROWTYPE;
BEGIN
  IF p_workspace_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Workspace and product are required.';
  END IF;
  IF nullif(btrim(coalesce(p_session_key, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Cart session is required.';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Quantity must be between 1 and 1000.';
  END IF;

  -- Share the lock key with checkout so cart edits and checkout cannot interleave.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text || ':' || p_session_key, 0)
  );

  SELECT p.* INTO v_product
  FROM public.catalog_products AS p
  WHERE p.id = p_product_id
    AND p.workspace_id = p_workspace_id
    AND p.active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Product not found or no longer available.';
  END IF;

  INSERT INTO public.catalog_carts(workspace_id, session_key)
  VALUES (p_workspace_id, p_session_key)
  ON CONFLICT (workspace_id, session_key) WHERE session_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_cart_id;

  IF v_cart_id IS NULL THEN
    SELECT c.id INTO v_cart_id
    FROM public.catalog_carts AS c
    WHERE c.workspace_id = p_workspace_id
      AND c.session_key = p_session_key
    FOR UPDATE;
  END IF;

  IF v_cart_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Unable to load your cart. Please try again.';
  END IF;

  SELECT ci.quantity INTO v_existing_quantity
  FROM public.catalog_cart_items AS ci
  WHERE ci.cart_id = v_cart_id
    AND ci.product_id = p_product_id
  FOR UPDATE;

  v_existing_quantity := coalesce(v_existing_quantity, 0);

  IF v_product.stock_quantity < v_existing_quantity + p_quantity THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_product.name || ' does not have enough stock.';
  END IF;

  INSERT INTO public.catalog_cart_items(cart_id, product_id, quantity)
  VALUES (v_cart_id, p_product_id, p_quantity)
  ON CONFLICT (cart_id, product_id)
  DO UPDATE SET quantity = public.catalog_cart_items.quantity + EXCLUDED.quantity
  RETURNING * INTO v_item;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_item.id,
    'cart_id', v_item.cart_id,
    'product_id', v_item.product_id,
    'quantity', v_item.quantity,
    'created_at', v_item.created_at
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.add_catalog_cart_item(uuid, text, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_catalog_cart_item(uuid, text, uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_catalog_cart_item(uuid, text, uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.add_catalog_cart_item(uuid, text, uuid, integer) TO service_role;
