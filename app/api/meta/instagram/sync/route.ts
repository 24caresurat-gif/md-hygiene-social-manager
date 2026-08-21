import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {inspectMetaToken} from '../../../../../lib/meta-token';

type FacebookAccount={id:string;name:string;platform_account_id:string;access_token:string|null;brand_id:string|null};
type InstagramProfile={id:string;username?:string;name?:string};

export async function POST(request:Request){
  const bearer=request.headers.get('authorization')?.replace(/^Bearer\s+/i,''),body=await request.json().catch(()=>({})) as {brandId?:string};
  if(!bearer)return NextResponse.json({error:'Authentication required.'},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)return NextResponse.json({error:'Supabase configuration is missing.'},{status:500});
  try{
    const supabase=createClient(url,key,{global:{headers:{Authorization:`Bearer ${bearer}`}}}),{data:user,error:userError}=await supabase.auth.getUser(bearer);
    if(userError||!user.user)throw new Error('Invalid session.');
    const brandId=body.brandId||'';if(!brandId)throw new Error('Select a workspace before connecting Instagram.');
    const{data:pages,error:pagesError}=await supabase.from('social_accounts').select('id,name,platform_account_id,access_token,brand_id').eq('user_id',user.user.id).eq('platform','facebook').eq('status','connected').eq('brand_id',brandId);
    if(pagesError)throw pagesError;
    let connected=0;const skipped:string[]=[];
    for(const page of(pages||[])as FacebookAccount[]){
      if(!page.access_token){skipped.push(`${page.name}: missing Page token`);continue}
      const tokenInfo=await inspectMetaToken(page.access_token);const checkedAt=new Date().toISOString();
      await supabase.from('social_accounts').update({token_expires_at:tokenInfo.expiresAt,token_checked_at:checkedAt,token_status:tokenInfo.status,token_error:tokenInfo.error}).eq('id',page.id).eq('user_id',user.user.id);
      if(!tokenInfo.valid){skipped.push(`${page.name}: Facebook connection needs to be reconnected`);continue}

      const r=await fetch(`https://graph.facebook.com/v23.0/${page.platform_account_id}?fields=instagram_business_account{id,username,name}&access_token=${encodeURIComponent(page.access_token)}`,{cache:'no-store'}),d=await r.json();
      if(!r.ok||d?.error){skipped.push(`${page.name}: ${d?.error?.message||'Instagram lookup failed'}`);continue}
      const ig=d?.instagram_business_account as InstagramProfile|undefined;
      if(!ig?.id){skipped.push(`${page.name}: no Instagram Business account linked`);continue}
      const{data:existing}=await supabase.from('social_accounts').select('id').eq('user_id',user.user.id).eq('platform','instagram').eq('platform_account_id',ig.id).eq('brand_id',brandId).maybeSingle();
      const payload={user_id:user.user.id,platform:'instagram',name:ig.name||ig.username||page.name,handle:ig.username||null,platform_account_id:ig.id,access_token:page.access_token,status:'connected',brand_id:brandId,updated_at:checkedAt,token_expires_at:tokenInfo.expiresAt,token_checked_at:checkedAt,token_last_refreshed_at:checkedAt,token_status:tokenInfo.status,token_error:null};
      const result=existing?await supabase.from('social_accounts').update(payload).eq('id',existing.id).eq('user_id',user.user.id):await supabase.from('social_accounts').insert(payload);
      if(result.error)throw result.error;connected++
    }
    return NextResponse.json({connected,skipped});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to sync Instagram accounts.'},{status:400})}
}
