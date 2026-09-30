import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

function authDb(token:string){const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!u||!k)throw Error('Supabase configuration is missing.');return createClient(u,k,{global:{headers:{Authorization:'Bearer '+token}}})}
function db(){const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!u||!k)throw Error('Server database configuration is missing.');return createClient(u,k,{auth:{autoRefreshToken:false,persistSession:false}})}
function esc(v:string){return v.replace(/[&<>"]/g,(x)=>x==='&'?'&amp;':x==='<'?'&lt;':x==='>'?'&gt;':'&quot;')}
function quote(v:string){const t=v.replace(/\\s+/g,' ').trim();return t.length>220?t.slice(0,217)+'…':t}
function svg(business:string,rating:number|null,comment:string,template:string,headline:string){
 const bg=template==='minimal'?'#ffffff':'#f7fbfa',ink=template==='minimal'?'#17202b':'#123b39';
 const safe=esc(quote(comment)),title=esc(headline||'Customer Review'),brand=esc(business||'Your Business');
 const stars=rating?'<text x="70" y="150" font-size="34" font-family="Arial" fill="#d6a514">'+Array(Math.min(5,Math.max(1,rating))).fill('★').join('')+'</text>':'';
 return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" rx="34" fill="'+bg+'"/><rect x="44" y="44" width="1112" height="812" rx="28" fill="'+bg+'" stroke="#dfe9e8"/><text x="70" y="100" font-size="20" font-weight="700" font-family="Arial" fill="#087f7b" letter-spacing="4">GOOGLE REVIEW</text><text x="70" y="132" font-size="27" font-weight="700" font-family="Arial" fill="'+ink+'">'+brand+'</text>'+stars+'<text x="70" y="220" font-size="22" font-weight="700" font-family="Arial" fill="'+ink+'">'+title+'</text><foreignObject x="70" y="255" width="1060" height="410"><div xmlns="http://www.w3.org/1999/xhtml" style="font:400 38px/1.35 Arial;color:'+ink+';">'+safe+'</div></foreignObject><line x1="70" x2="1130" y1="720" y2="720" stroke="#dfe9e8"/><text x="70" y="770" font-size="20" font-family="Arial" fill="#667085">Shared from a real customer review</text><text x="70" y="805" font-size="18" font-family="Arial" fill="#98a2b3">MD Hygiene Social Manager</text></svg>';
}
export async function POST(request:Request){
 try{
  const token=request.headers.get('authorization')?.replace(/^Bearer\\s+/i,'');if(!token)return NextResponse.json({error:'Authentication required.'},{status:401});
  const body=await request.json().catch(()=>({})),reviewId=String(body.reviewId||'').trim(),template=['clean','minimal'].includes(String(body.template||''))?String(body.template):'clean';
  if(!reviewId)return NextResponse.json({error:'reviewId is required.'},{status:400});
  const client=authDb(token),user=await client.auth.getUser(token);if(user.error||!user.data.user)return NextResponse.json({error:'Invalid session.'},{status:401});
  const admin=db(),review=await admin.from('google_business_reviews').select('id,workspace_id,profile_id,rating,comment').eq('id',reviewId).maybeSingle();if(review.error)throw review.error;if(!review.data)return NextResponse.json({error:'Review not found.'},{status:404});
  const member=await admin.from('workplace_members').select('role,active').eq('workspace_id',review.data.workspace_id).eq('user_id',user.data.user.id).eq('active',true).maybeSingle();if(member.error)throw member.error;if(!member.data||!['owner','admin','manager'].includes(String(member.data.role||'').toLowerCase()))return NextResponse.json({error:'Only workspace managers can create review images.'},{status:403});
  const profile=await admin.from('google_business_profiles').select('business_name').eq('id',review.data.profile_id).eq('workspace_id',review.data.workspace_id).maybeSingle();if(profile.error)throw profile.error;
  let headline='A customer review';const apiKey=process.env.OPENAI_API_KEY;
  if(apiKey&&review.data.comment){
   const requested=process.env.OPENAI_REVIEW_MODEL||'gpt-5.6-luna';
   const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:requested,input:[{role:'developer',content:'Create a short neutral headline for a customer review card. Never invent facts.'},{role:'user',content:'Review: '+String(review.data.comment).slice(0,2500)}],max_output_tokens:60,store:false}),cache:'no-store'});
   const d=await r.json().catch(()=>({}));if(r.ok&&!d?.error&&d?.output_text)headline=String(d.output_text).trim().replace(/^["']|["']$/g,'').slice(0,90)||headline;
  }
  const imageUrl='data:image/svg+xml;base64,'+Buffer.from(svg(String(profile.data?.business_name||'Your Business'),review.data.rating, String(review.data.comment||'Thank you for your feedback.'),template,headline),'utf8').toString('base64');
  const saved=await admin.from('review_images').insert({workspace_id:review.data.workspace_id,review_id:review.data.id,image_url:imageUrl,template}).select('id,image_url,template,created_at').single();if(saved.error)throw saved.error;
  return NextResponse.json({ok:true,image:saved.data});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to create review image.'},{status:500})}
}
