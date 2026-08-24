import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {createClient} from '@supabase/supabase-js';

type MetaPage={id:string;name:string;access_token?:string;username?:string};

export async function POST(request:Request){
  const authorization=request.headers.get('authorization'),userAccessToken=authorization?.replace(/^Bearer\s+/i,''),store=await cookies(),metaUserToken=store.get('meta_fb_user_token')?.value;
  const body=await request.json().catch(()=>null) as {pageId?:string;brandId?:string;workspaceId?:string}|null;
  const workspaceId=body?.workspaceId||'';
  const brandId=store.get('workspace_brand_id')?.value||body?.brandId||'';
  if(!userAccessToken||!metaUserToken)return NextResponse.json({error:'Your session has expired. Please reconnect Facebook.'},{status:401});
  if(!body?.pageId)return NextResponse.json({error:'Facebook Page is required.'},{status:400});
  if(!workspaceId)return NextResponse.json({error:'Workspace is required.'},{status:400});

  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!supabaseUrl||!anonKey)return NextResponse.json({error:'Supabase configuration is missing.'},{status:500});

  try{
    const supabase=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:`Bearer ${userAccessToken}`}}});
    const{data:userData,error:userError}=await supabase.auth.getUser(userAccessToken);
    if(userError||!userData.user)throw new Error('Supabase login session is invalid.');
    const{data:member}=await supabase.from('workplace_members').select('role,active').eq('workspace_id',workspaceId).eq('user_id',userData.user.id).maybeSingle();
    if(!member||!member.active||!['owner','admin'].includes(member.role))return NextResponse.json({error:'Only Workspace Owner or Admin can connect social accounts.'},{status:403});

    const pagesResponse=await fetch(`https://graph.facebook.com/v23.0/me/accounts?fields=id,name,access_token,username&access_token=${encodeURIComponent(metaUserToken)}`,{cache:'no-store'}),pages=await pagesResponse.json();
    if(!pagesResponse.ok||pages.error)throw new Error(pages.error?.message||'Unable to read Facebook Pages.');
    const page=(pages.data||[]).find((item:MetaPage)=>item.id===body.pageId) as MetaPage|undefined;
    if(!page||!page.access_token)throw new Error('Selected Facebook Page was not found or has no Page token.');

    const verify=await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(page.id)}?fields=id,name&access_token=${encodeURIComponent(page.access_token)}`,{cache:'no-store'});
    const verified=await verify.json();
    if(!verify.ok||verified.error||verified.id!==page.id)throw new Error(verified.error?.message||'Selected Facebook Page token is invalid. Please reconnect Facebook.');

    const now=new Date().toISOString();
    const{error:insertError}=await supabase.from('social_accounts').upsert({
      user_id:userData.user.id,workspace_id:workspaceId,platform:'facebook',name:page.name,handle:page.username||null,platform_account_id:page.id,
      access_token:page.access_token,status:'connected',brand_id:brandId||null,updated_at:now,
      token_expires_at:null,token_checked_at:now,token_last_refreshed_at:now,token_status:'active',token_error:null,
    },{onConflict:'user_id,platform,platform_account_id'});
    if(insertError)throw new Error(insertError.message);

    const response=NextResponse.json({connected:true,page:{id:page.id,name:page.name,handle:page.username||null},token:{status:'active',expiresAt:null}});
    response.cookies.set('meta_fb_user_token','',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0});
    response.cookies.set('workspace_brand_id','',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0});
    return response;
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to connect Facebook Page.'},{status:400})}
}
