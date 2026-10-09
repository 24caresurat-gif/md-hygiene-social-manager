import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../lib/workspace-auth';

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>({}));
    const workspaceId=String(body.workspaceId||'').trim();
    if(!workspaceId)return NextResponse.json({error:'workspaceId is required.'},{status:400});
    const user=await authenticatedUser(request);
    const db=adminDb();
    const access=await workspaceAccess(db,user.id,workspaceId);
    if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
    if(!access.canManage)return NextResponse.json({error:'Workspace management permission is required.'},{status:403});

    const {data:waContacts,error:waError}=await db.from('whatsapp_contacts')
      .select('id,name,phone,active').eq('workspace_id',workspaceId).eq('active',true).order('created_at',{ascending:false});
    if(waError)throw waError;

    const phones=(waContacts||[]).map((c:any)=>String(c.phone||'').trim()).filter(Boolean);
    const {data:existing,error:existingError}=await db.from('crm_contacts')
      .select('id,phone,name,email,company,source,lifecycle_stage,whatsapp_contact_id')
      .eq('workspace_id',workspaceId);
    if(existingError)throw existingError;
    const existingByPhone=new Map((existing||[]).filter((c:any)=>c.phone).map((c:any)=>[String(c.phone).trim(),c]));

    let created=0,linked=0,updated=0;
    for(const wa of waContacts||[]){
      const phone=String(wa.phone||'').trim();
      if(!phone)continue;
      const current=existingByPhone.get(phone);
      if(!current){
        const {error}=await db.from('crm_contacts').insert({
          workspace_id:workspaceId,whatsapp_contact_id:wa.id,name:wa.name||null,phone,
          source:'whatsapp',lifecycle_stage:'lead',status:'active',whatsapp_opt_in:false,
        });
        if(error)throw error;
        created++;
      }else{
        const patch:any={whatsapp_contact_id:wa.id,updated_at:new Date().toISOString()};
        if(!current.name && wa.name)patch.name=wa.name;
        const {error}=await db.from('crm_contacts').update(patch).eq('id',current.id).eq('workspace_id',workspaceId);
        if(error)throw error;
        linked++;
        if(!current.name && wa.name)updated++;
      }
    }
    return NextResponse.json({success:true,total:phones.length,created,linked,updated});
  }catch(e){
    const m=e instanceof Error?e.message:'Unable to sync WhatsApp contacts into CRM.';
    return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});
  }
}