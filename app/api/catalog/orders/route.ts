import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../lib/workspace-auth';

async function accessFor(request:Request,workspaceId:string){
  const user=await authenticatedUser(request); const db=adminDb(); const access=await workspaceAccess(db,user.id,workspaceId);
  return {db,access};
}
export async function GET(request:Request){
  try{
    const workspaceId=String(new URL(request.url).searchParams.get('workspaceId')||'').trim();
    if(!workspaceId)return NextResponse.json({error:'workspaceId is required.'},{status:400});
    const {db,access}=await accessFor(request,workspaceId);
    if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
    const [{data:orders,error:e1},{data:items,error:e2}]=await Promise.all([
      db.from('catalog_orders').select('*').eq('workspace_id',workspaceId).order('created_at',{ascending:false}),
      db.from('catalog_order_items').select('*').in('order_id',
        (await db.from('catalog_orders').select('id').eq('workspace_id',workspaceId)).data?.map((x:any)=>x.id)||['00000000-0000-0000-0000-000000000000'])
    ]);
    if(e1)throw e1;if(e2)throw e2;
    const grouped=new Map<string,any[]>();
    for(const item of items||[]) grouped.set(item.order_id,[...(grouped.get(item.order_id)||[]),item]);
    return NextResponse.json({orders:(orders||[]).map((o:any)=>({...o,items:grouped.get(o.id)||[]})),access:{role:access.role,canManage:access.canManage}});
  }catch(e){const m=e instanceof Error?e.message:'Unable to load orders.';return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});}
}
export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>({}));
    const workspaceId=String(body.workspaceId||'').trim();
    if(!workspaceId)return NextResponse.json({error:'workspaceId is required.'},{status:400});
    const {db,access}=await accessFor(request,workspaceId);
    if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
    if(!access.canManage)return NextResponse.json({error:'Workspace management permission is required to create POS bills.'},{status:403});

    const rawItems=Array.isArray(body.items)?body.items:[];
    if(rawItems.length<1||rawItems.length>100)return NextResponse.json({error:'Add between 1 and 100 product lines.'},{status:400});
    const items=rawItems.map((item:any)=>({
      product_id:String(item?.productId||item?.product_id||'').trim(),
      quantity:Number(item?.quantity)
    }));
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if(items.some((item:any)=>!uuid.test(item.product_id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>1000)){
      return NextResponse.json({error:'Each bill line needs a valid product and quantity.'},{status:400});
    }
    const orderType=String(body.orderType||'counter');
    if(!['counter','dine_in','takeaway'].includes(orderType))return NextResponse.json({error:'Choose counter, dine-in or takeaway.'},{status:400});
    const tableLabel=String(body.tableLabel||'').trim();
    if(orderType==='dine_in'&&!tableLabel)return NextResponse.json({error:'Enter a table number for dine-in orders.'},{status:400});
    const paymentStatus=String(body.paymentStatus||'pending');
    if(!['pending','paid'].includes(paymentStatus))return NextResponse.json({error:'Choose paid or pending payment status.'},{status:400});
    const orderNumber='POS-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomUUID().slice(0,6).toUpperCase();
    const {data,error}=await db.rpc('create_pos_order_transaction',{
      p_workspace_id:workspaceId,
      p_order_number:orderNumber,
      p_items:items,
      p_customer_name:String(body.customerName||'Walk-in Customer').trim().slice(0,200),
      p_customer_phone:String(body.customerPhone||'').trim().slice(0,40)||null,
      p_order_type:orderType,
      p_table_label:tableLabel||null,
      p_payment_status:paymentStatus,
      p_notes:String(body.notes||'').trim().slice(0,1000)||null,
      p_order_channel:'pos',
      p_pos_table_id:null
    });
    if(error){
      const status=error.code==='P0001'?409:500;
      return NextResponse.json({error:error.message||'Unable to create POS bill.'},{status});
    }
    return NextResponse.json({success:true,order:data},{status:201});
  }catch(e){
    const m=e instanceof Error?e.message:'Unable to create POS bill.';
    return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});
  }
}

export async function PATCH(request:Request){
  try{
    const body=await request.json().catch(()=>({})); const workspaceId=String(body.workspaceId||'').trim(); const id=String(body.id||'').trim();
    if(!workspaceId||!id)return NextResponse.json({error:'workspaceId and id are required.'},{status:400});
    const {db,access}=await accessFor(request,workspaceId); if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
    if(!access.canManage)return NextResponse.json({error:'Workspace management permission is required.'},{status:403});
    const update:any={updated_at:new Date().toISOString()};
    if(body.status!==undefined){
      const allowedStatuses=['pending','confirmed','processing','preparing','ready','served','shipped','delivered','cancelled'];
      if(!allowedStatuses.includes(String(body.status)))return NextResponse.json({error:'Invalid order status.'},{status:400});
      update.status=String(body.status);
    }
    if(body.payment_status!==undefined){
      const allowedPayments=['pending','paid','failed','refunded'];
      if(!allowedPayments.includes(String(body.payment_status)))return NextResponse.json({error:'Invalid payment status.'},{status:400});
      update.payment_status=String(body.payment_status);
    }
    if(body.notes!==undefined) update.notes=body.notes?String(body.notes):null;
    const {data,error}=await db.from('catalog_orders').update(update).eq('id',id).eq('workspace_id',workspaceId).select().single();
    if(error)throw error; return NextResponse.json({order:data});
  }catch(e){const m=e instanceof Error?e.message:'Unable to update order.';return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});}
}