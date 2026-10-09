import { NextResponse } from 'next/server';
import { getActiveConnection, graphRequest, jsonError, requireWhatsAppAccess, WhatsAppHttpError } from '../../../../lib/whatsapp-server';

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>({}));
    const workspaceId=String(body.workspaceId||'');
    const conversationId=String(body.conversationId||'');
    const headerText=String(body.headerText||'').trim();
    const text=String(body.text||'').trim();
    const footer=String(body.footer||'').trim();
    const rawButtons=Array.isArray(body.buttons)?body.buttons:[];
    const {db,user}=await requireWhatsAppAccess(request,workspaceId,'can_publish');
    if(!conversationId)throw new WhatsAppHttpError('conversationId is required.',400);
    if(!text)throw new WhatsAppHttpError('Message text is required.',400);
    if(rawButtons.length<1||rawButtons.length>3)throw new WhatsAppHttpError('Add 1 to 3 reply buttons.',400);

    const buttons=rawButtons.map((b:any,i:number)=>{
      const id=String(b?.id||('button_'+(i+1))).trim().slice(0,256);
      const title=String(b?.title||'').trim().slice(0,20);
      if(!title)throw new WhatsAppHttpError('Every button needs a title.',400);
      return {type:'reply',reply:{id,title}};
    });

    const {data:conversation,error}=await db.from('whatsapp_conversations')
      .select('id,phone,contact_id,contact_name,customer_window_expires_at,connection_id')
      .eq('id',conversationId).eq('workspace_id',workspaceId).maybeSingle();
    if(error)throw error;
    if(!conversation)throw new WhatsAppHttpError('Conversation not found.',404);
    const connection=await getActiveConnection(db,workspaceId);
    if(!connection||connection.id!==conversation.connection_id)throw new WhatsAppHttpError('WhatsApp is not connected for this workspace. Open Settings.',412);

    const expiresAt=conversation.customer_window_expires_at?new Date(conversation.customer_window_expires_at).getTime():0;
    if(!expiresAt||expiresAt<=Date.now())throw new WhatsAppHttpError('The 24-hour customer service window is closed. Use an approved template.',409,'TEMPLATE_REQUIRED');

    const interactive:any={
      type:'button',
      body:{text},
      action:{buttons}
    };
    if(headerText)interactive.header={type:'text',text:headerText.slice(0,60)};
    if(footer)interactive.footer={text:footer.slice(0,60)};

    const now=new Date().toISOString();
    const {data:queued,error:insertError}=await db.from('whatsapp_messages').insert({
      workspace_id:workspaceId,connection_id:connection.id,conversation_id:conversation.id,contact_id:conversation.contact_id,
      direction:'outbound',type:'interactive',body:text,provider_status:'queued',
      metadata:{source:'button_conversation',interactive,buttons,headerText,footer},
      sent_by_user_id:user.id,created_at:now,updated_at:now
    }).select('id').single();
    if(insertError)throw insertError;

    try{
      const result=await graphRequest(encodeURIComponent(connection.phone_number_id||'')+'/messages',connection.access_token,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({messaging_product:'whatsapp',to:conversation.phone,type:'interactive',interactive})
      });
      const providerMessageId=result?.messages?.[0]?.id?String(result.messages[0].id):null;
      await db.from('whatsapp_messages').update({provider_message_id:providerMessageId,provider_status:'sent',updated_at:new Date().toISOString()}).eq('id',queued.id);
      await db.from('whatsapp_conversations').update({last_message_preview:text.slice(0,220),last_message_at:new Date().toISOString(),last_outbound_at:new Date().toISOString(),status:'open',updated_at:new Date().toISOString()}).eq('id',conversation.id);
      return NextResponse.json({success:true,messageId:queued.id,providerMessageId});
    }catch(e){
      await db.from('whatsapp_messages').update({provider_status:'failed',error_message:e instanceof Error?e.message:'Interactive send failed.',updated_at:new Date().toISOString()}).eq('id',queued.id);
      throw e;
    }
  }catch(e){return jsonError(e);}
}