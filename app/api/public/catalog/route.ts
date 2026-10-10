import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/workspace-auth';

async function workspace(db:any,slug:string){
 const {data,error}=await db.from('workspaces').select('id,name,slug').eq('slug',slug).maybeSingle();if(error)throw error;return data;
}
export async function GET(request:Request){
 try{
  const url=new URL(request.url);const slug=String(url.searchParams.get('slug')||'').trim().toLowerCase();const sessionKey=String(url.searchParams.get('sessionKey')||'').trim();
  if(!slug)return NextResponse.json({error:'slug is required.'},{status:400});const db=adminDb();const ws=await workspace(db,slug);if(!ws)return NextResponse.json({error:'Catalogue not found.'},{status:404});
  const [{data:categories,error:e1},{data:products,error:e2}]=await Promise.all([
   db.from('catalog_categories').select('id,name,description,sort_order').eq('workspace_id',ws.id).eq('active',true).order('sort_order'),
   db.from('catalog_products').select('id,name,slug,description,image_url,price,compare_at_price,featured,stock_quantity,category_id,catalog_categories(name)').eq('workspace_id',ws.id).eq('active',true).order('featured',{ascending:false}).order('created_at',{ascending:false})
  ]);if(e1)throw e1;if(e2)throw e2;
  let cart:any[]=[];let wishlist:any[]=[];
  if(sessionKey){
   const {data:cartRow}=await db.from('catalog_carts').select('id').eq('workspace_id',ws.id).eq('session_key',sessionKey).maybeSingle();
   if(cartRow){const {data:items}=await db.from('catalog_cart_items').select('quantity,product_id,catalog_products(id,name,price,compare_at_price,image_url)').eq('cart_id',cartRow.id);cart=items||[]}
   const {data:w}=await db.from('catalog_wishlists').select('product_id').eq('workspace_id',ws.id).eq('session_key',sessionKey);wishlist=(w||[]).map((x:any)=>x.product_id);
  }
  return NextResponse.json({workspace:ws,categories:categories||[],products:products||[],cart,wishlist});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to load catalogue.'},{status:500});}
}
export async function POST(request:Request){
 try{
  const body=await request.json().catch(()=>({}));const slug=String(body.slug||'').trim().toLowerCase();const sessionKey=String(body.sessionKey||'').trim();const action=String(body.action||'');const productId=String(body.productId||'').trim();
  if(!slug||!sessionKey||!productId)return NextResponse.json({error:'slug, sessionKey and productId are required.'},{status:400});
  const db=adminDb();const ws=await workspace(db,slug);if(!ws)return NextResponse.json({error:'Catalogue not found.'},{status:404});
  const {data:product,error:pe}=await db.from('catalog_products').select('id').eq('id',productId).eq('workspace_id',ws.id).eq('active',true).maybeSingle();if(pe)throw pe;if(!product)return NextResponse.json({error:'Product not found.'},{status:404});
  if(action==='cart_add'){
   const quantity=Number(body.quantity ?? 1);
   if(!Number.isInteger(quantity)||quantity<1||quantity>1000){
    return NextResponse.json({error:'Quantity must be between 1 and 1000.'},{status:400});
   }
   const {data:item,error}=await db.rpc('add_catalog_cart_item',{
    p_workspace_id:ws.id,
    p_session_key:sessionKey,
    p_product_id:productId,
    p_quantity:quantity
   });
   if(error){
    const message=error.message||'Unable to update cart.';
    if(error.code==='P0001'){
     const status=/does not have enough stock/i.test(message)?409:/product not found|no longer available/i.test(message)?404:400;
     return NextResponse.json({error:message},{status});
    }
    throw error;
   }
   return NextResponse.json({item});
  }
  if(action==='wishlist_toggle'){
   const {data:row}=await db.from('catalog_wishlists').select('id').eq('workspace_id',ws.id).eq('session_key',sessionKey).eq('product_id',productId).maybeSingle();
   if(row){const {error}=await db.from('catalog_wishlists').delete().eq('id',row.id);if(error)throw error;return NextResponse.json({wishlisted:false});}
   const {data:w,error}=await db.from('catalog_wishlists').insert({workspace_id:ws.id,session_key:sessionKey,product_id:productId}).select().single();if(error)throw error;return NextResponse.json({wishlisted:true,wishlist:w});
  }
  return NextResponse.json({error:'Unknown catalogue action.'},{status:400});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to update catalogue.'},{status:500});}
}