import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

function db(){
  const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!u||!k)throw Error('Server database configuration is missing.');
  return createClient(u,k,{auth:{autoRefreshToken:false,persistSession:false}});
}

const defaultProtection={
  negative_protection_enabled:true,
  negative_protection_threshold:2,
  negative_protection_message:'Your feedback will be reviewed privately by our team. You can still choose to share your experience publicly on Google after submitting.'
};

export async function GET(_r: Request,{params}:{params:Promise<{token:string}>}){
  try{
    const {token}=await params;
    const publicToken=decodeURIComponent(String(token||'')).trim();
    if(!publicToken)return NextResponse.json({error:'Request not found.'},{status:404});
    const s=db();
    const q=await s.from('review_requests').select('id,workspace_id,profile_id,form_id,name,email,message,status').eq('public_token',publicToken).maybeSingle();
    if(q.error)throw q.error;
    if(!q.data)return NextResponse.json({error:'Request not found.'},{status:404});
    if(!q.data.form_id)return NextResponse.json({error:'This request has no feedback form.'},{status:409});
    const [f,p,settingsResult]=await Promise.all([
      s.from('feedback_forms').select('id,name,title,description,fields,active').eq('id',q.data.form_id).eq('workspace_id',q.data.workspace_id).maybeSingle(),
      q.data.profile_id?s.from('google_business_profiles').select('business_name,review_url').eq('id',q.data.profile_id).eq('workspace_id',q.data.workspace_id).maybeSingle():Promise.resolve({data:null,error:null} as any),
      s.from('workspace_review_settings').select('negative_protection_enabled,negative_protection_threshold,negative_protection_message').eq('workspace_id',q.data.workspace_id).maybeSingle()
    ]);
    if(f.error)throw f.error;
    if(p.error)throw p.error;
    if(settingsResult.error)throw settingsResult.error;
    if(!f.data||!f.data.active)return NextResponse.json({error:'This feedback form is no longer active.'},{status:410});
    if(q.data.status==='sent'){
      const up=await s.from('review_requests').update({status:'opened'}).eq('id',q.data.id);
      if(up.error)throw up.error;
    }
    const protection={...defaultProtection,...(settingsResult.data||{})};
    return NextResponse.json({request:q.data,form:f.data,profile:p.data,protection});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Unable to load request.'},{status:500});
  }
}

export async function POST(r:Request,{params}:{params:Promise<{token:string}>}){
  try{
    const {token}=await params;
    const publicToken=decodeURIComponent(String(token||'')).trim();
    if(!publicToken)return NextResponse.json({error:'Request not found.'},{status:404});
    const b=await r.json().catch(()=>({}));
    const rating=b.rating==null?null:Number(b.rating);
    if(rating!==null&&(!Number.isInteger(rating)||rating<1||rating>5))return NextResponse.json({error:'Rating must be between 1 and 5.'},{status:400});
    const answers=b.answers&&typeof b.answers==='object'&&!Array.isArray(b.answers)?b.answers:{};
    const s=db();
    const q=await s.from('review_requests').select('id,workspace_id,profile_id,form_id,name,email').eq('public_token',publicToken).maybeSingle();
    if(q.error)throw q.error;
    if(!q.data)return NextResponse.json({error:'Request not found.'},{status:404});
    if(!q.data.form_id)return NextResponse.json({error:'This request has no feedback form.'},{status:409});
    const f=await s.from('feedback_forms').select('id,active').eq('id',q.data.form_id).eq('workspace_id',q.data.workspace_id).maybeSingle();
    if(f.error)throw f.error;
    if(!f.data||!f.data.active)return NextResponse.json({error:'This feedback form is not active.'},{status:410});
    const response=await s.from('feedback_responses').insert({
      workspace_id:q.data.workspace_id,
      form_id:q.data.form_id,
      request_id:q.data.id,
      customer_name:String(b.customer_name??q.data.name??'').trim()||null,
      customer_email:String(b.customer_email??q.data.email??'').trim()||null,
      rating,answers,
      sentiment:rating==null?null:rating<=2?'negative':rating===3?'neutral':'positive'
    }).select('id').single();
    if(response.error)throw response.error;
    const up=await s.from('review_requests').update({status:'feedback',feedback_rating:rating}).eq('id',q.data.id);
    if(up.error)throw up.error;
    let reviewUrl:null|string=null;
    if(q.data.profile_id){
      const p=await s.from('google_business_profiles').select('review_url').eq('id',q.data.profile_id).eq('workspace_id',q.data.workspace_id).maybeSingle();
      if(p.error)throw p.error;
      reviewUrl=p.data?.review_url||null;
    }
    const settingsResult=await s.from('workspace_review_settings').select('negative_protection_enabled,negative_protection_threshold').eq('workspace_id',q.data.workspace_id).maybeSingle();
    if(settingsResult.error)throw settingsResult.error;
    const protectionTriggered=Boolean(settingsResult.data?.negative_protection_enabled&&rating!==null&&rating<=Number(settingsResult.data?.negative_protection_threshold||2));
    return NextResponse.json({ok:true,responseId:response.data.id,reviewUrl,protectionTriggered});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Unable to submit feedback.'},{status:500});
  }
}
