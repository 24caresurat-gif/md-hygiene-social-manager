import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../../lib/workspace-auth';
import { triggerCrmWorkflows } from '../../../../../lib/crm-workflows';

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>({}));
    const workspaceId=String(body.workspaceId||'').trim();
    const triggerType=String(body.triggerType||'').trim();
    const leadId=String(body.leadId||'').trim();
    if(!workspaceId||!triggerType||!leadId)return NextResponse.json({error:'workspaceId, triggerType and leadId are required.'},{status:400});
    const allowed=['lead_created','lead_score_changed','whatsapp_message','task_due'];
    if(!allowed.includes(triggerType))return NextResponse.json({error:'Unsupported workflow trigger.'},{status:400});

    const user=await authenticatedUser(request);
    const db=adminDb();
    const access=await workspaceAccess(db,user.id,workspaceId);
    if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
    if(!access.canManage)return NextResponse.json({error:'Workspace management permission is required.'},{status:403});

    const {data:lead,error}=await db.from('crm_leads').select('*').eq('id',leadId).eq('workspace_id',workspaceId).maybeSingle();
    if(error)throw error;
    if(!lead)return NextResponse.json({error:'Lead not found.'},{status:404});

    const runs=await triggerCrmWorkflows(db,workspaceId,triggerType,lead,body.context&&typeof body.context==='object'?body.context:{});
    return NextResponse.json({success:true,runs});
  }catch(e){
    const m=e instanceof Error?e.message:'Unable to trigger CRM workflows.';
    return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});
  }
}
