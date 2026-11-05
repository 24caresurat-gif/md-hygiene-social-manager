import { NextResponse } from 'next/server';
import { adminDb } from '../../../../../../lib/workspace-auth';

async function getActiveTable(token:string){
  if(!/^[0-9a-f-]{36}$/i.test(token))return null;
  const db=adminDb();
  const {data,error}=await db.from('pos_tables')
    .select('id,workspace_id,table_number,active')
    .eq('qr_token',token).eq('active',true).maybeSingle();
  if(error)throw error;
  return data;
}

export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){
  try{
    const {token}=await params;
    const table=await getActiveTable(String(token||''));
    if(!table)return NextResponse.json({error:'This table QR is not active.'},{status:404});
    const db=adminDb();
    const [{data:products,error:productError},{data:workspace,error:workspaceError}]=await Promise.all([
      db.from('catalog_products')
        .select('id,name,description,image_url,price,sku,stock_quantity,catalog_categories(name)')
        .eq('workspace_id',table.workspace_id).eq('active',true).gt('stock_quantity',0).order('name'),
      db.from('workspaces').select('name,logo_url').eq('id',table.workspace_id).maybeSingle()
    ]);
    if(productError)throw productError;
    if(workspaceError)throw workspaceError;
    return NextResponse.json({
      table:{tableNumber:table.table_number},
      business:{name:workspace?.name||'Restaurant',logoUrl:workspace?.logo_url||null},
      products:products||[]
    });
  }catch(error){
    const message=error instanceof Error?error.message:'Unable to load this table menu.';
    return NextResponse.json({error:message},{status:500});
  }
}

export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
  try{
    const {token}=await params;
    const table=await getActiveTable(String(token||''));
    if(!table)return NextResponse.json({error:'This table QR is not active.'},{status:404});
    const body=await request.json().catch(()=>({}));
    const raw=Array.isArray(body.items)?body.items:[];
    if(raw.length<1||raw.length>50)return NextResponse.json({error:'Add between 1 and 50 menu items.'},{status:400});
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const items=raw.map((item:any)=>({product_id:String(item?.productId||'').trim(),quantity:Number(item?.quantity)}));
    if(items.some((item:any)=>!uuid.test(item.product_id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>50)){
      return NextResponse.json({error:'Check the product and quantity in your order.'},{status:400});
    }
    const customerName=String(body.customerName||'Table Guest').trim().slice(0,200)||'Table Guest';
    const customerPhone=String(body.customerPhone||'').trim().slice(0,40)||null;
    const db=adminDb();
    const orderNumber='TBL-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomUUID().slice(0,6).toUpperCase();
    const {data,error}=await db.rpc('create_pos_order_transaction',{
      p_workspace_id:table.workspace_id,
      p_order_number:orderNumber,
      p_items:items,
      p_customer_name:customerName,
      p_customer_phone:customerPhone,
      p_order_type:'dine_in',
      p_table_label:table.table_number,
      p_payment_status:'pending',
      p_notes:String(body.notes||'').trim().slice(0,500)||'Customer order placed from table QR',
      p_order_channel:'table_qr',
      p_pos_table_id:table.id
    });
    if(error){
      const status=error.code==='P0001'?409:500;
      return NextResponse.json({error:error.message||'Unable to place table order.'},{status});
    }
    return NextResponse.json({success:true,order:data},{status:201});
  }catch(error){
    const message=error instanceof Error?error.message:'Unable to place table order.';
    return NextResponse.json({error:message},{status:500});
  }
}
