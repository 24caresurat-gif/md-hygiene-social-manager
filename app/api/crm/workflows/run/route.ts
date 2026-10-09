import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../../lib/workspace-auth';
import { executeCrmWorkflow } from '../../../../../lib/crm-workflows';

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>({}));
    const workspaceId=String(body.workspaceId||'').trim();
    const workflowId=String(body.workflowId||'').trim();
    const leadId=String(body.leadId||'').trim();
    if(!workspaceId||!workflowId||!leadId)return NextResponse.json({error:'workspaceId, workflowId and leadId are required.'},{status:400});
    const user=await authenticatedUser(request);
    const db=adminDb();
    const access=await workspaceAccess(db,user.id,workspaceId);
    if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
    if(!access.canManage)return NextResponse.json({error:'Workspace management permission is required.'},{status:403});

    const [{data:workflow,error:workflowError},{data:lead,error:leadError}]=await Promise.all([
      db.from('crm_workflows').select('*').eq('id',workflowId).eq('workspace_id',workspaceId).maybeSingle(),
      db.from('crm_leads').select('*').eq('id',leadId).eq('workspace_id',workspaceId).maybeSingle()
    ]);
    if(workflowError)throw workflowError;if(leadError)throw leadError;
    if(!workflow)return NextResponse.json({error:'Workflow not found.'},{status:404});
    if(!workflow.active)return NextResponse.json({error:'Workflow is paused.'},{status:409});
    if(!lead)return NextResponse.json({error:'Lead not found.'},{status:404});

    const result=await executeCrmWorkflow(db,workflow,workspaceId,lead);
    const {data:run,error:runError}=await db.from('crm_workflow_runs').insert({
      workflow_id:workflow.id,workspace_id:workspaceId,entity_type:'crm_lead',entity_id:lead.id,
      status:result.status,result:result.results,completed_at:new Date().toISOString()
    }).select('*').single();
    if(runError)throw runError;
    return NextResponse.json({success:result.status==='completed',run});
  }catch(e){
    const m=e instanceof Error?e.message:'Unable to run workflow.';
    return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});
  }
}