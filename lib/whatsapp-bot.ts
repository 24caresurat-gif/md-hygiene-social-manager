import type { SupabaseClient } from '@supabase/supabase-js';
import { graphRequest, WhatsAppHttpError } from './whatsapp-server';

type BotFlow = {
  id:string;
  workspace_id:string;
  name:string;
  default_locale:string;
  supported_locales:string[];
  trigger_type:string;
  trigger_config:any;
  steps:any[];
  fallback_message:any;
  active:boolean;
  priority:number;
};

function normalize(value:string){return value.toLowerCase().replace(/\s+/g,' ').trim();}

export function detectLocale(text:string, supported:string[], fallback:string){
  const value=String(text||'');
  if(/[\u0A80-\u0AFF]/.test(value) && supported.includes('gu'))return 'gu';
  if(/[\u0900-\u097F]/.test(value) && supported.includes('hi'))return 'hi';
  const lowered=normalize(value);
  if(/\b(hola|gracias|precio|comprar)\b/.test(lowered) && supported.includes('es'))return 'es';
  return supported.includes(fallback)?fallback:(supported[0]||'en');
}

export function localized(value:any,locale:string,fallback='en'){
  if(typeof value==='string')return value;
  if(!value||typeof value!=='object')return '';
  return String(value[locale] ?? value[fallback] ?? value[Object.keys(value)[0]] ?? '');
}

export function interpolate(text:string,variables:any){
  return String(text||'').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,(_,key)=>{
    const parts=String(key).split('.');
    let value=variables||{};
    for(const part of parts)value=value?.[part];
    return value==null?'':String(value);
  });
}

function findStep(flow:BotFlow,stepId:string|null|undefined){
  return (flow.steps||[]).find((step:any)=>String(step?.id||'')===String(stepId||'')) || null;
}

function firstStep(flow:BotFlow){
  return (flow.steps||[])[0] || null;
}

function nextStepAfter(flow:BotFlow,step:any){
  if(step?.next_step_id)return String(step.next_step_id);
  const idx=(flow.steps||[]).findIndex((x:any)=>String(x?.id||'')===String(step?.id||''));
  if(idx>=0 && idx+1<(flow.steps||[]).length)return String(flow.steps[idx+1].id);
  return null;
}

