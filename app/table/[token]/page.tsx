'use client';

import {useEffect,useMemo,useState} from 'react';
import {useParams} from 'next/navigation';

type Product={id:string;name:string;description:string|null;image_url:string|null;price:number|string;sku:string|null;stock_quantity:number;catalog_categories?:{name:string}|{name:string}[]|null};
type Line={product:Product;quantity:number};
const money=(value:number|string)=>'₹'+Number(value||0).toFixed(2);

export default function TableOrderPage(){
 const params=useParams<{token:string}>();
 const token=String(params?.token||'');
 const[business,setBusiness]=useState({name:'Restaurant',logoUrl:null as string|null});
 const[tableNumber,setTableNumber]=useState('');
 const[products,setProducts]=useState<Product[]>([]);
 const[cart,setCart]=useState<Line[]>([]);
 const[customerName,setCustomerName]=useState('');
 const[customerPhone,setCustomerPhone]=useState('');
 const[loading,setLoading]=useState(true);
 const[busy,setBusy]=useState(false);
 const[error,setError]=useState('');
 const[success,setSuccess]=useState('');
 const[query,setQuery]=useState('');
 const[showCart,setShowCart]=useState(false);
 async function load(){
  if(!token){setLoading(false);setError('Invalid table QR link.');return}
  setLoading(true);setError('');
  try{
   const response=await fetch('/api/public/pos/table/'+encodeURIComponent(token),{cache:'no-store'});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'This table menu is unavailable.');
   setBusiness(data.business||{name:'Restaurant',logoUrl:null});
   setTableNumber(String(data.table?.tableNumber||''));
   setProducts((data.products||[]) as Product[]);
  }catch(e){setError(e instanceof Error?e.message:'Unable to load the menu.')}finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[token]);
 const total=useMemo(()=>cart.reduce((sum,line)=>sum+Number(line.product.price)*line.quantity,0),[cart]);
 const visible=products.filter(product=>!query.trim()||product.name.toLowerCase().includes(query.trim().toLowerCase()));
 function add(product:Product){
  setCart(current=>{
   const old=current.find(line=>line.product.id===product.id);
   const qty=(old?.quantity||0)+1;
   if(qty>product.stock_quantity){setError('Only '+product.stock_quantity+' available for '+product.name+'.');return current}
   setError('');
   return old?current.map(line=>line.product.id===product.id?{...line,quantity:qty}:line):[...current,{product,quantity:1}];
  });
 }
 function quantity(productId:string,next:number){
  if(next<1){setCart(current=>current.filter(line=>line.product.id!==productId));return}
  const item=cart.find(line=>line.product.id===productId);if(!item)return;
  if(next>item.product.stock_quantity){setError('Requested quantity is not available.');return}
  setCart(current=>current.map(line=>line.product.id===productId?{...line,quantity:next}:line));
 }
 async function placeOrder(){
  if(!cart.length){setError('Add at least one item to your order.');return}
  setBusy(true);setError('');setSuccess('');
  try{
   const response=await fetch('/api/public/pos/table/'+encodeURIComponent(token),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({customerName:customerName.trim()||'Table Guest',customerPhone:customerPhone.trim(),items:cart.map(line=>({productId:line.product.id,quantity:line.quantity}))})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'Unable to send your order to the kitchen.');
   setSuccess('Order '+String(data.order?.order_number||'')+' sent to the restaurant. Please wait for the team.');
   setCart([]);setShowCart(false);setCustomerName('');setCustomerPhone('');
  }catch(e){setError(e instanceof Error?e.message:'Unable to place your order.')}finally{setBusy(false)}
 }
 return <main className="table-menu">
  <style>{`
   .table-menu{min-height:100dvh;background:#f6f8fb;color:#17202b;padding:18px 14px 35px;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
   .table-menu .wrap{max-width:960px;margin:0 auto;display:grid;gap:16px}
   .table-menu .brand{padding:20px;border:1px solid #e4e9ef;border-radius:18px;background:#fff;display:grid;gap:6px;text-align:center}
   .table-menu .brand h1{margin:0;font-size:23px}.table-menu .brand p{margin:0;color:#667085;font-size:11px}
   .table-menu .tag{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#087f7b;font-weight:900}
   .table-menu .search{width:100%;border:1px solid #d8e0e8;border-radius:12px;padding:12px;background:#fff}
   .table-menu .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
   .table-menu .product{overflow:hidden;border:1px solid #e4e9ef;border-radius:14px;background:#fff;display:grid;grid-template-rows:auto 1fr}
   .table-menu .product img{display:block;width:100%;height:150px;object-fit:cover;background:#f1f4f7}
   .table-menu .product .body{padding:12px;display:grid;gap:7px;align-content:start}
   .table-menu .product strong{font-size:12px}.table-menu .product p{font-size:10px;color:#667085;margin:0;line-height:1.45}
   .table-menu .product .foot{display:flex;justify-content:space-between;align-items:center;gap:8px}
   .table-menu .price{font-size:13px;font-weight:900}
   .table-menu button{cursor:pointer}
   .table-menu .add,.table-menu .submit{border:0;border-radius:10px;padding:10px 12px;background:#087f7b;color:#fff;font-size:10px;font-weight:850}
   .table-menu .add:disabled,.table-menu .submit:disabled{opacity:.5}
   .table-menu .panel{border:1px solid #e4e9ef;border-radius:15px;background:#fff;padding:15px;display:grid;gap:11px}
   .table-menu .line{display:flex;justify-content:space-between;align-items:center;gap:9px;font-size:11px}
   .table-menu .qty{display:flex;gap:7px;align-items:center}.table-menu .qty button{width:25px;height:25px;border:1px solid #dce4eb;border-radius:7px;background:#fff}
   .table-menu .field{display:grid;gap:5px;font-size:10px;font-weight:800;color:#475467}
   .table-menu .field input{padding:10px;border:1px solid #d8e0e8;border-radius:9px;min-height:40px}
   .table-menu .error,.table-menu .success{padding:12px;border-radius:10px;font-size:11px}
   .table-menu .error{background:#fff1f0;color:#b42318}.table-menu .success{background:#edf8f1;color:#14804a}
   .table-menu .empty{padding:35px;text-align:center;color:#667085;font-size:11px;background:#fff;border:1px solid #e4e9ef;border-radius:14px}
   .table-menu .cart-fab{position:sticky;bottom:12px;display:flex;justify-content:center;z-index:5}
   .table-menu .cart-fab button{border:0;border-radius:999px;padding:13px 19px;background:#17202b;color:#fff;box-shadow:0 8px 24px rgba(15,23,42,.2);font-weight:900}
   @media(min-width:760px){.table-menu{padding:28px}.table-menu .grid{grid-template-columns:repeat(3,minmax(0,1fr))}.table-menu .product img{height:170px}}
  `}</style>
  <div className="wrap">
   <header className="brand"><span className="tag">DIGITAL MENU</span><h1>{business.name}</h1><p>Table {tableNumber} · Order from your phone</p></header>
   {error&&<div className="error" role="alert">{error}</div>}
   {success&&<div className="success" role="status">{success}</div>}
   {!success&&<><input className="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search menu items…"/>
    {loading?<div className="empty">Loading menu…</div>:!products.length?<div className="empty">No menu items are currently available. Please ask the restaurant team.</div>:<div className="grid">{visible.map(product=><article className="product" key={product.id}>{product.image_url?<img src={product.image_url} alt={product.name}/>:<div style={{height:80,background:'#f1f4f7'}}/>}<div className="body"><strong>{product.name}</strong>{product.description&&<p>{product.description}</p>}<div className="foot"><span className="price">{money(product.price)}</span><button className="add" disabled={product.stock_quantity<=0} onClick={()=>add(product)}>Add</button></div></div></article>)}</div>}
    {cart.length>0&&<div className="cart-fab"><button onClick={()=>setShowCart(v=>!v)}>{showCart?'Hide order':'View order'} · {cart.length} items · {money(total)}</button></div>}
    {showCart&&cart.length>0&&<section className="panel"><h2 style={{margin:0}}>Your order</h2>{cart.map(line=><div className="line" key={line.product.id}><span>{line.product.name}<br/><small>{money(line.product.price)} each</small></span><div className="qty"><button onClick={()=>quantity(line.product.id,line.quantity-1)}>−</button><strong>{line.quantity}</strong><button onClick={()=>quantity(line.product.id,line.quantity+1)}>＋</button></div><strong>{money(Number(line.product.price)*line.quantity)}</strong></div>)}<label className="field">Your name<input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Name (optional)"/></label><label className="field">Phone number (optional)<input value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} placeholder="+91…"/></label><div className="line"><strong>Total</strong><strong>{money(total)}</strong></div><p style={{margin:0,color:'#667085',fontSize:9}}>Payment will be collected by the restaurant team. Your order will be sent to the kitchen as unpaid.</p><button className="submit" disabled={busy} onClick={()=>void placeOrder()}>{busy?'Sending order…':'Place Order'}</button></section>}
   </>}
  </div>
 </main>;
}
