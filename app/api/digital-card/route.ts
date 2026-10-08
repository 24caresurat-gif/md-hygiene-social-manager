import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../lib/workspace-auth';
async function accessFor(request:Request,workspaceId:string){const user=await authenticatedUser(request);const db=adminDb();const access=await workspaceAccess(db,user.id,workspaceId);return {db,access};}
export async function GET(request:Request){
 try{const workspaceId=String(new URL(request.url).searchParams.get('workspaceId')||'').trim();if(!workspaceId)return NextResponse.json({error:'workspaceId is required.'},{status:400});const {db,access}=await accessFor(request,workspaceId);if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
 const {data:card,error:e}=await db.from('digital_cards').select('*').eq('workspace_id',workspaceId).maybeSingle();if(e)throw e;
 if(!card)return NextResponse.json({workspaceId,card:null,contacts:[],socialLinks:[],services:[],testimonials:[],embeds:[],payments:[],access:{role:access.role,canManage:access.canManage}});
 const [c,s,sv,t,e2,p]=await Promise.all([
  db.from('digital_card_contacts').select('*').eq('digital_card_id',card.id).order('sort_order'),
  db.from('digital_card_social_links').select('*').eq('digital_card_id',card.id).order('sort_order'),
  db.from('digital_card_services').select('*').eq('digital_card_id',card.id).order('sort_order'),
  db.from('digital_card_testimonials').select('*').eq('digital_card_id',card.id).order('sort_order'),
  db.from('digital_card_embeds').select('*').eq('digital_card_id',card.id).order('sort_order'),
  db.from('digital_card_payments').select('*').eq('digital_card_id',card.id).order('created_at')
 ]);
 for(const x of [c,s,sv,t,e2,p])if(x.error)throw x.error;
 return NextResponse.json({workspaceId,card,contacts:c.data||[],socialLinks:s.data||[],services:sv.data||[],testimonials:t.data||[],embeds:e2.data||[],payments:p.data||[],access:{role:access.role,canManage:access.canManage}});
 }catch(e){const m=e instanceof Error?e.message:'Unable to load digital card.';return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});}
}
export async function PATCH(request:Request){
 try{const body=await request.json().catch(()=>({}));const workspaceId=String(body.workspaceId||'').trim();if(!workspaceId)return NextResponse.json({error:'workspaceId is required.'},{status:400});const {db,access}=await accessFor(request,workspaceId);if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});if(!access.canManage)return NextResponse.json({error:'Workspace management permission is required.'},{status:403});
 const base={workspace_id:workspaceId,full_name:body.full_name?String(body.full_name):null,business_name:body.business_name?String(body.business_name):null,bio:body.bio?String(body.bio):null,profile_picture_url:body.profile_picture_url?String(body.profile_picture_url):null,cover_image_url:body.cover_image_url?String(body.cover_image_url):null,logo_url:body.logo_url?String(body.logo_url):null,profile_slug:body.profile_slug?String(body.profile_slug).toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,''):null,about_us:body.about_us?String(body.about_us):null,offline_content:body.offline_content?String(body.offline_content):null,embed_content:body.embed_content?String(body.embed_content):null,lead_capture_enabled:body.lead_capture_enabled!==false,contact_form_enabled:body.contact_form_enabled!==false,payment_url:body.payment_url?String(body.payment_url):null,updated_at:new Date().toISOString()};
 const {data:card,error}=await db.from('digital_cards').upsert(base,{onConflict:'workspace_id'}).select().single();if(error)throw error;
 const childTables=[['digital_card_contacts',body.contacts],['digital_card_social_links',body.socialLinks],['digital_card_services',body.services],['digital_card_testimonials',body.testimonials],['digital_card_embeds',body.embeds],['digital_card_payments',body.payments]] as const;
 for(const [table,items] of childTables){if(!Array.isArray(items))continue;const {error:delError}=await db.from(table).delete().eq('digital_card_id',card.id);if(delError)throw delError;if(items.length){const rows=items.map((x:any,i:number)=>({...x,digital_card_id:card.id,sort_order:Number(x.sort_order??i)}));const {error:insError}=await db.from(table).insert(rows);if(insError)throw insError;}}
 return NextResponse.json({card});
 }catch(e){const m=e instanceof Error?e.message:'Unable to save digital card.';return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});}
}