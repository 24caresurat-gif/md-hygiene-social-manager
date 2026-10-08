import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../lib/workspace-auth';

function normalize(value:string){return value.toLowerCase().replace(/\s+/g,' ').trim();}
function clamp(value:number){return Math.max(0,Math.min(100,value));}

async function ensureRules(db:any,workspaceId:string){
  const {data,error}=await db.from('crm_lead_rules').select('*').eq('workspace_id',workspaceId).order('priority',{ascending:true});
  if(error)throw error;
  if((data||[]).length)return data;
  const defaults=[
    {workspace_id:workspaceId,name:'Buying intent',keywords:['buy','purchase','order','book','need it'],score_delta:25,target_stage:'qualified',priority:10},
    {workspace_id:workspaceId,name:'Pricing intent',keywords:['price','pricing','cost','quote','quotation'],score_delta:20,target_stage:'qualified',priority:20},
    {workspace_id:workspaceId,name:'High intent',keywords:['urgent','today','asap','demo','interested'],score_delta:15,target_stage:'qualified',priority:30},
    {workspace_id:workspaceId,name:'Information request',keywords:['details','more info','information','available','tell me'],score_delta:8,target_stage:null,priority:40},
  ];
  const {data:created,error:createError}=await db.from('crm_lead_rules').insert(defaults).select('*');
  if(createError)throw createError;
  return created||[];
}

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>({}));
    const workspaceId=String(body.workspaceId||'').trim();
    const leadId=String(body.leadId||'').trim();
    const conversationId=String(body.conversationId||'').trim();
    let message=typeof body.message==='string'?body.message.trim():'';
    if(!workspaceId)return NextResponse.json({error:'workspaceId is required.'},{status:400});
    if(!leadId&&!conversationId&&!message)return NextResponse.json({error:'Provide leadId, conversationId or message.'},{status:400});

    const user=await authenticatedUser(request);
    const db=adminDb();
    const access=await workspaceAccess(db,user.id,workspaceId);
    if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});

    let lead:any=null;
    let contact:any=null;

    if(conversationId){
      const {data:conversation,error:conversationError}=await db.from('whatsapp_conversations')
        .select('id,phone,contact_id,contact_name').eq('id',conversationId).eq('workspace_id',workspaceId).maybeSingle();
      if(conversationError)throw conversationError;
      if(!conversation)return NextResponse.json({error:'Conversation not found.'},{status:404});
      if(!message){
        const {data:lastMessages,error:messageError}=await db.from('whatsapp_messages')
          .select('body').eq('conversation_id',conversationId).eq('workspace_id',workspaceId).eq('direction','inbound')
          .order('created_at',{ascending:false}).limit(10);
        if(messageError)throw messageError;
        message=(lastMessages||[]).map((m:any)=>m.body||'').filter(Boolean).reverse().join(' ');
      }
      const {data:existingContact,error:contactError}=await db.from('crm_contacts')
        .select('*').eq('workspace_id',workspaceId).eq('phone',conversation.phone).maybeSingle();
      if(contactError)throw contactError;
      if(existingContact)contact=existingContact;
      else{
        const {data:createdContact,error:createContactError}=await db.from('crm_contacts').insert({
          workspace_id:workspaceId,whatsapp_contact_id:conversation.contact_id||null,name:conversation.contact_name||null,
          phone:conversation.phone,source:'whatsapp',lifecycle_stage:'lead',status:'active',whatsapp_opt_in:false
        }).select('*').single();
        if(createContactError)throw createContactError;
        contact=createdContact;
      }
    }

    if(leadId){
      const {data:existingLead,error:leadError}=await db.from('crm_leads').select('*').eq('id',leadId).eq('workspace_id',workspaceId).maybeSingle();
      if(leadError)throw leadError;
      if(!existingLead)return NextResponse.json({error:'Lead not found.'},{status:404});
      lead=existingLead;
      if(!contact && lead.contact_id){
        const {data:c,error:cError}=await db.from('crm_contacts').select('*').eq('id',lead.contact_id).eq('workspace_id',workspaceId).maybeSingle();
        if(cError)throw cError;
        contact=c;
      }
    }else if(contact){
      const {data:existingLead,error:leadError}=await db.from('crm_leads').select('*')
        .eq('workspace_id',workspaceId).eq('contact_id',contact.id).in('stage',['new','qualified','proposal','negotiation'])
        .order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(leadError)throw leadError;
      lead=existingLead;
      if(!lead){
        const {data:newLead,error:newLeadError}=await db.from('crm_leads').insert({
          workspace_id:workspaceId,contact_id:contact.id,title:'WhatsApp enquiry',source:'whatsapp',stage:'new',score:0,value:0
        }).select('*').single();
        if(newLeadError)throw newLeadError;
        lead=newLead;
      }
    }else{
      const {data:newContact,error:newContactError}=await db.from('crm_contacts').insert({
        workspace_id:workspaceId,name:'New enquiry',source:'manual',lifecycle_stage:'lead',status:'active',whatsapp_opt_in:false
      }).select('*').single();
      if(newContactError)throw newContactError;
      contact=newContact;
      const {data:newLead,error:newLeadError}=await db.from('crm_leads').insert({
        workspace_id:workspaceId,contact_id:contact.id,title:'New enquiry',source:'manual',stage:'new',score:0,value:0
      }).select('*').single();
      if(newLeadError)throw newLeadError;
      lead=newLead;
    }

    const rules=await ensureRules(db,workspaceId);
    const text=normalize(message);
    let scoreDelta=0;
    let targetStage=lead.stage;
    const matched:string[]=[];
    for(const rule of rules||[]){
      const keywords=Array.isArray(rule.keywords)?rule.keywords:[];
      const hit=keywords.some((keyword:string)=>text.includes(normalize(keyword)));
      if(hit){
        scoreDelta+=Number(rule.score_delta||0);
        if(rule.target_stage)targetStage=String(rule.target_stage);
        matched.push(rule.name);
      }
    }
    if(text.length>120)scoreDelta+=5;
    const nextScore=clamp(Number(lead.score||0)+scoreDelta);
    if(nextScore>=70 && ['new'].includes(targetStage))targetStage='qualified';

    const patch:any={score:nextScore,stage:targetStage,updated_at:new Date().toISOString()};
    const notes=(lead.notes||'').trim();
    const qualificationNote='\n['+new Date().toISOString()+'] Qualification: +'+scoreDelta+' · matched: '+(matched.join(', ')||'baseline');
    patch.notes=(notes+qualificationNote).trim().slice(-5000);
    const {data:updated,error:updateError}=await db.from('crm_leads').update(patch).eq('id',lead.id).eq('workspace_id',workspaceId).select('*').single();
    if(updateError)throw updateError;

    if(contact){
      await db.from('crm_contacts').update({last_contacted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',contact.id).eq('workspace_id',workspaceId);
    }

    return NextResponse.json({success:true,lead:updated,contact,scoreDelta,matchedRules:matched});
  }catch(e){
    const m=e instanceof Error?e.message:'Unable to qualify lead.';
    return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});
  }
}