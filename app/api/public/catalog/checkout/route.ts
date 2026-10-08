import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/workspace-auth';

function orderNumber(){ return 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomUUID().slice(0,6).toUpperCase(); }

export async function POST(request: Request){
  try{
    const body = await request.json().catch(()=>({}));
    const slug = String(body.slug||'').trim().toLowerCase();
    const sessionKey = String(body.sessionKey||'').trim();
    const customer = body.customer && typeof body.customer === 'object' ? body.customer : {};
    const shippingAddress = body.shippingAddress && typeof body.shippingAddress === 'object' ? body.shippingAddress : {};
    const couponCode = String(body.couponCode||'').trim().toUpperCase();

    if(!slug || !sessionKey) return NextResponse.json({error:'slug and sessionKey are required.'},{status:400});
    const name = String(customer.name||'').trim();
    const email = String(customer.email||'').trim();
    const phone = String(customer.phone||'').trim();
    if(!name || (!email && !phone)) return NextResponse.json({error:'Customer name and email or phone are required.'},{status:400});

    const db = adminDb();
    const {data:ws,error:wsError}=await db.from('workspaces').select('id,name,slug').eq('slug',slug).maybeSingle();
    if(wsError) throw wsError;
    if(!ws) return NextResponse.json({error:'Catalogue not found.'},{status:404});

    const {data:cart,error:cartError}=await db.from('catalog_carts').select('id,coupon_id').eq('workspace_id',ws.id).eq('session_key',sessionKey).maybeSingle();
    if(cartError) throw cartError;
    if(!cart) return NextResponse.json({error:'Your cart is empty.'},{status:400});

    const {data:items,error:itemError}=await db.from('catalog_cart_items').select('id,quantity,product_id,catalog_products(id,name,sku,price,active,stock_quantity)').eq('cart_id',cart.id);
    if(itemError) throw itemError;
    if(!items?.length) return NextResponse.json({error:'Your cart is empty.'},{status:400});

    let subtotal = 0;
    const orderItems:any[] = [];
    for(const item of items as any[]){
      const product = item.catalog_products;
      if(!product || !product.active) return NextResponse.json({error:'One of the products is no longer available.'},{status:409});
      const quantity = Math.max(1,Number(item.quantity||1));
      if(Number(product.stock_quantity||0) < quantity) return NextResponse.json({error:product.name+' does not have enough stock.'},{status:409});
      const unit = Number(product.price||0);
      const line = Number((unit*quantity).toFixed(2));
      subtotal += line;
      orderItems.push({product_id:product.id,product_name:product.name,sku:product.sku||null,quantity,unit_price:unit,line_total:line});
    }
    subtotal = Number(subtotal.toFixed(2));

    let coupon:any=null, discount=0;
    const code = couponCode || '';
    if(code){
      const {data:c,error:cError}=await db.from('catalog_coupons').select('*').eq('workspace_id',ws.id).eq('code',code).eq('active',true).maybeSingle();
      if(cError) throw cError;
      if(!c) return NextResponse.json({error:'Coupon code is invalid or inactive.'},{status:400});
      const now = Date.now();
      if(c.starts_at && new Date(c.starts_at).getTime()>now) return NextResponse.json({error:'Coupon is not active yet.'},{status:400});
      if(c.expires_at && new Date(c.expires_at).getTime()<now) return NextResponse.json({error:'Coupon has expired.'},{status:400});
      if(c.max_uses!=null && Number(c.used_count||0)>=Number(c.max_uses)) return NextResponse.json({error:'Coupon usage limit has been reached.'},{status:400});
      if(subtotal < Number(c.min_order_value||0)) return NextResponse.json({error:'Minimum order value for this coupon is ₹'+Number(c.min_order_value||0).toFixed(2)+'.'},{status:400});
      discount = c.discount_type==='percent' ? Number((subtotal*Number(c.discount_value||0)/100).toFixed(2)) : Math.min(subtotal,Number(c.discount_value||0));
      coupon=c;
    }
    const total = Number(Math.max(0,subtotal-discount).toFixed(2));

    const {data:order,error:orderError}=await db.from('catalog_orders').insert({
      workspace_id:ws.id,order_number:orderNumber(),session_key:sessionKey,
      customer_name:name,customer_email:email||null,customer_phone:phone||null,
      subtotal,discount,total,coupon_id:coupon?.id||null,coupon_code:coupon?.code||null,
      shipping_address:shippingAddress,status:'pending',payment_status:'pending',
      notes:body.notes?String(body.notes):null
    }).select('id,order_number,subtotal,discount,total,status,payment_status,created_at').single();
    if(orderError) throw orderError;

    const {error:itemsError}=await db.from('catalog_order_items').insert(orderItems.map(x=>({...x,order_id:order.id})));
    if(itemsError) throw itemsError;

    for(const item of orderItems){
      const remaining = Math.max(0,Number((items.find((x:any)=>x.product_id===item.product_id)?.catalog_products?.stock_quantity||0))-item.quantity);
      const {error:stockError}=await db.from('catalog_products').update({stock_quantity:remaining,updated_at:new Date().toISOString()}).eq('id',item.product_id).eq('workspace_id',ws.id);
      if(stockError) throw stockError;
    }
    if(coupon){ const {error:couponError}=await db.from('catalog_coupons').update({used_count:Number(coupon.used_count||0)+1}).eq('id',coupon.id).eq('workspace_id',ws.id); if(couponError) throw couponError; }
    await db.from('catalog_cart_items').delete().eq('cart_id',cart.id);

    return NextResponse.json({success:true,order});
  }catch(e){ return NextResponse.json({error:e instanceof Error?e.message:'Unable to create order.'},{status:500}); }
}
