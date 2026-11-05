import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../lib/workspace-auth';

async function accessFor(request:Request,workspaceId:string){
  const user=await authenticatedUser(request);
  const db=adminDb();
  const access=await workspaceAccess(db,user.id,workspaceId);
  return {db,access};
}

export async function GET(request:Request){
  try{
    const workspaceId=String(new URL(request.url).searchParams.get('workspaceId')||'').trim();
    if(!workspaceId)return NextResponse.json({error:'workspaceId is required.'},{status:400});
    const {db,access}=await accessFor(request,workspaceId);
    if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
    const {data,error}=await db.from('pos_tables').select('id,table_number,qr_token,active,created_at').eq('workspace_id',workspaceId).order('table_number');
    if(error)throw error;
    return NextResponse.json({tables:data||[],canManage:Boolean(access.canManage)});
  }catch(error){
    const message=error instanceof Error?error.message:'Unable to load POS tables.';
    return NextResponse.json({error:message},{status:/Authentication|session/i.test(message)?401:500});
  }
}

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>({}));
    const workspaceId=String(body.workspaceId||'').trim();
    const tableNumber=String(body.tableNumber||'').trim();
    if(!workspaceId||!tableNumber)return NextResponse.json({error:'workspaceId and tableNumber are required.'},{status:400});
    if(tableNumber.length>40)return NextResponse.json({error:'Table number must be 40 characters or less.'},{status:400});
    const {db,access}=await accessFor(request,workspaceId);
    if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
    if(!access.canManage)return NextResponse.json({error:'Workspace management permission is required.'},{status:403});
    const {data,error}=await db.from('pos_tables').insert({workspace_id:workspaceId,table_number:tableNumber,active:true}).select('id,table_number,qr_token,active,created_at').single();
    if(error){
      if(error.code==='23505')return NextResponse.json({error:'This table number already exists in this workspace.'},{status:409});
      throw error;
    }
    return NextResponse.json({table:data},{status:201});
  }catch(error){
    const message=error instanceof Error?error.message:'Unable to create POS table.';
    return NextResponse.json({error:message},{status:/Authentication|session/i.test(message)?401:500});
  }
}

export async function PATCH(request:Request){
  try{
    const body=await request.json().catch(()=>({}));
    const workspaceId=String(body.workspaceId||'').trim();
    const id=String(body.id||'').trim();
    if(!workspaceId||!id||typeof body.active!=='boolean')return NextResponse.json({error:'workspaceId, id and active are required.'},{status:400});
    const {db,access}=await accessFor(request,workspaceId);
    if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
    if(!access.canManage)return NextResponse.json({error:'Workspace management permission is required.'},{status:403});
    const {data,error}=await db.from('pos_tables').update({active:body.active,updated_at:new Date().toISOString()}).eq('workspace_id',workspaceId).eq('id',id).select('id,table_number,qr_token,active,created_at').single();
    if(error)throw error;
    return NextResponse.json({table:data});
  }catch(error){
    const message=error instanceof Error?error.message:'Unable to update POS table.';
    return NextResponse.json({error:message},{status:/Authentication|session/i.test(message)?401:500});
  }
}
