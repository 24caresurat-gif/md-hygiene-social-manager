import { NextResponse } from 'next/server';
import { adminDb } from '../../../../../lib/workspace-auth';

function orderNumber() {
  return 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomUUID().slice(0, 6).toUpperCase();
}

function checkoutErrorStatus(code: string | undefined, message: string) {
  const text = message.toLowerCase();
  if (code === 'P0001') {
    if (/coupon|minimum order|customer name|email or phone|required|invalid price|discount configuration/.test(text)) return 400;
    if (/stock|product|cart|available|session is ambiguous/.test(text)) return 409;
    return 400;
  }
  return 500;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug = String(body.slug || '').trim().toLowerCase();
    const sessionKey = String(body.sessionKey || '').trim();
    const customer = body.customer && typeof body.customer === 'object' ? body.customer : {};
    const shippingAddress = body.shippingAddress && typeof body.shippingAddress === 'object' ? body.shippingAddress : {};
    const couponCode = String(body.couponCode || '').trim().toUpperCase();

    if (!slug || !sessionKey) {
      return NextResponse.json({ error: 'slug and sessionKey are required.' }, { status: 400 });
    }

    const name = String(customer.name || '').trim();
    const email = String(customer.email || '').trim();
    const phone = String(customer.phone || '').trim();
    if (!name || (!email && !phone)) {
      return NextResponse.json({ error: 'Customer name and email or phone are required.' }, { status: 400 });
    }

    const db = adminDb();
    const { data: ws, error: wsError } = await db
      .from('workspaces')
      .select('id,name,slug')
      .eq('slug', slug)
      .maybeSingle();

    if (wsError) throw wsError;
    if (!ws) return NextResponse.json({ error: 'Catalogue not found.' }, { status: 404 });

    // The database function locks the cart/products/coupon and performs all
    // inserts, inventory changes and cart cleanup in one transaction.
    const { data: order, error: orderError } = await db.rpc('create_catalog_order_transaction', {
      p_workspace_id: ws.id,
      p_session_key: sessionKey,
      p_order_number: orderNumber(),
      p_customer_name: name,
      p_customer_email: email || null,
      p_customer_phone: phone || null,
      p_shipping_address: shippingAddress,
      p_coupon_code: couponCode,
      p_notes: body.notes ? String(body.notes) : null,
    });

    if (orderError) {
      return NextResponse.json(
        { error: orderError.message || 'Unable to create order.' },
        { status: checkoutErrorStatus(orderError.code, orderError.message || '') },
      );
    }

    return NextResponse.json({ success: true, order });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unable to create order.' },
      { status: 500 },
    );
  }
}
