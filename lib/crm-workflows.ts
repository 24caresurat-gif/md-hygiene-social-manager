import { getActiveConnection, graphRequest } from './whatsapp-server';

export async function executeCrmWorkflow(db:any, workflow:any, workspaceId:string, lead:any){
  const results:any[]=[];
  let failed=false;
  for(const action of Array.isArray(workflow.actions)?workflow.actions:[]){
    const type=String(action?.type||'');
    const config=action?.config&&typeof action.config==='object'?action.config:{};
    try{
      if(type==='create_task'){
        const dueMinutes=Number(config.due_minutes||0);
        const dueAt=dueMinutes>0?new Date(Date.now()+dueMinutes*60000).toISOString():(config.due_at?String(config.due_at):null);
        const {data,error}=await db.from('crm_tasks').insert({
          workspace_id:workspaceId,
          contact_id:lead.contact_id||null,
          lead_id:lead.id,
          title:String(config.title||('Follow up: '+lead.title)),
          description:config.description?String(config.description):null,
          task_type:String(config.task_type||'follow_up'),
          priority:String(config.priority||'normal'),
          status:'open',
          assigned_user_id:config.assigned_user_id||null,
          due_at:dueAt,
        }).select('id').single();
        if(error)throw error;
        results.push({type,task_id:data.id});
        continue;
      }

      if(type==='set_stage'){
        const stage=String(config.stage||'');
        if(!['new','qualified','proposal','negotiation','won','lost'].includes(stage))throw new Error('Invalid stage in workflow action.');
        const {error}=await db.from('crm_leads').update({stage,updated_at:new Date().toISOString()}).eq('id',lead.id).eq('workspace_id',workspaceId);
        if(error)throw error;
        lead.stage=stage;
        results.push({type,stage});
        continue;
      }

      if(type==='suggest_products'){
        const query=String(config.query||lead.title||'').trim().toLowerCase();
        const {data:products,error}=await db.from('catalog_products')
          .select('id,name,description,price,compare_at_price,featured,stock_quantity,catalog_categories(name)')
          .eq('workspace_id',workspaceId).eq('active',true).order('featured',{ascending:false}).order('created_at',{ascending:false}).limit(50);
        if(error)throw error;
        const terms=query.split(/\s+/).filter(Boolean);
        const suggestions=(products||[]).map((p:any)=>{
          const hay=[p.name,p.description,p.catalog_categories?.name].filter(Boolean).join(' ').toLowerCase();
          const matches=terms.filter((t:string)=>hay.includes(t)).length;
          return {...p,_score:matches*10+(p.featured?2:0)+(Number(p.stock_quantity||0)>0?3:0)};
        }).filter((p:any)=>!terms.length||p._score>0).sort((a:any,b:any)=>b._score-a._score).slice(0,5)
          .map(({_score,...p}:any)=>p);
        results.push({type,suggestions});
        continue;
      }

      if(type==='send_whatsapp_template'){
        const templateName=String(config.template_name||'').trim();
        if(!templateName)throw new Error('template_name is required.');
        if(!lead.contact_id)throw new Error('Lead has no CRM contact.');
        const {data:contact,error:contactError}=await db.from('crm_contacts').select('phone,name,whatsapp_contact_id').eq('id',lead.contact_id).eq('workspace_id',workspaceId).maybeSingle();
        if(contactError)throw contactError;
        if(!contact?.phone)throw new Error('CRM contact has no phone number.');
        const {data:conversation,error:conversationError}=await db.from('whatsapp_conversations')
          .select('id,phone,connection_id').eq('workspace_id',workspaceId).eq('phone',contact.phone).order('updated_at',{ascending:false}).limit(1).maybeSingle();
        if(conversationError)throw conversationError;
        const connection=await getActiveConnection(db,workspaceId);
        if(!conversation||!connection||conversation.connection_id!==connection.id)throw new Error('WhatsApp connection/conversation is not available.');
        const {data:template,error:templateError}=await db.from('whatsapp_templates')
          .select('name,language,status').eq('workspace_id',workspaceId).eq('name',templateName).eq('status','APPROVED').maybeSingle();
        if(templateError)throw templateError;
        if(!template)throw new Error('Approved WhatsApp template not found.');
        const params=Array.isArray(config.parameters)?config.parameters.map((x:any)=>({type:'text',text:String(x??'')})):[];
        const payload={messaging_product:'whatsapp',to:contact.phone,type:'template',template:{name:template.name,language:{code:template.language},...(params.length?{components:[{type:'body',parameters:params}]}:{})}};
        const graphResult=await graphRequest(encodeURIComponent(connection.phone_number_id||'')+'/messages',connection.access_token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        results.push({type,provider_message_id:graphResult?.messages?.[0]?.id||null});
        continue;
      }

      throw new Error('Unsupported workflow action: '+type);
    }catch(e){
      failed=true;
      results.push({type,error:e instanceof Error?e.message:'Workflow action failed.'});
    }
  }
  return {status:failed?'failed':'completed',results};
}