async function sendPayload(db:SupabaseClient,connection:any,conversation:any,contactId:string|null,payload:any,storedBody:string,type='text'){
  const now=new Date().toISOString();
  const {data:queued,error:insertError}=await db.from('whatsapp_messages').insert({
    workspace_id:conversation.workspace_id,
    connection_id:connection.id,
    conversation_id:conversation.id,
    contact_id:contactId,
    direction:'outbound',
    type,
    body:storedBody,
    provider_status:'queued',
    metadata:{source:'bot'},
    template_parameters:[],
    created_at:now,
    updated_at:now
  }).select('id').single();
  if(insertError)throw insertError;

  try{
    const result=await graphRequest(encodeURIComponent(connection.phone_number_id||'')+'/messages',connection.access_token,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const providerMessageId=result?.messages?.[0]?.id?String(result.messages[0].id):null;
    await db.from('whatsapp_messages').update({provider_message_id:providerMessageId,provider_status:'sent',updated_at:new Date().toISOString()}).eq('id',queued.id);
    await db.from('whatsapp_conversations').update({
      last_message_preview:storedBody.slice(0,220),
      last_message_at:new Date().toISOString(),
      last_outbound_at:new Date().toISOString(),
      status:'open',
      updated_at:new Date().toISOString()
    }).eq('id',conversation.id);
    return providerMessageId;
  }catch(e){
    await db.from('whatsapp_messages').update({
      provider_status:'failed',
      error_message:e instanceof Error?e.message:'Bot send failed.',
      updated_at:new Date().toISOString()
    }).eq('id',queued.id);
    throw e;
  }
}

async function sendStep(db:SupabaseClient,connection:any,conversation:any,contactId:string|null,flow:BotFlow,step:any,locale:string,variables:any){
  const type=String(step?.type||'message');
  if(type==='handoff'){
    const text=interpolate(localized(step?.message,locale,flow.default_locale),variables) || interpolate(localized(flow.fallback_message,locale,flow.default_locale),variables);
    if(text){
      await sendPayload(db,connection,conversation,contactId,{messaging_product:'whatsapp',to:conversation.phone,type:'text',text:{body:text,preview_url:false}},text,'text');
    }
    return {nextStepId:null,status:'handoff',lastBotMessage:text};
  }

  if(type==='product_suggestions'){
    const q=interpolate(String(step?.query||''),variables).trim().toLowerCase();
    const {data:products,error}=await db.from('catalog_products')
      .select('name,price,compare_at_price,description,featured,stock_quantity,catalog_categories(name)')
      .eq('workspace_id',conversation.workspace_id).eq('active',true)
      .order('featured',{ascending:false}).order('created_at',{ascending:false}).limit(50);
    if(error)throw error;
    const terms=q.split(/\s+/).filter(Boolean);
    const matches=(products||[]).map((p:any)=>{
      const hay=[p.name,p.description,p.catalog_categories?.name].filter(Boolean).join(' ').toLowerCase();
      const score=terms.filter((t:string)=>hay.includes(t)).length*10+(p.featured?2:0)+(Number(p.stock_quantity||0)>0?3:0);
      return {...p,_score:score};
    }).filter((p:any)=>!terms.length||p._score>0).sort((a:any,b:any)=>b._score-a._score).slice(0,3);
    const intro=interpolate(localized(step?.message,locale,flow.default_locale),variables);
    const lines=matches.length
      ? matches.map((p:any)=>'• '+p.name+' — ₹'+Number(p.price||0).toFixed(2)).join('\n')
      : (interpolate(localized(step?.empty_message,locale,flow.default_locale),variables)||'No matching products right now.');
    const text=[intro,lines].filter(Boolean).join('\n\n');
    await sendPayload(db,connection,conversation,contactId,{messaging_product:'whatsapp',to:conversation.phone,type:'text',text:{body:text,preview_url:false}},text,'text');
    return {nextStepId:nextStepAfter(flow,step),status:'active',lastBotMessage:text};
  }

  if(type==='buttons'){
    const text=interpolate(localized(step?.message,locale,flow.default_locale),variables);
    const buttons=(Array.isArray(step?.buttons)?step.buttons:[]).slice(0,3).map((button:any,index:number)=>{
      const id=String(button?.id||('btn_'+(index+1))).slice(0,256);
      const title=interpolate(localized(button?.title,locale,flow.default_locale),variables).slice(0,20);
      return {type:'reply',reply:{id,title}};
    }).filter((button:any)=>button.reply.title);
    if(!text||!buttons.length)throw new WhatsAppHttpError('Bot button step is incomplete.',500);
    const interactive:any={type:'button',body:{text},action:{buttons}};
    const header=interpolate(localized(step?.header,locale,flow.default_locale),variables);
    const footer=interpolate(localized(step?.footer,locale,flow.default_locale),variables);
    if(header)interactive.header={type:'text',text:header.slice(0,60)};
    if(footer)interactive.footer={text:footer.slice(0,60)};
    await sendPayload(db,connection,conversation,contactId,{messaging_product:'whatsapp',to:conversation.phone,type:'interactive',interactive},text,'interactive');
    return {nextStepId:null,status:'active',lastBotMessage:text};
  }

  const text=interpolate(localized(step?.message,locale,flow.default_locale),variables);
  if(!text)throw new WhatsAppHttpError('Bot message step has no localized message.',500);
  await sendPayload(db,connection,conversation,contactId,{messaging_product:'whatsapp',to:conversation.phone,type:'text',text:{body:text,preview_url:false}},text,'text');
  return {nextStepId:nextStepAfter(flow,step),status:'active',lastBotMessage:text};
}

export async function processBotIncoming(args:{
  db:SupabaseClient; connection:any; conversation:any; contactId:string|null; text:string; buttonReplyId?:string|null; contactName?:string|null;
}){
  const {db,connection,conversation,contactId,text,buttonReplyId}=args;
  const incomingText=String(text||'').trim();
  const {data:session,error:sessionError}=await db.from('whatsapp_bot_sessions').select('*').eq('conversation_id',conversation.id).maybeSingle();
  if(sessionError)throw sessionError;

  let currentFlow:BotFlow|null=null;
  let currentSession:any=session;

  if(session && session.status==='active'){
    const {data:flow,error:flowError}=await db.from('whatsapp_bot_flows').select('*').eq('id',session.flow_id).eq('workspace_id',conversation.workspace_id).eq('active',true).maybeSingle();
    if(flowError)throw flowError;
    currentFlow=flow;
  }

  if(!currentFlow){
    const {data:flows,error:flowsError}=await db.from('whatsapp_bot_flows').select('*').eq('workspace_id',conversation.workspace_id).eq('active',true)
      .order('priority',{ascending:true}).order('created_at',{ascending:true});
    if(flowsError)throw flowsError;
    const normalized=normalize(incomingText);
    currentFlow=(flows||[]).find((flow:any)=>{
      const keywords=Array.isArray(flow?.trigger_config?.keywords)?flow.trigger_config.keywords.map((v:any)=>normalize(String(v))):[];
      if(flow.trigger_type==='any_message')return true;
      if(flow.trigger_type==='new_conversation')return !session || ['completed','handoff'].includes(String(session?.status||''));
      if(flow.trigger_type==='button_reply')return !!buttonReplyId && (Array.isArray(flow?.trigger_config?.button_ids)?flow.trigger_config.button_ids.map((v:any)=>String(v)).includes(String(buttonReplyId)):false);
      return keywords.some((keyword:string)=>keyword && normalized.includes(keyword));
    }) || null;
  }

  if(!currentFlow)return {handled:false,status:'ignored'};

  const windowOpen=conversation.customer_window_expires_at&&new Date(conversation.customer_window_expires_at).getTime()>Date.now();
  if(!windowOpen){
    await db.from('whatsapp_bot_events').insert({
      workspace_id:conversation.workspace_id,conversation_id:conversation.id,flow_id:currentFlow.id,session_id:currentSession?.id||null,
      event_type:'template_required',payload:{reason:'24-hour customer service window is closed'}
    });
    return {handled:true,status:'template_required',flow:currentFlow};
  }

  const supported=Array.isArray(currentFlow.supported_locales)&&currentFlow.supported_locales.length?currentFlow.supported_locales:['en'];
  const locale=currentSession?.locale || detectLocale(incomingText,supported,currentFlow.default_locale||supported[0]||'en');
  const variables={...(currentSession?.variables||{})};

  const isNewSession=!currentSession;
  if(isNewSession){
    const first=firstStep(currentFlow);
    if(!first)return {handled:false,status:'empty_flow'};
    const {data:newSession,error:createError}=await db.from('whatsapp_bot_sessions').insert({
      workspace_id:conversation.workspace_id,flow_id:currentFlow.id,conversation_id:conversation.id,contact_id:contactId,
      locale,current_step_id:first.id,variables,status:'active',last_user_message:incomingText,last_interaction_at:new Date().toISOString()
    }).select('*').single();
    if(createError)throw createError;
    currentSession=newSession;
  }

  const step=findStep(currentFlow,currentSession.current_step_id) || firstStep(currentFlow);
  let targetStep=step;
  let nextStepId: string|null = null;
  let status='active';
  let lastBotMessage='';

  if(step && String(step.type||'message')==='buttons' && buttonReplyId){
    const button=(Array.isArray(step.buttons)?step.buttons:[]).find((b:any)=>String(b?.id||'')===String(buttonReplyId));
    if(button){
      variables[String(step?.variable_name||'selected_option')]=buttonReplyId;
      targetStep=findStep(currentFlow,button.next_step_id)||null;
    }
  }else if(step && String(step.type||'collect')==='collect'){
    const variable=String(step.variable_name||'answer').trim();
    if(variable)variables[variable]=incomingText;
    targetStep=findStep(currentFlow,step.next_step_id)||findStep(currentFlow,nextStepAfter(currentFlow,step))||null;
  }else if(step && !isNewSession){
    targetStep=findStep(currentFlow,nextStepAfter(currentFlow,step));
  }

  if(!targetStep){
    status='completed';
    nextStepId=null;
  }else{
    const sent=await sendStep(db,connection,conversation,contactId,currentFlow,targetStep,locale,variables);
    nextStepId=sent.nextStepId;
    status=sent.status;
    lastBotMessage=sent.lastBotMessage||'';
  }

  const finalStepId=nextStepId || (targetStep ? String(targetStep.id) : null);
  const {data:updated,error:updateError}=await db.from('whatsapp_bot_sessions').update({
    current_step_id:finalStepId,
    variables,
    locale,
    status,
    last_user_message:incomingText,
    last_bot_message:lastBotMessage||currentSession.last_bot_message||null,
    last_interaction_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  }).eq('id',currentSession.id).select('*').single();
  if(updateError)throw updateError;

  await db.from('whatsapp_bot_events').insert({
    workspace_id:conversation.workspace_id,conversation_id:conversation.id,flow_id:currentFlow.id,session_id:updated.id,
    event_type:'inbound_processed',
    payload:{text:incomingText,buttonReplyId,locale,nextStepId,status}
  });

  return {handled:true,status,flow:currentFlow,session:updated,locale};
}
