import {
  formatGoogleAddress,
  listGoogleLocations,
  listGoogleReviews,
  locationReviewUrl,
  ratingToNumber,
} from './google-business';

export async function saveGoogleSocialAccount(args:{
  supabase:any; userId:string; workspaceId:string; brandId:string|null;
  account:any; tokenData:any;
}) {
  const resource=String(args.account?.name||'').trim();
  if(!resource) throw new Error('Google returned an account without a resource name.');
  const existing=await args.supabase.from('social_accounts').select('id,refresh_token')
    .eq('user_id',args.userId).eq('workspace_id',args.workspaceId).eq('platform','google_business')
    .eq('platform_account_id',resource).maybeSingle();
  if(existing.error) throw existing.error;
  const now=new Date().toISOString();
  const payload={
    user_id:args.userId,workspace_id:args.workspaceId,brand_id:args.brandId,
    platform:'google_business',name:args.account?.accountName||resource,handle:args.account?.type||null,
    platform_account_id:resource,access_token:args.tokenData.access_token,
    refresh_token:args.tokenData.refresh_token||existing.data?.refresh_token||null,
    token_expires_at:args.tokenData.expires_in?new Date(Date.now()+Number(args.tokenData.expires_in)*1000).toISOString():null,
    token_checked_at:now,token_last_refreshed_at:now,token_status:'active',token_error:null,status:'connected',updated_at:now
  };
  if(existing.data?.id){
    const result=await args.supabase.from('social_accounts').update(payload).eq('id',existing.data.id).eq('user_id',args.userId);
    if(result.error) throw result.error;
    return String(existing.data.id);
  }
  const result=await args.supabase.from('social_accounts').insert(payload).select('id').single();
  if(result.error) throw result.error;
  return String(result.data.id);
}

export async function importGoogleAccount(args:{
  supabase:any; workspaceId:string; socialAccountId:string; account:any; accessToken:string;
}) {
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
    const existing=await args.supabase.from('google_business_profiles').select('id')
      .eq('workspace_id',args.workspaceId).eq('location_id',locationName).maybeSingle();
    if(existing.error) throw existing.error;
    let profileId=existing.data?.id;
    if(profileId){
      const result=await args.supabase.from('google_business_profiles').update(profilePayload)
        .eq('id',profileId).eq('workspace_id',args.workspaceId);
      if(result.error) throw result.error;
    }else{
      const result=await args.supabase.from('google_business_profiles')
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
      const old=await args.supabase.from('google_business_reviews').select('id')
        .eq('workspace_id',args.workspaceId).eq('google_review_id',reviewName).maybeSingle();
      if(old.error) throw old.error;
      if(old.data?.id){
        const result=await args.supabase.from('google_business_reviews').update(payload)
          .eq('id',old.data.id).eq('workspace_id',args.workspaceId);
        if(result.error) throw result.error;
      }else{
        const result=await args.supabase.from('google_business_reviews')
          .insert({...payload,created_at:new Date().toISOString()});
        if(result.error) throw result.error;
      }
      reviewCount++;
    }
  }
  return {locations:locations.length,reviews:reviewCount};
}