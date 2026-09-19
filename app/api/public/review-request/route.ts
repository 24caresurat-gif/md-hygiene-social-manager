import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function db(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Server database configuration is missing.');
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}

export async function GET(request:Request){
  try{
    const token=new URL(request.url).searchParams.get('token')?.trim()||'';
    if(!token)return NextResponse.json({error:'Request token is required.'},{status:400});
    const supabase=db();
    const {data:req,error:reqError}=await supabase.from('review_requests').select('id,workspace_id,profile_id,name,email,phone,source,status,form_id,message,created_at').eq('public_token',token).maybeSingle();
    if(reqError)throw reqError;if(!req)return NextResponse.json({error:'Review request not found.'},{status:404});
    const profileResult=await supabase.from('google_business_profiles').select('business_name,review_url,address').eq('id',req.profile_id||'').maybeSingle();
    if(profileResult.error)throw profileResult.error;
    let form=null;
    if(req.form_id){
      const formResult=await supabase.from('feedback_forms').select('id,name,title,description,fields,active,ai_enabled').eq('id',req.form_id).eq('active',true).maybeSingle();
      if(formResult.error)throw formResult.error;form=formResult.data||null;
    }
    return NextResponse.json({request:{id:req.id,name:req.name,email:req.email,phone:req.phone,status:req.status,message:req.message,created_at:req.created_at},profile:profileResult.data||null,form});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to load review request.'},{status:500});}
}

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>({}));
    const token=String(body.token||'').trim(),action=String(body.action||'feedback').trim();
    if(!token)return NextResponse.json({error:'Request token is required.'},{status:400});
    const supabase=db();
    const {data:req,error:reqError}=await supabase.from('review_requests').select('id,workspace_id,profile_id,form_id,status').eq('public_token',token).maybeSingle();
    if(reqError)throw reqError;if(!req)return NextResponse.json({error:'Review request not found.'},{status:404});
    const profileResult=await supabase.from('google_business_profiles').select('business_name,review_url').eq('id',req.profile_id||'').maybeSingle();
    if(profileResult.error)throw profileResult.error;
    if(action==='google_click'){
      const update=await supabase.from('review_requests').update({google_clicked_at:new Date().toISOString(),status:'reviewed'}).eq('id',req.id);
      if(update.error)throw update.error;
      return NextResponse.json({ok:true,redirect_url:profileResult.data?.review_url||null});
    }
    const rating=Number(body.rating||0);
    if(!Number.isInteger(rating)||rating<1||rating>5)return NextResponse.json({error:'Choose a rating from 1 to 5.'},{status:400});
    if(!req.form_id)return NextResponse.json({error:'This request has no feedback form configured.'},{status:400});
    const answers=body.answers&&typeof body.answers==='object'?body.answers:{};
    const feedback=await supabase.from('feedback_responses').insert({workspace_id:req.workspace_id,form_id:req.form_id,request_id:req.id,customer_name:body.name?String(body.name).trim().slice(0,200):null,customer_email:body.email?String(body.email).trim().slice(0,320):null,rating,answers,sentiment:rating>=4?'positive':rating<=2?'negative':'neutral'}).select('id').single();
    if(feedback.error)throw feedback.error;
    const update=await supabase.from('review_requests').update({status:'feedback',feedback_rating:rating}).eq('id',req.id);
    if(update.error)throw update.error;
    return NextResponse.json({ok:true,response_id:feedback.data.id,business_name:profileResult.data?.business_name||null});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to submit feedback.'},{status:500});}
}