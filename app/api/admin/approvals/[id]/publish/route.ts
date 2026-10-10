import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Account = { id:string; user_id:string; name:string; platform:string; platform_account_id:string; access_token:string|null; status:string; brand_id:string|null };

function serviceDb(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('Server Supabase configuration is missing.');return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})}
async function callerFromRequest(request:Request){
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)return null;
  const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  if(!anon||!url)return null;
  const c=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}}});
  const {data:u,error}=await c.auth.getUser(token);
  if(error||!u.user)return null;
  return {user:u.user,s:serviceDb()};
}
async function canPublishInWorkspace(s:ReturnType<typeof serviceDb>,userId:string,workspaceId:string){
  const {data:profile,error:profileError}=await s.from('profiles').select('role,active').eq('id',userId).maybeSingle();
  if(profileError)throw profileError;
  if(profile?.active===false)return false;
  const role=String(profile?.role||'').toLowerCase();
  if(['admin','owner'].includes(role))return true;

  const [{data:workspace,error:workspaceError},{data:membership,error:membershipError}]=await Promise.all([
    s.from('workspaces').select('id,owner_user_id').eq('id',workspaceId).maybeSingle(),
    s.from('workplace_members').select('role,active').eq('workspace_id',workspaceId).eq('user_id',userId).maybeSingle(),
  ]);
  if(workspaceError)throw workspaceError;
  if(membershipError)throw membershipError;
  if(workspace?.owner_user_id===userId)return true;
  if(!membership?.active)return false;
  const memberRole=String(membership.role||'').toLowerCase();
  if(['owner','admin'].includes(memberRole))return true;
  if(memberRole!=='manager')return false;

  const {data:permissions,error:permissionError}=await s.from('workspace_member_permissions')
    .select('module,can_approve,can_publish')
    .eq('workspace_id',workspaceId).eq('user_id',userId).in('module',['approval','publishing']);
  if(permissionError)throw permissionError;
  const approvalPermission=(permissions||[]).find((p:any)=>p.module==='approval');
  const publishingPermission=(permissions||[]).find((p:any)=>p.module==='publishing');
  return approvalPermission?.can_approve===true&&publishingPermission?.can_publish===true;
}
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function mediaType(url:string|null){if(!url)return 'none';return /\.(mp4|mov|m4v|webm|avi)(?:$|\?)/i.test(url)?'video':'image'}
async function publishFacebook(account:Account,message:string,link:string|null,mediaUrl:string|null){if(!account.access_token)throw new Error(`${account.name}: Facebook connection is not active.`);const page=account.platform_account_id;const kind=mediaType(mediaUrl);if(kind==='video'&&mediaUrl){const form=new URLSearchParams({file_url:mediaUrl,description:message,access_token:account.access_token});const r=await fetch(`https://graph.facebook.com/v23.0/${page}/videos`,{method:'POST',body:form});const j=await r.json();if(!r.ok||j.error)throw new Error(j.error?.message||`${account.name}: Facebook rejected the video.`);return j.id||null}if(kind==='image'&&mediaUrl){const form=new FormData();form.append('url',mediaUrl);form.append('caption',message);form.append('published','true');form.append('access_token',account.access_token);if(link)form.append('link',link);const r=await fetch(`https://graph.facebook.com/v23.0/${page}/photos`,{method:'POST',body:form});const j=await r.json();if(!r.ok||j.error)throw new Error(j.error?.message||`${account.name}: Facebook rejected the image.`);return j.id||j.post_id||null}const p=new URLSearchParams({message,access_token:account.access_token});if(link)p.set('link',link);const r=await fetch(`https://graph.facebook.com/v23.0/${page}/feed`,{method:'POST',body:p});const j=await r.json();if(!r.ok||j.error)throw new Error(j.error?.message||`${account.name}: Facebook rejected the post.`);return j.id||j.post_id||null}
async function publishInstagram(account:Account,message:string,mediaUrl:string|null){if(!account.access_token)throw new Error(`${account.name}: Instagram connection is not active.`);if(!mediaUrl)throw new Error(`${account.name}: Instagram requires media.`);const base=`https://graph.instagram.com/v23.0/${account.platform_account_id}`;const kind=mediaType(mediaUrl);const params:any={caption:message,access_token:account.access_token};if(kind==='video'){params.media_type='REELS';params.video_url=mediaUrl}else{params.image_url=mediaUrl}const c=await fetch(`${base}/media`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)});const cj=await c.json();if(!c.ok||cj.error||!cj.id)throw new Error(cj.error?.message||`${account.name}: Instagram media creation failed.`);let lastError='';for(let attempt=0;attempt<8;attempt++){if(attempt>0)await sleep(4000);const p=await fetch(`${base}/media_publish`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({creation_id:cj.id,access_token:account.access_token})});const pj=await p.json();if(p.ok&&pj.id)return pj.id;if(pj.error?.message)lastError=pj.error.message}throw new Error(lastError||`${account.name}: Instagram rejected the post.`)}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const caller=await callerFromRequest(request);
  if(!caller)return NextResponse.json({error:'Authentication required.'},{status:401});
  const {id}=await params;
  const db=caller.s;
  try{
    const {data:approval,error:approvalError}=await db.from('post_approvals')
      .select('id,draft_id,workplace_id,submitted_by,status,publish_status')
      .eq('id',id).maybeSingle();
    if(approvalError)throw approvalError;
    if(!approval)return NextResponse.json({error:'Approval record not found.'},{status:404});
    const authorized=await canPublishInWorkspace(db,caller.user.id,approval.workplace_id);
    if(!authorized)return NextResponse.json({error:'Only this workspace owner/admin or an authorised approval-and-publish manager can publish.'},{status:403});
    if(approval.status!=='approved')return NextResponse.json({error:'Post must be approved before publishing.'},{status:400});
    if(approval.publish_status==='published')return NextResponse.json({error:'This approved post has already been published.'},{status:409});

    const {data:draft,error:draftError}=await db.from('post_drafts')
      .select('id,user_id,brand_id,message,media_urls,account_ids,approval_status')
      .eq('id',approval.draft_id).maybeSingle();
    if(draftError)throw draftError;
    if(!draft)return NextResponse.json({error:'Post draft not found.'},{status:404});
    if(draft.approval_status!=='approved')return NextResponse.json({error:'Draft approval state is not approved.'},{status:400});
    if(draft.brand_id!==approval.workplace_id||draft.user_id!==approval.submitted_by){
      return NextResponse.json({error:'Approval record does not match the draft workspace/submitter.'},{status:403});
    }

    const ids=Array.isArray(draft.account_ids)?draft.account_ids.map(String):[];
    if(!ids.length)return NextResponse.json({error:'No social accounts are attached to this approved post.'},{status:400});
    const {data:accounts,error:accountsError}=await db.from('social_accounts')
      .select('id,user_id,name,platform,platform_account_id,access_token,status,brand_id')
      .in('id',ids).in('platform',['facebook','instagram']);
    if(accountsError)throw accountsError;
    if((accounts||[]).length!==ids.length)throw new Error('One or more selected social accounts are no longer connected or are unsupported.');
    if((accounts||[]).some((a:any)=>a.brand_id!==draft.brand_id||a.status!=='connected')){
      throw new Error('Approved post accounts no longer match the approved workspace.');
    }

    const message=String(draft.message||'').trim();
    if(!message)throw new Error('Approved post has no caption.');
    const mediaUrl=Array.isArray(draft.media_urls)&&draft.media_urls.length?String(draft.media_urls[0]):null;
    const published=[];
    for(const account of accounts as Account[]){
      const postId=await (account.platform==='facebook'
        ?publishFacebook(account,message,null,mediaUrl)
        :publishInstagram(account,message,mediaUrl));
      const {error:postError}=await db.from('social_posts').insert({
        user_id:draft.user_id,brand_id:draft.brand_id,social_account_id:account.id,
        platform:account.platform,platform_post_id:postId,message,
        media_type:mediaType(mediaUrl),status:'published',
        published_at:new Date().toISOString(),attempted_at:new Date().toISOString(),
        approval_status:'approved',
      });
      if(postError)throw postError;
      published.push({platform:account.platform,account:account.name,postId});
    }

    const {error:approvalUpdateError}=await db.from('post_approvals')
      .update({publish_status:'published',published_at:new Date().toISOString(),publish_error:null})
      .eq('id',approval.id).eq('status','approved');
    if(approvalUpdateError)throw approvalUpdateError;
    const {error:draftUpdateError}=await db.from('post_drafts').update({status:'published'}).eq('id',draft.id);
    if(draftUpdateError)throw draftUpdateError;
    return NextResponse.json({published:true,results:published});
  }catch(error){
    const msg=error instanceof Error?error.message:'Unable to publish approved post.';
    await db.from('post_approvals').update({publish_status:'failed',publish_error:msg}).eq('id',id).eq('status','approved');
    return NextResponse.json({error:msg},{status:400});
  }
}
