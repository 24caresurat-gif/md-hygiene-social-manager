import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type FacebookAccount={id:string;name:string;platform_account_id:string;access_token:string|null};
type InstagramProfile={id:string;username?:string;name?:string};

export async function POST(request:Request){
 const bearer=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!bearer)return NextResponse.json({error:'Authentication required.'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)return NextResponse.json({error:'Supabase configuration is missing.'},{status:500});
 try{
  const supabase=createClient(url,key,{global:{headers:{Authorization:`Bearer ${bearer}`}}});
  const {data:user,error:userError}=await supabase.auth.getUser(bearer); if(userError||!user.user)throw new Error('Invalid session.');
  const {data:pages,error:pagesError}=await supabase.from('social_accounts').select('id,name,platform_account_id,access_token').eq('user_id',user.user.id).eq('platform','facebook').eq('status','connected');
  if(pagesError)throw pagesError;
  let connected=0; const skipped:string[]=[];
  for(const page of (pages||[]) as FacebookAccount[]){
   if(!page.access_token){skipped.push(`${page.name}: missing Page token`);continue;}
   const r=await fetch(`https://graph.facebook.com/v23.0/${page.platform_account_id}?fields=instagram_business_account{id,username,name}&access_token=${encodeURIComponent(page.access_token)}`,{cache:'no-store'});
   const d=await r.json();
   if(!r.ok||d?.error){skipped.push(`${page.name}: ${d?.error?.message||'Instagram lookup failed'}`);continue;}
   const ig=d?.instagram_business_account as InstagramProfile|undefined;
   if(!ig?.id){skipped.push(`${page.name}: no Instagram Business account linked`);continue;}
   const {data:existing}=await supabase.from('social_accounts').select('id').eq('user_id',user.user.id).eq('platform','instagram').eq('platform_account_id',ig.id).maybeSingle();
   const payload={user_id:user.user.id,platform:'instagram',name:ig.name||ig.username||page.name,handle:ig.username||null,platform_account_id:ig.id,access_token:page.access_token,status:'connected',updated_at:new Date().toISOString()};
   const result=existing?await supabase.from('social_accounts').update(payload).eq('id',existing.id):await supabase.from('social_accounts').insert(payload);
   if(result.error)throw result.error; connected++;
  }
  return NextResponse.json({connected,skipped});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to sync Instagram accounts.'},{status:400});}
}
