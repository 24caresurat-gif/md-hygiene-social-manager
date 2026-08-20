import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {inspectMetaToken} from '../../../../../lib/meta-token';

export async function GET(request:Request){
  const bearer=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!bearer)return NextResponse.json({error:'Authentication required.'},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)return NextResponse.json({error:'Supabase configuration is missing.'},{status:500});
  try{
    const supabase=createClient(url,key,{global:{headers:{Authorization:`Bearer ${bearer}`}}});
    const{data:user,error:userError}=await supabase.auth.getUser(bearer);
    if(userError||!user.user)throw new Error('Invalid session.');
    const brandId=new URL(request.url).searchParams.get('brandId')||'';
    let query=supabase.from('social_accounts').select('id,platform,name,brand_id,token_expires_at,token_status,token_error,access_token').eq('user_id',user.user.id);
    if(brandId)query=query.eq('brand_id',brandId);
    const{data:accounts,error}=await query.order('created_at',{ascending:false});
    if(error)throw error;
    const result=[];
    for(const account of accounts||[]){
      if((account.platform==='facebook'||account.platform==='instagram')&&account.access_token){
        const info=await inspectMetaToken(account.access_token);const checkedAt=new Date().toISOString();
        await supabase.from('social_accounts').update({token_expires_at:info.expiresAt,token_checked_at:checkedAt,token_status:info.status,token_error:info.error}).eq('id',account.id).eq('user_id',user.user.id);
        result.push({id:account.id,platform:account.platform,name:account.name,brandId:account.brand_id,status:info.status,expiresAt:info.expiresAt,error:info.error});
      }else result.push({id:account.id,platform:account.platform,name:account.name,brandId:account.brand_id,status:account.token_status||'unknown',expiresAt:account.token_expires_at,error:account.token_error});
    }
    return NextResponse.json({accounts:result});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to check account health.'},{status:400})}
}
