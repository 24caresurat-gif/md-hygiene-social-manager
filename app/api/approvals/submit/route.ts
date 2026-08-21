import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
function supabase(token:string){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${token}`}}})}
export async function POST(req:NextRequest){
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)return NextResponse.json({error:'Unauthorized'},{status:401});
  const sb=supabase(token);
  const {data:{user},error:authError}=await sb.auth.getUser(token);
  if(authError||!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const body=await req.json().catch(()=>null);
  const brandId=String(body?.brandId||'');
  const accountIds=Array.isArray(body?.accountIds)?[...new Set(body.accountIds.map(String).filter(Boolean))]:[];
  const message=String(body?.message||'').trim();
  const mediaUrl=body?.mediaUrl?String(body.mediaUrl):null;
  const link=body?.link?String(body.link):null;
  const platforms=Array.isArray(body?.platforms)?[...new Set(body.platforms.map(String))]:[];
  if(!brandId||!accountIds.length||!message)return NextResponse.json({error:'Workspace, account and caption are required.'},{status:400});
  const {data:members,error:memberError}=await sb.from('workplace_members').select('id').eq('workplace_id',brandId).eq('user_id',user.id).limit(1);
  const {data:profile}=await sb.from('profiles').select('role').eq('id',user.id).maybeSingle();
  if(memberError||(!members?.length&&profile?.role!=='admin'))return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
  const {data:accounts,error:accountsError}=await sb.from('social_accounts').select('id,platform,brand_id,status').in('id',accountIds).eq('brand_id',brandId).eq('user_id',user.id).eq('status','connected');
  if(accountsError) return NextResponse.json({error:accountsError.message},{status:500});
  if((accounts||[]).length!==accountIds.length)return NextResponse.json({error:'One or more selected social accounts are invalid for this workspace.'},{status:403});
  const actualPlatforms=[...new Set((accounts||[]).map(a=>a.platform))];
  if(profile?.role!=='admin'){
    const {data:permissions,error:permissionError}=await sb.from('workplace_permissions').select('platform,can_view,can_create').eq('user_id',user.id).eq('workplace_id',brandId).in('platform',actualPlatforms);
    if(permissionError)return NextResponse.json({error:permissionError.message},{status:500});
    const byPlatform=new Map((permissions||[]).map(p=>[p.platform,p]));
    for(const platform of actualPlatforms){
      const p=byPlatform.get(platform);
      if(!p?.can_view)return NextResponse.json({error:`You do not have View permission for ${platform}.`},{status:403});
      if(!p?.can_create)return NextResponse.json({error:`You do not have Create permission for ${platform}.`},{status:403});
    }
  }
  const {data:draft,error:draftError}=await sb.from('post_drafts').insert({user_id:user.id,brand_id:brandId,title:'Social Post',message,media_urls:mediaUrl?[mediaUrl]:[],platforms:platforms.length?platforms:actualPlatforms,account_ids:accountIds,approval_status:'pending',submitted_at:new Date().toISOString()}).select('id').single();
  if(draftError)return NextResponse.json({error:draftError.message},{status:500});
  const {data:approval,error:approvalError}=await sb.from('post_approvals').insert({draft_id:draft.id,workplace_id:brandId,submitted_by:user.id,status:'pending',submitted_at:new Date().toISOString()}).select('id,status').single();
  if(approvalError){await sb.from('post_drafts').delete().eq('id',draft.id);return NextResponse.json({error:approvalError.message},{status:500});}
  return NextResponse.json({draftId:draft.id,approval},{status:201});
}
