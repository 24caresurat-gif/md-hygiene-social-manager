import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listGoogleAccounts, refreshGoogleToken } from '../../../../../lib/google-business';
import { importGoogleAccount } from '../../../../../lib/google-business-sync';

export async function POST(request:Request){
  try{
    const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
    if(!token)return NextResponse.json({error:'Authentication required.'},{status:401});
    const {workspaceId=''}=await request.json().catch(()=>({}));
    const workspace=String(workspaceId).trim();
    if(!workspace)return NextResponse.json({error:'Workspace is required.'},{status:400});

    const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const clientId=process.env.GOOGLE_CLIENT_ID,clientSecret=process.env.GOOGLE_CLIENT_SECRET;
    if(!supabaseUrl||!anonKey)throw new Error('Supabase configuration is missing.');
    if(!clientId||!clientSecret)return NextResponse.json({error:'Google OAuth is not configured in Vercel yet.'},{status:500});

    const supabase=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:`Bearer ${token}`}}});
    const {data:userData,error:userError}=await supabase.auth.getUser(token);
    if(userError||!userData.user)return NextResponse.json({error:'Invalid session.'},{status:401});
    const member=await supabase.from('workplace_members').select('workspace_id,active')
      .eq('workspace_id',workspace).eq('user_id',userData.user.id).eq('active',true).maybeSingle();
    if(member.error)throw member.error;
    if(!member.data)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});

    const result=await supabase.from('social_accounts')
      .select('id,platform_account_id,access_token,refresh_token,token_expires_at,status')
      .eq('workspace_id',workspace).eq('platform','google_business').eq('status','connected');
    if(result.error)throw result.error;
    if(!result.data?.length)return NextResponse.json({error:'Connect Google first.'},{status:400});

    let locations=0,reviews=0;
    for(const social of result.data){
      let accessToken=String(social.access_token||'');
      if(social.refresh_token&&(!social.token_expires_at||new Date(social.token_expires_at).getTime()<=Date.now()+60000)){
        const refreshed=await refreshGoogleToken({refreshToken:social.refresh_token,clientId,clientSecret});
        accessToken=refreshed.access_token;
        const update=await supabase.from('social_accounts').update({
          access_token:accessToken,
          token_expires_at:refreshed.expires_in?new Date(Date.now()+Number(refreshed.expires_in)*1000).toISOString():null,
          token_checked_at:new Date().toISOString(),token_last_refreshed_at:new Date().toISOString(),
          token_status:'active',token_error:null
        }).eq('id',social.id).eq('workspace_id',workspace);
        if(update.error)throw update.error;
      }
      if(!accessToken)throw new Error('Google access token is missing.');
      let accounts=await listGoogleAccounts(accessToken);
      accounts=accounts.filter(a=>String(a?.name||'')===String(social.platform_account_id||''));
      for(const account of accounts){
        const r=await importGoogleAccount({supabase,workspaceId:workspace,socialAccountId:String(social.id),account,accessToken});
        locations+=r.locations;reviews+=r.reviews;
      }
    }
    return NextResponse.json({ok:true,accounts:result.data.length,locations,reviews});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to sync Google Business Profile data.'},{status:500});
  }
}