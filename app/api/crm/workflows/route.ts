import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../lib/workspace-auth';

const triggers=['lead_created','lead_score_changed','whatsapp_message','task_due'];
const actionTypes=['create_task','set_stage','send_whatsapp_template','suggest_products'];

async function accessFor(request:Request,workspaceId:string){
  const user=await authenticatedUser(request);const db=adminDb();const access=await workspaceAccess(db,user.id,workspaceId);return {db,access};
}

export async function GET(request:Request){
  try{
    const workspaceId=String(new URL(request.url).searchParams.get('workspaceId')||'').trim();
    if(!workspaceId)return NextResponse.json({error:'workspaceId is required.'},{status:400});
    const {db,access}=await accessFor(request,workspaceId);
    if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
    const [{data:workflows,error:wError},{data:rules,error:rError}]=await Promise.all([
      db.from('crm_workflows').select('*').eq('workspace_id',workspaceId).order('created_at',{ascending:false}),
      db.from('crm_lead_rules').select('*').eq('workspace_id',workspaceId).order('priority',{ascending:true})
    ]);
    if(wError)throw wError;if(rError)throw rError;
    return NextResponse.json({workflows:workflows||[],rules:rules||[],access:{role:access.role,canManage:access.canManage}});
  }catch(e){
    const m=e instanceof Error?e.message:'Unable to load automation settings.';
    return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});
  }
}

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>({}));
    const workspaceId=String(body.workspaceId||'').trim();
    if(!workspaceId)return NextResponse.json({error:'workspaceId is required.'},{status:400});
    const {db,access}=await accessFor(request,workspaceId);
    if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
    if(!access.canManage)return NextResponse.json({error:'Workspace management permission is required.'},{status:403});
    const type=String(body.type||'');
    if(type==='rule'){
      const name=String(body.name||'').trim();
      const keywords=Array.isArray(body.keywords)?body.keywords.map((x:any)=>String(x).trim()).filter(Boolean):[];
      if(!name||!keywords.length)return NextResponse.json({error:'Rule name and at least one keyword are required.'},{status:400});
      const {data,error}=await db.from('crm_lead_rules').insert({
        workspace_id:workspaceId,name,keywords,score_delta:Number(body.score_delta||10),
        target_stage:body.target_stage||null,priority:Number(body.priority||100),active:body.active!==false
      }).select('*').single();
      if(error)throw error;return NextResponse.json({rule:data},{status:201});
    }
    if(type==='workflow'){
      const name=String(body.name||'').trim();
      const triggerType=String(body.trigger_type||'');
      const actions=Array.isArray(body.actions)?body.actions:[];
      if(!name||!triggers.includes(triggerType))return NextResponse.json({error:'Valid workflow name and trigger are required.'},{status:400});
      for(const action of actions){
        if(!actionTypes.includes(String(action?.type||'')))return NextResponse.json({error:'Unsupported workflow action: '+String(action?.type||'')},{status:400});
      }
      const {data,error}=await db.from('crm_workflows').insert({
        workspace_id:workspaceId,name,trigger_type:triggerType,trigger_config:body.trigger_config&&typeof body.trigger_config==='object'?body.trigger_config:{},actions,active:body.active!==false
      }).select('*').single();
      if(error)throw error;return NextResponse.json({workflow:data},{status:201});
    }
    return NextResponse.json({error:'Unknown automation type.'},{status:400});
  }catch(e){
    const m=e instanceof Error?e.message:'Unable to create automation.';
    return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});
  }
}

export async function PATCH(request:Request){
  try{
    const body=await request.json().catch(()=>({}));
    const workspaceId=String(body.workspaceId||'').trim();const id=String(body.id||'').trim();const type=String(body.type||'');
    if(!workspaceId||!id||!type)return NextResponse.json({error:'workspaceId, id and type are required.'},{status:400});
    const {db,access}=await accessFor(request,workspaceId);
    if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
    if(!access.canManage)return NextResponse.json({error:'Workspace management permission is required.'},{status:403});
    if(type==='rule'){
      const update:any={updated_at:new Date().toISOString()};
      if(body.name!==undefined)update.name=String(body.name||'').trim();
      if(body.keywords!==undefined)update.keywords=Array.isArray(body.keywords)?body.keywords.map((x:any)=>String(x).trim()).filter(Boolean):[];
      if(body.score_delta!==undefined)update.score_delta=Number(body.score_delta||0);
      if(body.target_stage!==undefined)update.target_stage=body.target_stage||null;
      if(body.active!==undefined)update.active=Boolean(body.active);
      const {data,error}=await db.from('crm_lead_rules').update(update).eq('id',id).eq('workspace_id',workspaceId).select('*').single();
      if(error)throw error;return NextResponse.json({rule:data});
    }
    if(type==='workflow'){
      const update:any={updated_at:new Date().toISOString()};
      if(body.name!==undefined)update.name=String(body.name||'').trim();
      if(body.active!==undefined)update.active=Boolean(body.active);
      if(body.trigger_config!==undefined)update.trigger_config=body.trigger_config||{};
      if(body.actions!==undefined)update.actions=Array.isArray(body.actions)?body.actions:[];
      const {data,error}=await db.from('crm_workflows').update(update).eq('id',id).eq('workspace_id',workspaceId).select('*').single();
      if(error)throw error;return NextResponse.json({workflow:data});
    }
    return NextResponse.json({error:'Unknown automation type.'},{status:400});
  }catch(e){
    const m=e instanceof Error?e.message:'Unable to update automation.';
    return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});
  }
}