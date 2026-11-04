'use client';

import {useEffect,useMemo,useState} from 'react';
import AppShell from '../../components/AppShell';
import {getSupabase} from '../../../../lib/supabase-browser';

type Product={id:string;name:string;sku:string|null;price:number|string;stock_quantity:number;active:boolean;catalog_categories?:{name:string}|{name:string}[]|null};
type CartLine={product:Product;quantity:number};
type OrderItem={id:string;product_name:string;quantity:number;unit_price:number|string;line_total:number|string;sku:string|null};
type Order={id:string;order_number:string;customer_name:string;customer_email:string|null;customer_phone:string|null;subtotal:number|string;discount:number|string;total:number|string;coupon_code:string|null;status:string;payment_status:string;order_channel?:string;order_type?:string;table_label?:string|null;notes:string|null;created_at:string;items:OrderItem[]};
type Receipt={orderNumber:string;customerName:string;customerPhone:string;items:{name:string;quantity:number;unitPrice:number;lineTotal:number}[];total:number;paymentStatus:string;orderType:string;tableLabel:string;createdAt:string};

const money=(value:number|string|null|undefined)=>'₹'+Number(value||0).toFixed(2);
const statusOptions=['pending','confirmed','preparing','ready','served','processing','shipped','delivered','cancelled'];

