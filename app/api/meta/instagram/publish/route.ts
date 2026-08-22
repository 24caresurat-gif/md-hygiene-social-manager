import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

type Body={accountId?:string;caption?:string;mediaUrl?:string;link?:string};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function waitForInstagramMedia(base:string,containerId:string,accessToken:string){
  for(let attempt=0;attempt<8;attempt++){
    const r=await fetch(`${base}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`,{cache:'no-store'});
    const j=await r.json().catch(()=>({}));
    if(r.ok && j.status_code==='FINISHED') return;
    if(r.ok && j.status_code==='ERROR') throw new Error(j.status||'Instagram media processing failed.');
    if(!r.ok && j.error) throw new Error(j.error.message||'Unable to check Instagram media status.');
    await sleep(2500);
  }
  throw new Error('Instagram media is still processing. Please try publishing again.');
}

export async function POST(request:Request){
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)return NextResponse.json({error:'Your Social Manager session has expired.'},{status:401});
  const body=(await request.json().catch(()=>null)) as Body|null;
  const accountId=body?.accountId?.trim();
  const caption=body?.caption?.trim();
  const mediaUrl=body?.mediaUrl?.trim();
  if(!accountId||!caption||!mediaUrl)return NextResponse.json({error:'Instagram account, caption and a public media URL are required.'},{status:400});
  const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${token}`}}});
  try{
    const{data:userData}=await supabase.auth.getUser(token);
    if(!userData.user)return NextResponse.json({error:'Invalid Social Manager session.'},{status:401});
    const{data:profile}=await supabase.from('profiles').select('role,active').eq('id',userData.user.id).maybeSingle();
    if(profile?.role!=='admin'||profile.active===false)return NextResponse.json({error:'Admin approval is required before publishing.'},{status:403});
    const{data:account,error}=await supabase.from('social_accounts').select('id,name,platform_account_id,access_token,status,brand_id').eq('id',accountId).eq('user_id',userData.user.id).eq('platform','instagram').single();
    if(error||!account)return NextResponse.json({error:'Connected Instagram account not found.'},{status:404});
    if(account.status!=='connected'||!account.access_token)return NextResponse.json({error:'Instagram connection is not active. Please reconnect it.'},{status:400});

    const base=`https://graph.instagram.com/v23.0/${account.platform_account_id}`;
    const create=await fetch(`${base}/media`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({image_url:mediaUrl,caption,access_token:account.access_token})});
    const creation=await create.json();
    if(!create.ok||creation.error||!creation.id)throw new Error(creation.error?.message||'Instagram media container creation failed.');
    await waitForInstagramMedia(base,creation.id,account.access_token);

    const publish=await fetch(`${base}/media_publish`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({creation_id:creation.id,access_token:account.access_token})});
    const result=await publish.json();
    if(!publish.ok||result.error||!result.id)throw new Error(result.error?.message||'Instagram rejected the post.');
    return NextResponse.json({published:true,postId:result.id,account:account.name});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to publish to Instagram.'},{status:400})}
}
