import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function fallback(review:any,keywords:string[]){
  const name=String(review?.reviewer_name||'there').split(' ')[0];
  const keyword=keywords[0]||'';
  if(Number(review?.rating||0)>=4)return 'Hi '+name+', thank you for sharing your experience. We really appreciate your feedback'+(keyword?' about '+keyword:'')+'. We look forward to serving you again soon!';
  return 'Hi '+name+', thank you for taking the time to share this feedback. We are sorry your experience did not meet expectations. Your comments are important to us, and we would appreciate the opportunity to understand what happened and make it better.';
}

export async function POST(request:Request){
  try{
    const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
    if(!token)return NextResponse.json({error:'Authentication required.'},{status:401});
    const body=await request.json().catch(()=>({})),reviewId=String(body.reviewId||'').trim();
    if(!reviewId)return NextResponse.json({error:'reviewId is required.'},{status:400});
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if(!url||!key)throw new Error('Supabase configuration is missing.');
    const supabase=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}}});
    const {data:userData,error:userError}=await supabase.auth.getUser(token);
    if(userError||!userData.user)return NextResponse.json({error:'Invalid session.'},{status:401});
    const review=await supabase.from('google_business_reviews').select('id,workspace_id,reviewer_name,rating,comment').eq('id',reviewId).maybeSingle();
    if(review.error)throw review.error;if(!review.data)return NextResponse.json({error:'Review not found.'},{status:404});
    const member=await supabase.from('workplace_members').select('role,active').eq('workspace_id',review.data.workspace_id).eq('user_id',userData.user.id).eq('active',true).maybeSingle();
    if(member.error)throw member.error;if(!member.data)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});
    const kw=await supabase.from('workspace_keywords').select('keyword').eq('workspace_id',review.data.workspace_id).eq('active',true).limit(30);
    if(kw.error)throw kw.error;
    const keywords=(kw.data||[]).map((x:any)=>String(x.keyword||'').trim()).filter(Boolean);
    const apiKey=process.env.OPENAI_API_KEY;let content='',model='template-fallback';
    if(apiKey){
      const requested=process.env.OPENAI_REVIEW_MODEL||'gpt-5.6-luna';
      const prompt='Write one concise, warm, professional Google Business Profile reply. Never invent facts, discounts, remedies, policies, or promises. Do not mention AI. Keep it under 450 characters. Reviewer: '+String(review.data.reviewer_name||'Customer')+'. Rating: '+String(review.data.rating||'unknown')+'/5. Review: '+String(review.data.comment||'Rating only')+'. Preferred business keywords, only when natural: '+(keywords.join(', ')||'none')+'.';
      const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:requested,input:[{role:'developer',content:'You draft customer-facing review replies for a business.'},{role:'user',content:prompt}],max_output_tokens:180,store:false}),cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data?.error)throw new Error(data?.error?.message||'AI suggestion generation failed.');
      content=String(data?.output_text||'').trim();model=requested;if(!content)throw new Error('AI returned an empty suggestion.');
    }else content=fallback(review.data,keywords);
    const saved=await supabase.from('ai_review_suggestions').insert({workspace_id:review.data.workspace_id,review_id:review.data.id,suggestion_type:'reply',content,model,approved:false}).select('id,content,model,created_at').single();
    if(saved.error)throw saved.error;
    return NextResponse.json({ok:true,suggestion:saved.data});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to generate review suggestion.'},{status:500});}
}