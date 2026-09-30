import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

function publicDb(token:string){
 const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!u||!k)throw Error('Supabase configuration is missing.');
 return createClient(u,k,{global:{headers:{Authorization:'Bearer '+token}}});
}
function adminDb(){
 const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!u||!k)throw Error('Server database configuration is missing.');
 return createClient(u,k,{auth:{autoRefreshToken:false,persistSession:false}});
}
async function auth(request:Request){
 const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!token)throw Error('Authentication required.');
 const client=publicDb(token),u=await client.auth.getUser(token);
 if(u.error||!u.data.user)throw Error('Invalid session.');
 return u.data.user;
}
async function access(workspaceId:string,userId:string){
 const db=adminDb();
 const w=await db.from('workspaces').select('id,owner_user_id').eq('id',workspaceId).maybeSingle();
 if(w.error)throw w.error;if(!w.data)return {exists:false,allowed:false};
 if(w.data.owner_user_id===userId)return {exists:true,allowed:true};
 const m=await db.from('workplace_members').select('role,active').eq('workspace_id',workspaceId).eq('user_id',userId).eq('active',true).maybeSingle();
 if(m.error)throw m.error;
 return {exists:true,allowed:Boolean(m.data&&['owner','admin'].includes(String(m.data.role||'').toLowerCase()))};
}
const defaults={
 negative_protection_enabled:true,
 negative_protection_threshold:2,
 negative_protection_message:'Your feedback will be reviewed privately by our team. You can still choose to share your experience publicly on Google after submitting.',
 ai_enabled:true,
 ai_business_name:'',
 ai_business_context:'',
 ai_services:'',
 ai_tone:'Warm, professional, concise',
 ai_signature:''
};

export async function GET(request:Request){
 try{
  const user=await auth(request),workspaceId=new URL(request.url).searchParams.get('workspace_id')?.trim()||'';
  if(!workspaceId)return NextResponse.json({error:'workspace_id is required.'},{status:400});
  const a=await access(workspaceId,user.id);if(!a.exists)return NextResponse.json({error:'Workspace not found.'},{status:404});if(!a.allowed)return NextResponse.json({error:'Only the workspace owner or admin can manage review protection and AI settings.'},{status:403});
  const db=adminDb(),r=await db.from('workspace_review_settings').select('workspace_id,negative_protection_enabled,negative_protection_threshold,negative_protection_message,ai_enabled,ai_business_name,ai_business_context,ai_services,ai_tone,ai_signature,created_at,updated_at').eq('workspace_id',workspaceId).maybeSingle();
  if(r.error)throw r.error;
  return NextResponse.json({settings:r.data?{...defaults,...r.data}:{...defaults,workspace_id:workspaceId}});
 }catch(e){const m=e instanceof Error?e.message:'Unable to load review settings.';return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500})}
}

export async function PATCH(request:Request){
 try{
  const user=await auth(request),body=await request.json().catch(()=>({})),workspaceId=String(body.workspace_id||'').trim();
  if(!workspaceId)return NextResponse.json({error:'workspace_id is required.'},{status:400});
  const a=await access(workspaceId,user.id);if(!a.exists)return NextResponse.json({error:'Workspace not found.'},{status:404});if(!a.allowed)return NextResponse.json({error:'Only the workspace owner or admin can manage review protection and AI settings.'},{status:403});
  const threshold=Math.trunc(Number(body.negative_protection_threshold));
  if(!Number.isInteger(threshold)||threshold<1||threshold>4)return NextResponse.json({error:'Negative protection threshold must be between 1 and 4.'},{status:400});
  const clean=(v:unknown,max:number)=>String(v??'').trim().slice(0,max);
  const payload={
   workspace_id:workspaceId,
   negative_protection_enabled:Boolean(body.negative_protection_enabled),
   negative_protection_threshold:threshold,
   negative_protection_message:clean(body.negative_protection_message,500)||defaults.negative_protection_message,
   ai_enabled:Boolean(body.ai_enabled),
   ai_business_name:clean(body.ai_business_name,160)||null,
   ai_business_context:clean(body.ai_business_context,3000)||null,
   ai_services:clean(body.ai_services,1200)||null,
   ai_tone:clean(body.ai_tone,240)||defaults.ai_tone,
   ai_signature:clean(body.ai_signature,160)||null,
   updated_at:new Date().toISOString()
  };
  const db=adminDb(),r=await db.from('workspace_review_settings').upsert(payload,{onConflict:'workspace_id'}).select('workspace_id,negative_protection_enabled,negative_protection_threshold,negative_protection_message,ai_enabled,ai_business_name,ai_business_context,ai_services,ai_tone,ai_signature,created_at,updated_at').single();
  if(r.error)throw r.error;
  return NextResponse.json({ok:true,settings:r.data});
 }catch(e){const m=e instanceof Error?e.message:'Unable to save review settings.';return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500})}
}
