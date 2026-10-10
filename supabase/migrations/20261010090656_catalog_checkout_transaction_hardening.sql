-- Transaction-safe public catalogue checkout.
-- This migration was applied to the production Supabase database as
-- 20261010090656_catalog_checkout_transaction_hardening.
-- Checkout locks the session/cart and product rows, computes totals from DB
-- prices, updates stock/coupon counters and creates the order atomically.
-- Only the server-side service_role may call this RPC.

CREATE OR REPLACE FUNCTION public.create_catalog_order_transaction(
  p_workspace_id uuid,
  p_session_key text,
  p_order_number text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address jsonb,
  p_coupon_code text,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_cart public.catalog_carts%ROWTYPE;
  v_cart_count bigint;
  v_coupon public.catalog_coupons%ROWTYPE;
  v_item record;
  v_line jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_order public.catalog_orders%ROWTYPE;
  v_coupon_code text;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_line_total numeric(12,2);
  v_quantity integer;
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Catalogue workspace is required.';
  END IF;
  IF nullif(btrim(coalesce(p_session_key, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Session key is required.';
  END IF;
  IF nullif(btrim(coalesce(p_order_number, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Order number is required.';
  END IF;
  IF nullif(btrim(coalesce(p_customer_name, '')), '') IS NULL
     OR (nullif(btrim(coalesce(p_customer_email, '')), '') IS NULL
         AND nullif(btrim(coalesce(p_customer_phone, '')), '') IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Customer name and email or phone are required.';
  END IF;

  -- Serialize concurrent submissions for the same workspace/session.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text || ':' || p_session_key, 0)
  );

  SELECT count(*) INTO v_cart_count
  FROM public.catalog_carts AS c
  WHERE c.workspace_id = p_workspace_id
    AND c.session_key = p_session_key;

  IF v_cart_count = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Your cart is empty.';
  ELSIF v_cart_count > 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Cart session is ambiguous. Please refresh your cart.';
  END IF;

  SELECT c.* INTO v_cart
  FROM public.catalog_carts AS c
  WHERE c.workspace_id = p_workspace_id
    AND c.session_key = p_session_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Your cart is empty.';
  END IF;

  -- Lock cart rows and product rows in a stable order so stock cannot be
  -- oversold by simultaneous checkouts for different carts.
  FOR v_item IN
    SELECT
      ci.id AS cart_item_id,
      ci.product_id,
      ci.quantity,
      p.workspace_id AS product_workspace_id,
      p.name AS product_name,
      p.sku,
      p.price,
      p.active,
      p.stock_quantity
    FROM public.catalog_cart_items AS ci
    JOIN public.catalog_products AS p ON p.id = ci.product_id
    WHERE ci.cart_id = v_cart.id
    ORDER BY ci.product_id
    FOR UPDATE OF ci, p
  LOOP
    IF v_item.product_workspace_id IS DISTINCT FROM p_workspace_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A cart product does not belong to this catalogue.';
    END IF;
    IF NOT v_item.active THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'One of the products is no longer available.';
    END IF;
    IF v_item.price < 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'One of the products has an invalid price.';
    END IF;
    IF v_item.stock_quantity < v_item.quantity THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_item.product_name || ' does not have enough stock.';
    END IF;

    v_line_total := round(v_item.price * v_item.quantity, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_lines := v_lines || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id', v_item.product_id,
        'product_name', v_item.product_name,
        'sku', v_item.sku,
        'quantity', v_item.quantity,
        'unit_price', v_item.price,
        'line_total', v_line_total
      )
    );
  END LOOP;

  IF pg_catalog.jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Your cart is empty.';
  END IF;

  v_subtotal := round(v_subtotal, 2);
  v_coupon_code := upper(btrim(coalesce(p_coupon_code, '')));

  IF v_coupon_code <> '' THEN
    SELECT c.* INTO v_coupon
    FROM public.catalog_coupons AS c
    WHERE c.workspace_id = p_workspace_id
      AND c.code = v_coupon_code
    FOR UPDATE;

    IF NOT FOUND OR NOT v_coupon.active THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Coupon code is invalid or inactive.';
    END IF;
    IF v_coupon.starts_at IS NOT NULL AND v_coupon.starts_at > now() THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Coupon is not active yet.';
    END IF;
    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Coupon has expired.';
    END IF;
    IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Coupon usage limit has been reached.';
    END IF;
    IF v_subtotal < v_coupon.min_order_value THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Minimum order value for this coupon is ₹' || to_char(v_coupon.min_order_value, 'FM999999999990.00') || '.';
    END IF;
    IF v_coupon.discount_value < 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Coupon discount configuration is invalid.';
    END IF;

    IF v_coupon.discount_type = 'percent' THEN
      v_discount := least(v_subtotal, round(v_subtotal * v_coupon.discount_value / 100, 2));
    ELSE
      v_discount := least(v_subtotal, round(v_coupon.discount_value, 2));
    END IF;
  END IF;

  v_total := greatest(0, round(v_subtotal - v_discount, 2));

  INSERT INTO public.catalog_orders (
    workspace_id, order_number, session_key, customer_name,
    customer_email, customer_phone, subtotal, discount, total,
    coupon_id, coupon_code, shipping_address, status, payment_status, notes
  ) VALUES (
    p_workspace_id, p_order_number, p_session_key, btrim(p_customer_name),
    nullif(btrim(coalesce(p_customer_email, '')), ''),
    nullif(btrim(coalesce(p_customer_phone, '')), ''),
    v_subtotal, v_discount, v_total,
    CASE WHEN v_coupon_code = '' THEN NULL ELSE v_coupon.id END,
    CASE WHEN v_coupon_code = '' THEN NULL ELSE v_coupon.code END,
    coalesce(p_shipping_address, '{}'::jsonb),
    'pending', 'pending', nullif(btrim(coalesce(p_notes, '')), '')
  )
  RETURNING * INTO v_order;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(v_lines)
  LOOP
    v_quantity := (v_line ->> 'quantity')::integer;

    UPDATE public.catalog_products
    SET stock_quantity = stock_quantity - v_quantity,
        updated_at = now()
    WHERE id = (v_line ->> 'product_id')::uuid
      AND workspace_id = p_workspace_id
      AND active = true
      AND stock_quantity >= v_quantity;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Stock changed during checkout. Please refresh your cart.';
    END IF;

    INSERT INTO public.catalog_order_items (
      order_id, product_id, product_name, sku, quantity, unit_price, line_total
    ) VALUES (
      v_order.id,
      (v_line ->> 'product_id')::uuid,
      v_line ->> 'product_name',
      nullif(v_line ->> 'sku', ''),
      v_quantity,
      (v_line ->> 'unit_price')::numeric,
      (v_line ->> 'line_total')::numeric
    );
  END LOOP;

  IF v_coupon_code <> '' THEN
    UPDATE public.catalog_coupons
    SET used_count = used_count + 1
    WHERE id = v_coupon.id
      AND (max_uses IS NULL OR used_count < max_uses);

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Coupon usage limit has been reached.';
    END IF;
  END IF;

  DELETE FROM public.catalog_cart_items WHERE cart_id = v_cart.id;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'subtotal', v_order.subtotal,
    'discount', v_order.discount,
    'total', v_order.total,
    'status', v_order.status,
    'payment_status', v_order.payment_status,
    'created_at', v_order.created_at
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_catalog_order_transaction(uuid, text, text, text, text, text, jsonb, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_catalog_order_transaction(uuid, text, text, text, text, text, jsonb, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_catalog_order_transaction(uuid, text, text, text, text, text, jsonb, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_catalog_order_transaction(uuid, text, text, text, text, text, jsonb, text, text) TO service_role;