export default function OrdersPOSPage(){
 const[workspaceId,setWorkspaceId]=useState('');
 const[products,setProducts]=useState<Product[]>([]);
 const[orders,setOrders]=useState<Order[]>([]);
 const[cart,setCart]=useState<CartLine[]>([]);
 const[tab,setTab]=useState<'billing'|'orders'|'kitchen'>('billing');
 const[query,setQuery]=useState('');
 const[orderFilter,setOrderFilter]=useState('all');
 const[orderType,setOrderType]=useState('counter');
 const[tableLabel,setTableLabel]=useState('');
 const[customerName,setCustomerName]=useState('Walk-in Customer');
 const[customerPhone,setCustomerPhone]=useState('');
 const[paymentStatus,setPaymentStatus]=useState('paid');
 const[notes,setNotes]=useState('');
 const[canManage,setCanManage]=useState(false);
 const[loading,setLoading]=useState(true);
 const[busy,setBusy]=useState('');
 const[error,setError]=useState('');
 const[notice,setNotice]=useState('');
 const[lastReceipt,setLastReceipt]=useState<Receipt|null>(null);

 async function accessToken(){
  const session=(await getSupabase().auth.getSession()).data.session;
  if(!session)throw Error('Session expired. Sign in again.');
  return session.access_token;
 }
 async function load(id=workspaceId){
  if(!id){setLoading(false);return}
  setLoading(true);setError('');
  try{
   const token=await accessToken();
   const [ordersResponse,catalogResponse]=await Promise.all([
    fetch('/api/catalog/orders?workspaceId='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+token},cache:'no-store'}),
    fetch('/api/catalog?workspaceId='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+token},cache:'no-store'})
   ]);
   const [ordersData,catalogData]=await Promise.all([
    ordersResponse.json().catch(()=>({})),catalogResponse.json().catch(()=>({}))
   ]);
   if(!ordersResponse.ok)throw Error(ordersData.error||'Unable to load orders.');
   if(!catalogResponse.ok)throw Error(catalogData.error||'Unable to load catalogue products.');
   setOrders((ordersData.orders||[]) as Order[]);
   setProducts((catalogData.products||[]).filter((product:Product)=>product.active) as Product[]);
   setCanManage(Boolean(catalogData.access?.canManage));
  }catch(e){setError(e instanceof Error?e.message:'Unable to load POS data.')}
  finally{setLoading(false)}
 }
 useEffect(()=>{
  let id='';try{id=localStorage.getItem('mdsm:selectedWorkspaceId')||''}catch{}
  setWorkspaceId(id);if(id)void load(id);else setLoading(false);
  const onWorkspace=(event:Event)=>{
   const next=(event as CustomEvent<{workspaceId?:string}>).detail?.workspaceId||'';
   if(next&&next!==id){id=next;setWorkspaceId(next);setCart([]);setLastReceipt(null);void load(next)}
  };
  window.addEventListener('mdsm:workspace-changed',onWorkspace);
  return()=>window.removeEventListener('mdsm:workspace-changed',onWorkspace);
 },[]);

 function addProduct(product:Product){
  setError('');setNotice('');
  setCart(current=>{
   const existing=current.find(line=>line.product.id===product.id);
   const nextQuantity=(existing?.quantity||0)+1;
   if(nextQuantity>Number(product.stock_quantity||0)){setError('Not enough stock for '+product.name+'.');return current}
   if(existing)return current.map(line=>line.product.id===product.id?{...line,quantity:nextQuantity}:line);
   return [...current,{product,quantity:1}];
  });
 }
 function changeQuantity(productId:string,quantity:number){
  const line=cart.find(item=>item.product.id===productId);if(!line)return;
  if(quantity<1){setCart(current=>current.filter(item=>item.product.id!==productId));return}
  if(quantity>Number(line.product.stock_quantity||0)){setError('Requested quantity exceeds available stock.');return}
  setCart(current=>current.map(item=>item.product.id===productId?{...item,quantity}:item));
 }
 const cartTotal=useMemo(()=>cart.reduce((sum,line)=>sum+Number(line.product.price||0)*line.quantity,0),[cart]);
 const visibleProducts=useMemo(()=>products.filter(product=>{
  const q=query.trim().toLowerCase();
  return !q||product.name.toLowerCase().includes(q)||String(product.sku||'').toLowerCase().includes(q);
 }),[products,query]);
 const posOrders=orders.filter(order=>order.order_channel==='pos');
 const kitchenOrders=posOrders.filter(order=>!['ready','served','delivered','cancelled'].includes(order.status));
 const filteredOrders=orders.filter(order=>{
  if(orderFilter==='pos'&&order.order_channel!=='pos')return false;
  if(orderFilter==='online'&&order.order_channel==='pos')return false;
  if(orderFilter!=='all'&&orderFilter!=='pos'&&orderFilter!=='online'&&order.status!==orderFilter)return false;
  return true;
 });
 const todayOrders=posOrders.filter(order=>new Date(order.created_at).toDateString()===new Date().toDateString());
 const todaySales=todayOrders.filter(order=>order.payment_status==='paid').reduce((sum,order)=>sum+Number(order.total||0),0);
 async function createBill(){
  if(!canManage){setError('Workspace manager permission is required to create bills.');return}
  if(!cart.length){setError('Add at least one product to the bill.');return}
  if(orderType==='dine_in'&&!tableLabel.trim()){setError('Enter a table number for dine-in orders.');return}
  setBusy('create');setError('');setNotice('');
  const receiptLines=cart.map(line=>({name:line.product.name,quantity:line.quantity,unitPrice:Number(line.product.price),lineTotal:Number(line.product.price)*line.quantity}));
  try{
   const token=await accessToken();
   const response=await fetch('/api/catalog/orders',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({
    workspaceId,items:cart.map(line=>({productId:line.product.id,quantity:line.quantity})),
    customerName:customerName.trim()||'Walk-in Customer',customerPhone:customerPhone.trim(),
    orderType,tableLabel,paymentStatus,notes
   })});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.error||'Unable to create POS bill.');
   const order=result.order||{};
   setLastReceipt({orderNumber:String(order.order_number||''),customerName:String(order.customer_name||customerName),customerPhone,
    items:receiptLines,total:Number(order.total??cartTotal),paymentStatus:String(order.payment_status||paymentStatus),
    orderType,tableLabel,createdAt:String(order.created_at||new Date().toISOString())});
   setCart([]);setCustomerName('Walk-in Customer');setCustomerPhone('');setNotes('');setTableLabel('');
   setNotice('Bill '+String(order.order_number||'')+' created. Inventory and order records have been updated.');
   setTab('orders');await load(workspaceId);
  }catch(e){setError(e instanceof Error?e.message:'Unable to create POS bill.')}
  finally{setBusy('')}
 }
 async function updateOrder(id:string,patch:Record<string,string>){
  setBusy(id);setError('');setNotice('');
  try{
   const token=await accessToken();
   const response=await fetch('/api/catalog/orders',{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({workspaceId,id,...patch})});
   const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'Unable to update order.');
   setNotice('Order updated.');await load(workspaceId);
  }catch(e){setError(e instanceof Error?e.message:'Unable to update order.')}
  finally{setBusy('')}
 }
 const categoryName=(product:Product)=>Array.isArray(product.catalog_categories)?product.catalog_categories[0]?.name:product.catalog_categories?.name;
 const stepStatus=(status:string)=>status==='pending'?'preparing':status==='preparing'?'ready':status==='ready'?'served':'served';

 return <AppShell title="Orders & POS">
  <style>{`
   .pos{display:grid;gap:16px;color:var(--ui-text)}
   .pos .tabs{display:flex;gap:7px;flex-wrap:wrap}
   .pos .tab{border:1px solid var(--ui-border);background:#fff;border-radius:10px;padding:9px 13px;font-size:11px;font-weight:800;color:var(--ui-text-2)}
   .pos .tab.active{background:var(--ui-primary);border-color:var(--ui-primary);color:#fff}
   .pos .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
   .pos .metric{padding:15px}.pos .metric span{display:block;font-size:9px;color:var(--ui-muted);font-weight:850;text-transform:uppercase;letter-spacing:.07em}
   .pos .metric strong{display:block;font-size:23px;margin-top:7px}
   .pos .billing{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(320px,.8fr);gap:14px;align-items:start}
   .pos .panel-pad{padding:17px}
   .pos .product-tools{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:13px}
   .pos .search{width:min(100%,310px);border:1px solid var(--ui-border-strong);border-radius:10px;padding:10px 12px;background:#fff;color:var(--ui-text)}
   .pos .product-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
   .pos .product-card{border:1px solid var(--ui-border);border-radius:12px;background:#fff;padding:12px;min-width:0;display:grid;gap:8px}
   .pos .product-card strong{font-size:11px;overflow-wrap:anywhere}
   .pos .product-card .meta{font-size:9px;color:var(--ui-muted)}
   .pos .product-card button{border:0;background:var(--ui-primary-soft);color:var(--ui-primary);border-radius:9px;padding:8px;font-size:10px;font-weight:850}
   .pos .product-card button:disabled{opacity:.45;cursor:not-allowed}
   .pos .cart{display:grid;gap:12px;position:sticky;top:84px}
   .pos .cart-lines{display:grid;gap:9px;max-height:260px;overflow:auto}
   .pos .cart-line{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding-bottom:9px;border-bottom:1px solid var(--ui-border)}
   .pos .cart-line strong{font-size:10px}.pos .cart-line small{display:block;font-size:9px;color:var(--ui-muted);margin-top:3px}
   .pos .qty{display:flex;align-items:center;gap:6px}
   .pos .qty button{width:24px;height:24px;border:1px solid var(--ui-border);border-radius:7px;background:#fff;font-weight:900}
   .pos .qty span{min-width:18px;text-align:center;font-size:10px;font-weight:800}
   .pos .fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
   .pos .field{display:grid;gap:5px;font-size:10px;font-weight:800;color:var(--ui-text-2);min-width:0}
   .pos .field input,.pos .field select,.pos .field textarea{width:100%;border:1px solid var(--ui-border-strong);border-radius:9px;padding:9px 10px;background:#fff;color:var(--ui-text);min-height:39px}
   .pos .full{grid-column:1/-1}
   .pos .total{border-top:1px solid var(--ui-border);padding-top:11px;display:flex;justify-content:space-between;align-items:center}
   .pos .total strong{font-size:21px}
   .pos .notice,.pos .error{border-radius:10px;padding:10px 12px;font-size:11px}
   .pos .notice{background:var(--ui-success-soft);color:var(--ui-success)}
   .pos .error{background:var(--ui-danger-soft);color:var(--ui-danger)}
   .pos .order-row{padding:14px 16px;border-top:1px solid var(--ui-border);display:grid;gap:10px}
   .pos .order-head{display:grid;grid-template-columns:minmax(0,1.2fr) 100px 100px 100px;gap:10px;align-items:center}
   .pos .order-head strong{font-size:11px}.pos .order-head small{display:block;font-size:9px;color:var(--ui-muted);margin-top:3px}
   .pos .pill{font-size:9px;font-weight:850;border-radius:999px;padding:5px 8px;width:max-content;background:var(--ui-surface-soft);color:var(--ui-text-2)}
   .pos .pill.green{background:var(--ui-success-soft);color:var(--ui-success)}
   .pos .pill.orange{background:var(--ui-warning-soft);color:var(--ui-warning)}
   .pos .items{display:grid;gap:5px}.pos .item{display:flex;justify-content:space-between;gap:10px;font-size:9px;color:var(--ui-text-2)}
   .pos .order-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
   .pos .order-actions select{border:1px solid var(--ui-border);border-radius:8px;padding:7px;background:#fff;font-size:9px}
   .pos .empty{padding:34px 15px;text-align:center;font-size:11px;color:var(--ui-muted)}
   .pos .receipt{display:none}
   @media(max-width:1100px){.pos .product-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pos .billing{grid-template-columns:1fr}.pos .cart{position:static}.pos .order-head{grid-template-columns:1fr 90px 90px}}
   @media(max-width:760px){.pos .metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.pos .product-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pos .fields{grid-template-columns:1fr}.pos .full{grid-column:auto}.pos .order-head{grid-template-columns:1fr}.pos .panel-pad{padding:14px}}
   @media print{
    body *{visibility:hidden!important}
    .pos .receipt,.pos .receipt *{visibility:visible!important}
    .pos .receipt{display:block!important;position:absolute;left:0;top:0;width:78mm;padding:5mm;color:#000;background:#fff;font:12px/1.45 monospace}
    .pos .receipt h2{text-align:center;margin:0 0 5px}
    .pos .receipt .line{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dotted #aaa;padding:3px 0}
   }
  `}</style>
  <div className="pos">
   <div className="page-head"><div><div className="eyebrow">POINT OF SALE</div><h1>Orders & POS</h1><p>Create counter bills, manage restaurant orders and track kitchen preparation.</p></div><div className="tabs"><button className={'tab '+(tab==='billing'?'active':'')} onClick={()=>setTab('billing')}>＋ New Bill</button><button className={'tab '+(tab==='orders'?'active':'')} onClick={()=>setTab('orders')}>All Orders</button><button className={'tab '+(tab==='kitchen'?'active':'')} onClick={()=>setTab('kitchen')}>Kitchen Display</button></div></div>
   {notice&&<div className="notice">{notice}</div>}{error&&<div className="error" role="alert">{error}</div>}
   <div className="metrics">
    <article className="panel metric"><span>POS Orders Today</span><strong>{loading?'—':todayOrders.length}</strong></article>
    <article className="panel metric"><span>Paid Sales Today</span><strong>{loading?'—':money(todaySales)}</strong></article>
    <article className="panel metric"><span>All Orders</span><strong>{loading?'—':orders.length}</strong></article>
    <article className="panel metric"><span>Kitchen Queue</span><strong>{loading?'—':kitchenOrders.length}</strong></article>
   </div>

   {tab==='billing'&&<div className="billing">
    <section className="panel panel-pad">
     <div className="product-tools"><div><div className="eyebrow">PRODUCTS</div><h2 style={{margin:'4px 0'}}>Add items to bill</h2></div><input className="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search product or SKU…"/></div>
     {loading?<div className="empty">Loading catalogue…</div>:!visibleProducts.length?<div className="empty">No active catalogue products found. Add products in Catalogue before creating a bill.<br/><button className="btn btn-soft" style={{marginTop:12}} onClick={()=>location.href='/dashboard/catalog'}>Open Catalogue</button></div>:<div className="product-grid">{visibleProducts.map(product=><article className="product-card" key={product.id}><div><strong>{product.name}</strong><div className="meta">{categoryName(product)||product.sku||'Product'}</div></div><strong>{money(product.price)}</strong><div className="meta">Stock: {product.stock_quantity}</div><button disabled={Number(product.stock_quantity)<=0} onClick={()=>addProduct(product)}>＋ Add to bill</button></article>)}</div>}
    </section>
    <aside className="panel panel-pad cart">
     <div><div className="eyebrow">CURRENT BILL</div><h2 style={{margin:'4px 0'}}>Cart & checkout</h2></div>
     <div className="cart-lines">{cart.length?cart.map(line=><div className="cart-line" key={line.product.id}><div><strong>{line.product.name}</strong><small>{money(line.product.price)} each · {money(Number(line.product.price)*line.quantity)}</small></div><div className="qty"><button onClick={()=>changeQuantity(line.product.id,line.quantity-1)}>−</button><span>{line.quantity}</span><button onClick={()=>changeQuantity(line.product.id,line.quantity+1)}>＋</button></div></div>):<div className="empty" style={{padding:16}}>No products in this bill yet.</div>}</div>
     <div className="fields">
      <label className="field">Order type<select value={orderType} onChange={e=>setOrderType(e.target.value)}><option value="counter">Counter</option><option value="dine_in">Dine-in</option><option value="takeaway">Takeaway</option></select></label>
      {orderType==='dine_in'&&<label className="field">Table number<input value={tableLabel} onChange={e=>setTableLabel(e.target.value)} placeholder="Table 04" /></label>}
      <label className="field">Customer name<input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Walk-in Customer"/></label>
      <label className="field">Phone (optional)<input value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} placeholder="+91 98765 43210"/></label>
      <label className="field">Payment<select value={paymentStatus} onChange={e=>setPaymentStatus(e.target.value)}><option value="paid">Paid</option><option value="pending">Pending</option></select></label>
      <label className="field full">Notes<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></label>
     </div>
     <div className="total"><span style={{fontSize:11,fontWeight:850}}>Bill total</span><strong>{money(cartTotal)}</strong></div>
     <button className="btn btn-primary" disabled={!canManage||busy==='create'||!cart.length} onClick={()=>void createBill()}>{busy==='create'?'Creating bill…':'Create Bill'}</button>
     {!canManage&&<span style={{fontSize:9,color:'var(--ui-muted)'}}>Workspace manager permission is required to create POS bills.</span>}
    </aside>
   </div>}

   {tab!=='billing'&&<section className="panel">
    <div className="panel-head" style={{flexWrap:'wrap'}}><div><div className="eyebrow">{tab==='kitchen'?'KITCHEN DISPLAY':'ORDER MANAGEMENT'}</div><h2>{tab==='kitchen'?'Active kitchen orders':'All workspace orders'}</h2><p>{tab==='kitchen'?'Move dine-in and takeaway orders through preparation and service.':'Online catalogue orders and in-store POS bills are shown together.'}</p></div>{tab==='orders'&&<select aria-label="Filter orders" value={orderFilter} onChange={e=>setOrderFilter(e.target.value)} style={{border:'1px solid var(--ui-border)',borderRadius:9,padding:8}}><option value="all">All orders</option><option value="pos">POS bills</option><option value="online">Online orders</option>{statusOptions.map(status=><option key={status} value={status}>{status}</option>)}</select>}</div>
    {loading?<div className="empty">Loading orders…</div>:(tab==='kitchen'?kitchenOrders:filteredOrders).length===0?<div className="empty">{tab==='kitchen'?'No active POS orders are waiting for the kitchen.':'No orders found for this filter.'}</div>:(tab==='kitchen'?kitchenOrders:filteredOrders).map(order=><article className="order-row" key={order.id}>
     <div className="order-head"><div><strong>{order.order_number} · {order.customer_name||'Walk-in Customer'}</strong><small>{new Date(order.created_at).toLocaleString()} · {order.customer_phone||order.customer_email||'No contact'}</small></div><span className={'pill '+(['ready','served','delivered'].includes(order.status)?'green':order.status==='cancelled'?'orange':'')}>{order.status}</span><span className="pill">{order.order_channel==='pos'?'POS':'Online'}</span><strong>{money(order.total)}</strong></div>
     {(order.order_channel==='pos'||order.order_type==='dine_in')&&<div className="meta">{String(order.order_type||'').replace('_',' ')}{order.table_label?' · '+order.table_label:''} · Payment: {order.payment_status}</div>}
     <div className="items">{(order.items||[]).map(item=><div className="item" key={item.id}><span>{item.product_name} × {item.quantity}</span><span>{money(item.line_total)}</span></div>)}</div>
     <div className="order-actions">
      {tab==='kitchen'?<><button className="btn btn-soft" disabled={!!busy||order.status==='served'} onClick={()=>void updateOrder(order.id,{status:stepStatus(order.status)})}>{order.status==='pending'?'Start preparing':order.status==='preparing'?'Mark ready':'Mark served'}</button><span className="meta">Next step: {stepStatus(order.status)}</span></>:<>
       <select aria-label="Update order status" value={order.status} disabled={busy===order.id} onChange={e=>void updateOrder(order.id,{status:e.target.value})}>{statusOptions.map(status=><option key={status} value={status}>{status}</option>)}</select>
       <select aria-label="Update payment status" value={order.payment_status} disabled={busy===order.id} onChange={e=>void updateOrder(order.id,{payment_status:e.target.value})}>{['pending','paid','failed','refunded'].map(status=><option key={status} value={status}>{status}</option>)}</select>
      </>}
     </div>
    </article>)}
   </section>}
   {lastReceipt&&<section className="receipt"><h2>MD HYGIENE</h2><div style={{textAlign:'center'}}>POS BILL</div><div className="line"><span>Order</span><span>{lastReceipt.orderNumber}</span></div><div className="line"><span>Date</span><span>{new Date(lastReceipt.createdAt).toLocaleString()}</span></div><div className="line"><span>Customer</span><span>{lastReceipt.customerName}</span></div>{lastReceipt.customerPhone&&<div className="line"><span>Phone</span><span>{lastReceipt.customerPhone}</span></div>}<div className="line"><span>Type</span><span>{lastReceipt.orderType} {lastReceipt.tableLabel}</span></div>{lastReceipt.items.map((item,index)=><div className="line" key={index}><span>{item.name} × {item.quantity}</span><span>{money(item.lineTotal)}</span></div>)}<div className="line"><strong>TOTAL</strong><strong>{money(lastReceipt.total)}</strong></div><div className="line"><span>Payment</span><span>{lastReceipt.paymentStatus}</span></div><div style={{textAlign:'center',marginTop:10}}>Thank you</div></section>}
  </div>
 </AppShell>;
}
