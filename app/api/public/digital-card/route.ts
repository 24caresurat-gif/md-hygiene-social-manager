import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/workspace-auth';

export async function GET(request:Request){
 try{
  const slug=String(new URL(request.url).searchParams.get('slug')||'').trim().toLowerCase();
  if(!slug)return NextResponse.json({error:'slug is required.'},{status:400});
  const db=adminDb();
  const {data:card,error}=await db.from('digital_cards').select('*').eq('profile_slug',slug).maybeSingle();
  if(error)throw error;if(!card)return NextResponse.json({error:'Digital card not found.'},{status:404});
  const [c,s,sv,t,e,p]=await Promise.all([
   db.from('digital_card_contacts').select('label,value,kind,sort_order').eq('digital_card_id',card.id).eq('active',true).order('sort_order'),
   db.from('digital_card_social_links').select('platform,url,sort_order').eq('digital_card_id',card.id).eq('active',true).order('sort_order'),
   db.from('digital_card_services').select('name,description,price,sort_order').eq('digital_card_id',card.id).eq('active',true).order('sort_order'),
   db.from('digital_card_testimonials').select('customer_name,quote,rating,sort_order').eq('digital_card_id',card.id).eq('active',true).order('sort_order'),
   db.from('digital_card_embeds').select('title,embed_code,sort_order').eq('digital_card_id',card.id).eq('active',true).order('sort_order'),
   db.from('digital_card_payments').select('provider,payment_url,label').eq('digital_card_id',card.id).eq('active',true).order('created_at')
  ]);
  for(const x of [c,s,sv,t,e,p])if(x.error)throw x.error;
  return NextResponse.json({card,contacts:c.data||[],socialLinks:s.data||[],services:sv.data||[],testimonials:t.data||[],embeds:e.data||[],payments:p.data||[]});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to load digital card.'},{status:500});}
}

export async function POST(request:Request){
 try{
  const body=await request.json().catch(()=>({}));const slug=String(body.slug||'').trim().toLowerCase();const type=String(body.type||'');
  if(!slug||!['lead','contact'].includes(type))return NextResponse.json({error:'slug and form type are required.'},{status:400});
  const db=adminDb();const {data:card,error}=await db.from('digital_cards').select('id,lead_capture_enabled,contact_form_enabled').eq('profile_slug',slug).maybeSingle();
  if(error)throw error;if(!card)return NextResponse.json({error:'Digital card not found.'},{status:404});
  const name=String(body.name||'').trim();const email=String(body.email||'').trim();const phone=String(body.phone||'').trim();const message=String(body.message||'').trim();
  if(!name||(!email&&!phone))return NextResponse.json({error:'Name and email or phone are required.'},{status:400});
  if(type==='lead'&&!card.lead_capture_enabled)return NextResponse.json({error:'Lead capture is disabled.'},{status:403});
  if(type==='contact'&&!card.contact_form_enabled)return NextResponse.json({error:'Contact form is disabled.'},{status:403});
  if(type==='lead'){
   const {error:insertError}=await db.from('digital_card_leads').insert({digital_card_id:card.id,name,email,phone,message,source:'digital_card'});
   if(insertError)throw insertError;
  }else{
   const {error:insertError}=await db.from('digital_card_messages').insert({digital_card_id:card.id,name,email,phone,subject:String(body.subject||'').trim()||null,message});
   if(insertError)throw insertError;
  }
  return NextResponse.json({success:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to submit form.'},{status:500});}
}