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

function settingsDb(){const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!u||!k)throw Error('Server database configuration is missing.');return createClient(u,k,{auth:{autoRefreshToken:false,persistSession:false}})}

export async function POST(request:Request){
 try{
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)return NextResponse.json({error:'Authentication required.'},{status:401});
  const body=await request.json().catch(()=>({})),responseId=String(body.responseId||'').trim();
  if(!responseId)return NextResponse.json({error:'responseId is required.'},{status:400});
  const client=publicDb(token),user=await client.auth.getUser(token);
  if(user.error||!user.data.user)return NextResponse.json({error:'Invalid session.'},{status:401});
  const db=adminDb();
  const response=await db.from('feedback_responses').select('id,workspace_id,form_id,customer_name,rating,answers').eq('id',responseId).maybeSingle();
  if(response.error)throw response.error;
  if(!response.data)return NextResponse.json({error:'Feedback response not found.'},{status:404});
  const member=await db.from('workplace_members').select('role,active').eq('workspace_id',response.data.workspace_id).eq('user_id',user.data.user.id).eq('active',true).maybeSingle();
  if(member.error)throw member.error;
  if(!member.data||!['owner','admin','manager'].includes(String(member.data.role||'').toLowerCase()))return NextResponse.json({error:'Only workspace managers can generate response suggestions.'},{status:403});
  const kw=await db.from('workspace_keywords').select('keyword').eq('workspace_id',response.data.workspace_id).eq('active',true).limit(30);
  if(kw.error)throw kw.error;
  const keywords=(kw.data||[]).map((x:any)=>String(x.keyword||'').trim()).filter(Boolean);
  const settings=await settingsDb().from('workspace_review_settings').select('ai_enabled,ai_business_name,ai_business_context,ai_services,ai_tone,ai_signature').eq('workspace_id',response.data.workspace_id).maybeSingle();
  if(settings.error)throw settings.error;
const business:any=settings.data||{};
  const businessContext=business.ai_enabled?('Business name: '+String(business.ai_business_name||'')+'. Services/focus: '+String(business.ai_services||'')+'. Verified business context: '+String(business.ai_business_context||'')+'. Tone: '+String(business.ai_tone||'Warm, professional, concise')+'. Preferred sign-off: '+String(business.ai_signature||'')):''; 
  const customer=String(response.data.customer_name||'Customer'),rating=response.data.rating==null?'unknown':String(response.data.rating);
  const answerText=JSON.stringify(response.data.answers||{}).slice(0,5000);
  let content='',model='template-fallback';
  const apiKey=process.env.OPENAI_API_KEY;
  if(apiKey){
   const requested=process.env.OPENAI_REVIEW_MODEL||'gpt-5.6-luna';
   const prompt='Draft one concise, warm, professional business response to customer feedback. Do not invent facts, offers, remedies, policies, or promises. Do not mention AI. Keep under 450 characters. Customer: '+customer+'. Rating: '+rating+'/5. Answers: '+answerText+'. '+businessContext+' Preferred business keywords, only when natural: '+(keywords.join(', ')||'none')+'.';
   const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:requested,input:[{role:'developer',content:'You draft customer-facing business responses to feedback.'},{role:'user',content:prompt}],max_output_tokens:180,store:false}),cache:'no-store'});
   const data=await r.json().catch(()=>({}));
   if(!r.ok||data?.error)throw Error(data?.error?.message||'AI suggestion generation failed.');
   content=String(data?.output_text||'').trim();model=requested;if(business.ai_enabled&&String(business.ai_signature||'').trim()&&!content.includes(String(business.ai_signature).trim()))content=(content+'\n\n'+String(business.ai_signature).trim()).trim();
   if(!content)throw Error('AI returned an empty suggestion.');
  }else{
   const first=customer.split(/\s+/)[0]||'there';
   content=Number(response.data.rating||0)>=4?'Hi '+first+', thank you for sharing your feedback. We really appreciate your kind words and look forward to serving you again.':'Hi '+first+', thank you for sharing your feedback. We appreciate the details and will use them to improve the customer experience.';
  }
  const saved=await db.from('ai_review_suggestions').insert({workspace_id:response.data.workspace_id,response_id:response.data.id,suggestion_type:'review',content,model,approved:false}).select('id,content,model,created_at').single();
  if(saved.error)throw saved.error;
  return NextResponse.json({ok:true,suggestion:saved.data});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to generate feedback suggestion.'},{status:500})}
}
