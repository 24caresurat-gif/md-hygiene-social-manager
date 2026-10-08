import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../../lib/workspace-auth';

async function accessFor(request:Request,workspaceId:string){
 const user=await authenticatedUser(request);const db=adminDb();const access=await workspaceAccess(db,user.id,workspaceId);return {db,access};
}
export async function GET(request:Request){
 try{
  const workspaceId=String(new URL(request.url).searchParams.get('workspaceId')||'').trim();
  if(!workspaceId)return NextResponse.json({error:'workspaceId is required.'},{status:400});
  const {db,access}=await accessFor(request,workspaceId);if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
  const {data:card,error:ce}=await db.from('digital_cards').select('id,profile_slug,full_name,business_name').eq('workspace_id',workspaceId).maybeSingle();if(ce)throw ce;
  if(!card)return NextResponse.json({card:null,leads:[],messages:[],access:{role:access.role,canManage:access.canManage}});
  const [l,m]=await Promise.all([
   db.from('digital_card_leads').select('*').eq('digital_card_id',card.id).order('created_at',{ascending:false}),
   db.from('digital_card_messages').select('*').eq('digital_card_id',card.id).order('created_at',{ascending:false})
  ]);
  if(l.error)throw l.error;if(m.error)throw m.error;
  return NextResponse.json({card,leads:l.data||[],messages:m.data||[],access:{role:access.role,canManage:access.canManage}});
 }catch(e){const m=e instanceof Error?e.message:'Unable to load digital card enquiries.';return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});}
}
