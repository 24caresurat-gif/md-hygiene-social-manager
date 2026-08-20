import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {inspectMetaToken,reconnectRequired} from '../../../../../lib/meta-token';

type PublishBody={accountId?:string;message?:string;link?:string;mediaType?:'none'|'image'|'video'};

export async function POST(request:Request){
  const authorization=request.headers.get('authorization');
  const userAccessToken=authorization?.replace(/^Bearer\s+/i,'');
  if(!userAccessToken)return NextResponse.json({error:'Your Social Manager session has expired.'},{status:401});
  const contentType=request.headers.get('content-type')||'';
  let body:PublishBody={};let media:File|null=null;
  if(contentType.includes('multipart/form-data')){const form=await request.formData();body={accountId:String(form.get('accountId')||''),message:String(form.get('message')||''),link:String(form.get('link')||''),mediaType:String(form.get('mediaType')||'none') as PublishBody['mediaType']};const file=form.get('media');media=file instanceof File?file:null}
  else body=(await request.json().catch(()=>null)) as PublishBody|null||{};

  const message=body.message?.trim(),accountId=body.accountId?.trim(),link=body.link?.trim(),mediaType=body.mediaType||'none';
  if(!accountId||!message)return NextResponse.json({error:'Facebook Page and post message are required.'},{status:400});
  if(!['none','image','video'].includes(mediaType))return NextResponse.json({error:'Invalid media type.'},{status:400});
  if(mediaType!=='none'&&!media)return NextResponse.json({error:`${mediaType} file is required.`},{status:400});

  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!supabaseUrl||!anonKey)return NextResponse.json({error:'Supabase configuration is missing.'},{status:500});

  try{
    const supabase=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:`Bearer ${userAccessToken}`}}});
    const{data:userData,error:userError}=await supabase.auth.getUser(userAccessToken);
    if(userError||!userData.user)throw new Error('Invalid Social Manager session.');
    const{data:account,error:accountError}=await supabase.from('social_accounts').select('id,name,platform_account_id,access_token,platform,status,token_status').eq('id',accountId).eq('user_id',userData.user.id).eq('platform','facebook').single();
    if(accountError||!account)throw new Error('Connected Facebook Page not found.');
    if(account.status!=='connected'||!account.access_token)throw new Error('Facebook Page connection is not active. Please reconnect it.');

    // Validate immediately before publishing so an expired token never reaches Meta as a blind failure.
    const tokenInfo=await inspectMetaToken(account.access_token);
    const checkedAt=new Date().toISOString();
    await supabase.from('social_accounts').update({token_expires_at:tokenInfo.expiresAt,token_checked_at:checkedAt,token_status:tokenInfo.status,token_error:tokenInfo.error,updated_at:checkedAt}).eq('id',account.id).eq('user_id',userData.user.id);
    if(!tokenInfo.valid||reconnectRequired(tokenInfo.status))throw new Error('Facebook connection needs to be reconnected. Please reconnect this Page before publishing.');

    const pageId=account.platform_account_id,pageToken=account.access_token;
    let endpoint=`https://graph.facebook.com/v23.0/${pageId}/feed`;
    let formData:FormData|URLSearchParams=new URLSearchParams({message,access_token:pageToken});
    if(mediaType==='image'&&media){endpoint=`https://graph.facebook.com/v23.0/${pageId}/photos`;const upload=new FormData();upload.append('source',media,media.name);upload.append('caption',message);upload.append('published','true');upload.append('access_token',pageToken);if(link)upload.append('link',link);formData=upload}
    else if(mediaType==='video'&&media){endpoint=`https://graph.facebook.com/v23.0/${pageId}/videos`;const upload=new FormData();upload.append('source',media,media.name);upload.append('description',message);upload.append('published','true');upload.append('access_token',pageToken);formData=upload}
    else if(link)(formData as URLSearchParams).set('link',link);

    const publishResponse=await fetch(endpoint,{method:'POST',body:formData,cache:'no-store'}),result=await publishResponse.json();
    if(!publishResponse.ok||result.error){
      const messageFromMeta=result.error?.message||'Facebook rejected the post.';
      if(/expired|invalid|oauth|token|session/i.test(messageFromMeta))await supabase.from('social_accounts').update({status:'needs_reconnect',token_status:'reconnect_required',token_error:messageFromMeta,token_checked_at:new Date().toISOString()}).eq('id',account.id).eq('user_id',userData.user.id);
      throw new Error(messageFromMeta);
    }
    const postId=result.id||result.post_id||result.video_id||null;
    const{error:trackingError}=await supabase.from('social_posts').insert({user_id:userData.user.id,social_account_id:account.id,platform:'facebook',platform_post_id:postId,message,media_type:mediaType,status:'published',published_at:new Date().toISOString()});
    if(trackingError)console.error('social_posts tracking failed:',trackingError.message);
    return NextResponse.json({published:true,postId,page:account.name});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to publish to Facebook.'},{status:400})}
}
