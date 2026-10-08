import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../lib/workspace-auth';

function slugify(value:string){return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120)||'item';}
async function accessFor(request:Request,workspaceId:string){
  const user=await authenticatedUser(request); const db=adminDb(); const access=await workspaceAccess(db,user.id,workspaceId);
  if(!access?.hasAccess)return {db,access:null}; return {db,access};
}
export async function GET(request:Request){
  try{
    const workspaceId=String(new URL(request.url).searchParams.get('workspaceId')||'').trim();
    if(!workspaceId)return NextResponse.json({error:'workspaceId is required.'},{status:400});
    const {db,access}=await accessFor(request,workspaceId); if(!access)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
    const [{data:categories,error:e1},{data:products,error:e2},{data:coupons,error:e3}]=await Promise.all([
      db.from('catalog_categories').select('*').eq('workspace_id',workspaceId).order('sort_order'),
      db.from('catalog_products').select('*,catalog_categories(name)').eq('workspace_id',workspaceId).order('created_at',{ascending:false}),
      db.from('catalog_coupons').select('*').eq('workspace_id',workspaceId).order('created_at',{ascending:false})
    ]);
    if(e1)throw e1;if(e2)throw e2;if(e3)throw e3;
    return NextResponse.json({workspaceId,access:{role:access.role,canManage:access.canManage},categories:categories||[],products:products||[],coupons:coupons||[]});
  }catch(e){const m=e instanceof Error?e.message:'Unable to load catalogue.';return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});}
}
export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>({}));const workspaceId=String(body.workspaceId||'').trim();const type=String(body.type||'').trim();
    if(!workspaceId||!type)return NextResponse.json({error:'workspaceId and type are required.'},{status:400});
    const {db,access}=await accessFor(request,workspaceId);if(!access)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
    if(!access.canManage)return NextResponse.json({error:'Workspace management permission is required.'},{status:403});
    if(type==='category'){
      const name=String(body.name||'').trim();if(!name)return NextResponse.json({error:'Category name is required.'},{status:400});
      const {data,error}=await db.from('catalog_categories').insert({workspace_id:workspaceId,name,description:body.description?String(body.description):null,sort_order:Number(body.sort_order||0)}).select().single();if(error)throw error;return NextResponse.json({category:data},{status:201});
    }
    if(type==='product'){
      const name=String(body.name||'').trim();if(!name)return NextResponse.json({error:'Product name is required.'},{status:400});
      const slug=slugify(String(body.slug||name));
      const {data,error}=await db.from('catalog_products').insert({workspace_id:workspaceId,category_id:body.category_id||null,name,slug,description:body.description?String(body.description):null,image_url:body.image_url?String(body.image_url):null,price:Number(body.price||0),compare_at_price:body.compare_at_price==null||body.compare_at_price===''?null:Number(body.compare_at_price),sku:body.sku?String(body.sku):null,active:body.active!==false,featured:Boolean(body.featured),stock_quantity:Number(body.stock_quantity||0)}).select().single();if(error)throw error;return NextResponse.json({product:data},{status:201});
    }
    if(type==='coupon'){
      const code=String(body.code||'').trim().toUpperCase();if(!code)return NextResponse.json({error:'Coupon code is required.'},{status:400});
      const discountType=body.discount_type==='fixed'?'fixed':'percent';
      const value=Math.max(0,Number(body.discount_value||0));
      if(discountType==='percent'&&value>100)return NextResponse.json({error:'Percent discount cannot exceed 100.'},{status:400});
      const {data,error}=await db.from('catalog_coupons').insert({workspace_id:workspaceId,code,discount_type:discountType,discount_value:value,min_order_value:Number(body.min_order_value||0),max_uses:body.max_uses?Number(body.max_uses):null,active:true}).select().single();if(error)throw error;return NextResponse.json({coupon:data},{status:201});
    }
    return NextResponse.json({error:'Unknown catalogue type.'},{status:400});
  }catch(e){const m=e instanceof Error?e.message:'Unable to save catalogue item.';return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});}
}
export async function PATCH(request:Request){
  try{
    const body=await request.json().catch(()=>({}));const workspaceId=String(body.workspaceId||'').trim();const type=String(body.type||'').trim();const id=String(body.id||'').trim();
    if(!workspaceId||!type||!id)return NextResponse.json({error:'workspaceId, type and id are required.'},{status:400});
    const {db,access}=await accessFor(request,workspaceId);if(!access)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});if(!access.canManage)return NextResponse.json({error:'Workspace management permission is required.'},{status:403});
    const table=type==='category'?'catalog_categories':type==='product'?'catalog_products':type==='coupon'?'catalog_coupons':'';
    if(!table)return NextResponse.json({error:'Unknown catalogue type.'},{status:400});
    const update:any={updated_at:new Date().toISOString()};
    if(type==='category')Object.assign(update,{name:String(body.name||'').trim(),description:body.description?String(body.description):null,active:body.active!==false});
    if(type==='product')Object.assign(update,{name:String(body.name||'').trim(),description:body.description?String(body.description):null,price:Number(body.price||0),compare_at_price:body.compare_at_price==null||body.compare_at_price===''?null:Number(body.compare_at_price),active:body.active!==false,featured:Boolean(body.featured),stock_quantity:Number(body.stock_quantity||0),category_id:body.category_id||null});
    if(type==='coupon')Object.assign(update,{active:Boolean(body.active),discount_value:Number(body.discount_value||0),min_order_value:Number(body.min_order_value||0),max_uses:body.max_uses?Number(body.max_uses):null});
    const {data,error}=await db.from(table).update(update).eq('id',id).eq('workspace_id',workspaceId).select().single();if(error)throw error;return NextResponse.json({item:data});
  }catch(e){const m=e instanceof Error?e.message:'Unable to update catalogue item.';return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});}
}
export async function DELETE(request:Request){
  try{
    const body=await request.json().catch(()=>({}));const workspaceId=String(body.workspaceId||'').trim();const type=String(body.type||'').trim();const id=String(body.id||'').trim();
    if(!workspaceId||!type||!id)return NextResponse.json({error:'workspaceId, type and id are required.'},{status:400});
    const {db,access}=await accessFor(request,workspaceId);if(!access)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});if(!access.canManage)return NextResponse.json({error:'Workspace management permission is required.'},{status:403});
    const table=type==='category'?'catalog_categories':type==='product'?'catalog_products':type==='coupon'?'catalog_coupons':'';
    if(!table)return NextResponse.json({error:'Unknown catalogue type.'},{status:400});
    const {error}=await db.from(table).delete().eq('id',id).eq('workspace_id',workspaceId);if(error)throw error;return NextResponse.json({success:true});
  }catch(e){const m=e instanceof Error?e.message:'Unable to delete catalogue item.';return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});}
}