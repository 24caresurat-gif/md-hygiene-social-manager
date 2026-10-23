import {
  formatGoogleAddress,
  listGoogleLocations,
  listGoogleReviews,
  locationReviewUrl,
  ratingToNumber,
} from './google-business';

import { createClient } from '@supabase/supabase-js';

function adminDb(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Server database configuration is missing.');
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}

export async function saveGoogleConnection(args:{
  socialAccountId:string; userId:string; workspaceId:string; accountName:string; tokenData:any;
}){
  const db=adminDb();
  const now=new Date();
  const nowIso=now.toISOString();
  const {data:existing,error:existingError}=await db.from('google_business_connections')
    .select('id,refresh_token,token_expires_at')
    .eq('social_account_id',args.socialAccountId)
    .maybeSingle();
  if(existingError)throw existingError;

  // Google may omit refresh_token on a subsequent authorization. Preserve the
  // previously stored refresh token rather than overwriting it with null.
  const incomingRefreshToken=typeof args.tokenData.refresh_token==='string'
    ? args.tokenData.refresh_token.trim()
    : '';
  const refreshToken=incomingRefreshToken||existing?.refresh_token||null;
  const expiresIn=Number(args.tokenData.expires_in||0);
  const expiresAt=Number.isFinite(expiresIn)&&expiresIn>0
    ? new Date(now.getTime()+expiresIn*1000).toISOString()
    : existing?.token_expires_at||null;
  const payload={social_account_id:args.socialAccountId,user_id:args.userId,workspace_id:args.workspaceId,account_name:args.accountName,access_token:null,refresh_token:refreshToken,token_expires_at:expiresAt,token_checked_at:nowIso,token_last_refreshed_at:incomingRefreshToken?nowIso:undefined,token_status:'active',token_error:null,updated_at:nowIso};
  const result=await db.from('google_business_connections').upsert(payload,{onConflict:'social_account_id'}).select('id').single();
  if(result.error)throw result.error;
  return result.data.id as string;
}

export async function getGoogleConnectionBySocialAccount(socialAccountId:string){
  const db=adminDb();
  const result=await db.from('google_business_connections').select('id,social_account_id,account_name,access_token,refresh_token,token_expires_at,token_status').eq('social_account_id',socialAccountId).maybeSingle();
  if(result.error)throw result.error;
  return result.data||null;
}

export async function getGoogleConnectionsByWorkspace(workspaceId:string){
  const db=adminDb();
  const result=await db.from('google_business_connections').select('id,social_account_id,account_name,access_token,refresh_token,token_expires_at,token_status').eq('workspace_id',workspaceId);
  if(result.error)throw result.error;
  return result.data||[];
}

export async function updateGoogleConnection(id:string,patch:any){
  const db=adminDb();
  const result=await db.from('google_business_connections').update({...patch,updated_at:new Date().toISOString()}).eq('id',id);
  if(result.error)throw result.error;
}

export async function saveGoogleSocialAccount(args:{
  userId:string; workspaceId:string; brandId:string|null;
  account:any; tokenData:any;
}) {
  const db=adminDb();
  const resource=String(args.account?.name||'').trim();
  if(!resource) throw new Error('Google returned an account without a resource name.');
  const existing=await db.from('social_accounts').select('id,brand_id')
    .eq('workspace_id',args.workspaceId).eq('platform','google_business')
    .eq('platform_account_id',resource).maybeSingle();
  if(existing.error) throw existing.error;
  const now=new Date().toISOString();
  const payload={
    user_id:args.userId,workspace_id:args.workspaceId,brand_id:args.brandId,
    platform:'google_business',name:args.account?.accountName||resource,handle:args.account?.type||null,
    platform_account_id:resource,access_token:args.tokenData.access_token,
    refresh_token:null,
    token_expires_at:args.tokenData.expires_in?new Date(Date.now()+Number(args.tokenData.expires_in)*1000).toISOString():null,
    token_checked_at:now,token_last_refreshed_at:now,token_status:'active',token_error:null,status:'connected',updated_at:now
  };
  if(existing.data?.id){
    if(!args.brandId)payload.brand_id=existing.data.brand_id||null;
    const result=await db.from('social_accounts').update(payload).eq('id',existing.data.id).eq('workspace_id',args.workspaceId);
    if(result.error) throw result.error;
    return String(existing.data.id);
  }
  const result=await db.from('social_accounts').insert(payload).select('id').single();
  if(result.error) throw result.error;
  return String(result.data.id);
}

export async function importGoogleAccount(args:{
  workspaceId:string; socialAccountId:string; account:any; accessToken:string;
}) {
  // Called only after the OAuth callback authenticates the user and verifies
  // workspace-management access. Keep import writes server-side rather than
  // depending on browser-role table grants or RLS context.
  const db=adminDb();
  const accountName=String(args.account?.name||'');
  const locations=await listGoogleLocations(args.accessToken,accountName);
  let reviewCount=0;
  for(const location of locations){
    const locationName=String(location?.name||'').trim();
    if(!locationName) continue;
    const profilePayload={
      workspace_id:args.workspaceId,social_account_id:args.socialAccountId,location_id:locationName,
      account_id:accountName||null,business_name:location?.title||locationName.split('/').pop()||'Google Business Profile',
      address:formatGoogleAddress(location?.storefrontAddress),phone:location?.phoneNumbers?.primaryPhone||null,
      website:location?.websiteUri||null,
      category:location?.categories?.primaryCategory?.displayName||location?.categories?.primaryCategory?.categoryId||null,
      review_url:locationReviewUrl(location),profile_data:location||{},status:'connected',updated_at:new Date().toISOString()
    };
    const existing=await db.from('google_business_profiles').select('id')
      .eq('workspace_id',args.workspaceId).eq('location_id',locationName).maybeSingle();
    if(existing.error) throw existing.error;
    let profileId=existing.data?.id;
    if(profileId){
      const result=await db.from('google_business_profiles').update(profilePayload)
        .eq('id',profileId).eq('workspace_id',args.workspaceId);
      if(result.error) throw result.error;
    }else{
      const result=await db.from('google_business_profiles')
        .insert({...profilePayload,created_at:new Date().toISOString()}).select('id').single();
      if(result.error) throw result.error;
      profileId=result.data.id;
    }

    for(const review of await listGoogleReviews(args.accessToken,locationName)){
      const reviewName=String(review?.name||'').trim();
      if(!reviewName) continue;
      const reply=review?.reviewReply||null;
      const payload={
        workspace_id:args.workspaceId,profile_id:profileId,google_review_id:reviewName,
        reviewer_name:review?.reviewer?.displayName||null,rating:ratingToNumber(review?.starRating),
        comment:review?.comment||null,review_time:review?.createTime||null,
        reply_text:reply?.comment||null,replied_at:reply?.updateTime||null,
        reply_status:reply?.comment?'replied':'not_replied',review_data:review||{},updated_at:new Date().toISOString()
      };
      const old=await db.from('google_business_reviews').select('id')
        .eq('workspace_id',args.workspaceId).eq('google_review_id',reviewName).maybeSingle();
      if(old.error) throw old.error;
      if(old.data?.id){
        const result=await db.from('google_business_reviews').update(payload)
          .eq('id',old.data.id).eq('workspace_id',args.workspaceId);
        if(result.error) throw result.error;
      }else{
        const result=await db.from('google_business_reviews')
          .insert({...payload,created_at:new Date().toISOString()});
        if(result.error) throw result.error;
      }
      reviewCount++;
    }
  }
  return {locations:locations.length,reviews:reviewCount};
}