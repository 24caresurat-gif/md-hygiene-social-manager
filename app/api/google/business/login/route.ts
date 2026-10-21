import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GOOGLE_BUSINESS_SCOPE } from '../../../../../lib/google-business';
import { adminDb, workspaceAccess } from '../../../../../lib/workspace-auth';

export async function POST(request:Request){
  try{
    const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
    if(!token)return NextResponse.json({error:'Authentication required.'},{status:401});
    const {workspaceId=''}=await request.json().catch(()=>({}));
    const workspace=String(workspaceId).trim();
    if(!workspace)return NextResponse.json({error:'Workspace is required.'},{status:400});

    const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,clientId=process.env.GOOGLE_CLIENT_ID;
    if(!supabaseUrl||!anonKey)throw new Error('Supabase configuration is missing.');
    if(!clientId)return NextResponse.json({error:'Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID in Vercel.'},{status:500});

    const supabase=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:`Bearer ${token}`}}});
    const {data:userData,error:userError}=await supabase.auth.getUser(token);
    if(userError||!userData.user)return NextResponse.json({error:'Invalid session.'},{status:401});
    const db = adminDb();
    const access = await workspaceAccess(db, userData.user.id, workspace);
    if (!access?.hasAccess) return NextResponse.json({ error: 'You do not have access to this workspace.' }, { status: 403 });
    if (!access.canManage) return NextResponse.json({ error: 'Only workspace owners, admins or managers can connect Google Business.' }, { status: 403 });

    const state=crypto.randomUUID(),origin=new URL(request.url).origin;
    const redirectUri=process.env.GOOGLE_OAUTH_REDIRECT_URI||`${origin}/api/google/business/callback`;
    const oauth=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    oauth.searchParams.set('client_id',clientId);
    oauth.searchParams.set('redirect_uri',redirectUri);
    oauth.searchParams.set('response_type','code');
    oauth.searchParams.set('scope',GOOGLE_BUSINESS_SCOPE);
    oauth.searchParams.set('access_type','offline');
    oauth.searchParams.set('prompt','consent');
    oauth.searchParams.set('include_granted_scopes','true');
    oauth.searchParams.set('state',state);

    const response=NextResponse.json({url:oauth.toString()});
    const options={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/',maxAge:600};
    response.cookies.set('google_oauth_state',state,options);
    response.cookies.set('google_workspace_id',workspace,options);
    response.cookies.set('google_user_token',token,options);
    return response;
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to start Google connection.'},{status:500});
  }
}