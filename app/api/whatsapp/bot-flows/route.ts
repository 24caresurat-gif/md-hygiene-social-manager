import { NextResponse } from 'next/server';
import { jsonError, requireWhatsAppAccess, WhatsAppHttpError } from '../../../../lib/whatsapp-server';

const allowedTriggers=['keyword','new_conversation','button_reply','any_message'];

function cleanFlow(body:any,workspaceId:string,userId?:string){
  const name=String(body?.name||'').trim();
  if(!name)throw new WhatsAppHttpError('Flow name is required.',400);
  const defaultLocale=String(body?.default_locale||'en').trim();
  const locales=Array.isArray(body?.supported_locales)?body.supported_locales.map((x:any)=>String(x).trim()).filter(Boolean):[defaultLocale];
  if(!locales.includes(defaultLocale))locales.unshift(defaultLocale);
  const triggerType=String(body?.trigger_type||'keyword');
  if(!allowedTriggers.includes(triggerType))throw new WhatsAppHttpError('Invalid bot trigger.',400);
  const steps=Array.isArray(body?.steps)?body.steps:[];
  if(!steps.length)throw new WhatsAppHttpError('Add at least one bot step.',400);
  for(const step of steps){
    if(!step?.id||!['message','buttons','collect','product_suggestions','handoff'].includes(String(step?.type||'message')))
      throw new WhatsAppHttpError('Every bot step needs a valid id and type.',400);
  }
  return {
    workspace_id:workspaceId,name,description:body?.description?String(body.description):null,
    default_locale:defaultLocale,supported_locales:[...new Set(locales)],
    trigger_type:triggerType,
    trigger_config:body?.trigger_config&&typeof body.trigger_config==='object'?{
      ...body.trigger_config,
      after_hours_template_name:String(body.trigger_config.after_hours_template_name||'').trim()||null,
      after_hours_parameters:Array.isArray(body.trigger_config.after_hours_parameters)
        ?body.trigger_config.after_hours_parameters.map((x:any)=>String(x??''))
        :[],
    }:{},
    steps,fallback_message:body?.fallback_message&&typeof body.fallback_message==='object'?body.fallback_message:{},
    active:body?.active!==false,priority:Number(body?.priority||100),created_by:userId||null,updated_at:new Date().toISOString()
  };
}

export async function GET(request:Request){
  try{
    const workspaceId=new URL(request.url).searchParams.get('workspaceId')||'';
    const {db}=await requireWhatsAppAccess(request,workspaceId);
    const {data,error}=await db.from('whatsapp_bot_flows').select('*').eq('workspace_id',workspaceId).order('priority',{ascending:true}).order('created_at',{ascending:false});
    if(error)throw error;
    return NextResponse.json({flows:data||[]});
  }catch(e){return jsonError(e);}
}

export async function POST(request:Request){
  try{
    const body=await request.json();
    const workspaceId=String(body?.workspaceId||'');
    const {db,user}=await requireWhatsAppAccess(request,workspaceId,'can_manage');
    const row=cleanFlow(body,workspaceId,user.id);
    const {data,error}=await db.from('whatsapp_bot_flows').insert(row).select('*').single();
    if(error)throw error;
    return NextResponse.json({ok:true,flow:data},{status:201});
  }catch(e){return jsonError(e);}
}

export async function PATCH(request:Request){
  try{
    const body=await request.json();
    const workspaceId=String(body?.workspaceId||'');
    const id=String(body?.id||'');
    if(!id)throw new WhatsAppHttpError('Flow id is required.',400);
    const {db}=await requireWhatsAppAccess(request,workspaceId,'can_manage');
    const patch:any={updated_at:new Date().toISOString()};
    if(body.name!==undefined)patch.name=String(body.name||'').trim();
    if(body.description!==undefined)patch.description=body.description?String(body.description):null;
    if(body.default_locale!==undefined)patch.default_locale=String(body.default_locale||'en');
    if(body.supported_locales!==undefined)patch.supported_locales=Array.isArray(body.supported_locales)?body.supported_locales.map((x:any)=>String(x).trim()).filter(Boolean):['en'];
    if(body.trigger_type!==undefined)patch.trigger_type=String(body.trigger_type||'keyword');
    if(body.trigger_config!==undefined)patch.trigger_config=body.trigger_config&&typeof body.trigger_config==='object'?body.trigger_config:{};
    if(body.steps!==undefined)patch.steps=Array.isArray(body.steps)?body.steps:[];
    if(body.fallback_message!==undefined)patch.fallback_message=body.fallback_message&&typeof body.fallback_message==='object'?body.fallback_message:{};
    if(body.active!==undefined)patch.active=Boolean(body.active);
    if(body.priority!==undefined)patch.priority=Number(body.priority||100);
    const {data,error}=await db.from('whatsapp_bot_flows').update(patch).eq('id',id).eq('workspace_id',workspaceId).select('*').single();
    if(error)throw error;
    return NextResponse.json({ok:true,flow:data});
  }catch(e){return jsonError(e);}
}

export async function DELETE(request:Request){
  try{
    const body=await request.json().catch(()=>({}));
    const workspaceId=String(body?.workspaceId||'');const id=String(body?.id||'');
    if(!id)throw new WhatsAppHttpError('Flow id is required.',400);
    const {db}=await requireWhatsAppAccess(request,workspaceId,'can_manage');
    const {error}=await db.from('whatsapp_bot_flows').delete().eq('id',id).eq('workspace_id',workspaceId);
    if(error)throw error;
    return NextResponse.json({ok:true});
  }catch(e){return jsonError(e);}
}