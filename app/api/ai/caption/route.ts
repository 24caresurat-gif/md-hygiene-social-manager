import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
function adminDb(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}})}
async function getUser(req:NextRequest){const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');if(!token)return null;const c=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${token}`}}});const{data}=await c.auth.getUser(token);return data.user||null}
async function canCreate(db:ReturnType<typeof adminDb>,userId:string,brandId:string,accountIds:string[]){
  const {data:profile,error:profileError}=await db.from('profiles').select('role,active').eq('id',userId).maybeSingle();
  if(profileError)return profileError.message;
  if(!profile||profile.active===false)return 'Account is inactive.';

  const {data:brand,error:brandError}=await db.from('brands').select('id,user_id').eq('id',brandId).maybeSingle();
  if(brandError)return brandError.message;
  if(!brand)return 'Workspace not found.';

  const {data:membership,error:membershipError}=await db.from('workplace_members')
    .select('role,active').eq('user_id',userId).eq('workspace_id',brandId).maybeSingle();
  if(membershipError)return membershipError.message;

  const role=String(profile.role||'').toLowerCase();
  const globalAdmin=role==='admin'||role==='owner';
  const workspaceOwner=brand.user_id===userId;
  const memberRole=String(membership?.role||'').toLowerCase();
  const privileged=globalAdmin||workspaceOwner||(membership?.active===true&&['owner','admin'].includes(memberRole));
  if(!privileged&&membership?.active!==true)return 'You do not have access to this workspace.';

  const ids=[...new Set(accountIds.filter(Boolean))];
  if(!ids.length)return 'Select at least one social account.';
  const {data:allAccounts,error:accountError}=await db.from('social_accounts')
    .select('id,platform,brand_id,workspace_id,status')
    .in('id',ids)
    .or(`brand_id.eq.${brandId},workspace_id.eq.${brandId}`)
    .eq('status','connected');
  if(accountError)return accountError.message;
  if((allAccounts||[]).length!==ids.length)return 'One or more selected accounts are not connected to this workspace.';

  if(privileged)return null;
  const {data:permission,error:permissionError}=await db.from('workspace_member_permissions')
    .select('can_create').eq('workspace_id',brandId).eq('user_id',userId).eq('module','content').maybeSingle();
  if(permissionError)return permissionError.message;
  if(permission?.can_create!==true)return 'You do not have Create permission for Content.';
  return null;
}

export async function POST(req:NextRequest){try{const user=await getUser(req);if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});const body=await req.json().catch(()=>null);const brandId=String(body?.brandId||'');const accountIds=Array.isArray(body?.accountIds)?body.accountIds.map(String):[];const action=String(body?.action||'generate');const topic=String(body?.topic||'').trim();const current=String(body?.current||'').trim();const tone=String(body?.tone||'Professional').trim();const platform=String(body?.platform||'social media').trim();const language=String(body?.language||'English').trim();if(!brandId)return NextResponse.json({error:'brandId is required.'},{status:400});if(!topic&&!current)return NextResponse.json({error:'Topic or current caption is required.'},{status:400});if((topic||current).length>4000)return NextResponse.json({error:'Content is too long.'},{status:400});if(accountIds.length>20)return NextResponse.json({error:'Too many accounts selected.'},{status:400});if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:'AI is not configured. Add OPENAI_API_KEY to Vercel.'},{status:503});const db=adminDb();const accessError=await canCreate(db,user.id,brandId,accountIds);if(accessError)return NextResponse.json({error:accessError},{status:403});let task='Create a polished social media caption';let output='caption and hashtags';if(action==='rewrite'){task='Rewrite and improve the supplied caption while preserving its factual meaning';output='caption and hashtags'}else if(action==='hashtags'){task='Generate relevant, safe hashtags for the supplied topic/caption';output='hashtags'}else if(action==='ideas'){task='Generate five distinct social media post ideas';output='ideas'}const prompt=[task+'.',`Topic/product: ${topic||'Use supplied caption context'}`,current?`Current caption: ${current}`:'',`Platform: ${platform}`,`Tone: ${tone}`,`Language: ${language}`,'Brand voice: professional, trustworthy, clear, business-appropriate, never exaggerated.','Do not invent prices, offers, certifications, medical claims, contact details, or product specifications.','Return valid JSON only.',`Return keys appropriate for this task: ${output}.`].filter(Boolean).join('\n');const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_CAPTION_MODEL||'gpt-5-mini',input:prompt}),cache:'no-store'});const result=await response.json().catch(()=>({}));if(!response.ok)return NextResponse.json({error:result?.error?.message||'AI generation failed.'},{status:502});const text=String(result?.output_text||'').trim();let parsed:any={};try{parsed=JSON.parse(text)}catch{parsed=action==='ideas'?{ideas:[text]}:{caption:text,hashtags:[]}};const caption=String(parsed.caption||'').trim();const hashtags=Array.isArray(parsed.hashtags)?parsed.hashtags.map(String).filter(Boolean).slice(0,15):[];const ideas=Array.isArray(parsed.ideas)?parsed.ideas.map(String).filter(Boolean).slice(0,5):[];if(action==='hashtags')return NextResponse.json({hashtags,approvalRequired:true});if(action==='ideas')return NextResponse.json({ideas,approvalRequired:true});if(!caption)return NextResponse.json({error:'AI returned an empty caption.'},{status:502});return NextResponse.json({caption,hashtags,approvalRequired:true});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to generate AI content.'},{status:500})}}
