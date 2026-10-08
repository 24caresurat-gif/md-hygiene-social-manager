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
export async function PATCH(request:Request){
  try{
    const body=await request.json().catch(()=>({})); const workspaceId=String(body.workspaceId||'').trim(); const id=String(body.id||'').trim();
    if(!workspaceId||!id)return NextResponse.json({error:'workspaceId and id are required.'},{status:400});
    const {db,access}=await accessFor(request,workspaceId); if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
    if(!access.canManage)return NextResponse.json({error:'Workspace management permission is required.'},{status:403});
    const update:any={updated_at:new Date().toISOString()};
    if(body.status) update.status=String(body.status);
    if(body.payment_status) update.payment_status=String(body.payment_status);
    if(body.notes!==undefined) update.notes=body.notes?String(body.notes):null;
    const {data,error}=await db.from('catalog_orders').update(update).eq('id',id).eq('workspace_id',workspaceId).select().single();
    if(error)throw error; return NextResponse.json({order:data});
  }catch(e){const m=e instanceof Error?e.message:'Unable to update order.';return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});}
}