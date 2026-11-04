import { NextResponse } from 'next/server';
import { adminDb } from '../../../../../../lib/workspace-auth';

const validToken=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function resolveProgram(token:string){
  if(!validToken(token))return null;
  const db=adminDb();
  const {data:link,error:linkError}=await db.from('loyalty_program_links')
    .select('workspace_id,program_id').eq('join_token',token).maybeSingle();
  if(linkError)throw linkError;
  if(!link)return null;
  const {data:program,error}=await db.from('loyalty_programs')
    .select('id,workspace_id,name,description,stamps_required,reward_description,is_active')
    .eq('id',link.program_id).eq('workspace_id',link.workspace_id).maybeSingle();
  if(error)throw error;
  if(!program||!program.is_active)return null;
  return program;
}

export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){
  try{
    const {token}=await params;
    const program=await resolveProgram(String(token||''));
    if(!program)return NextResponse.json({error:'This loyalty programme is not active.'},{status:404});
    return NextResponse.json({program:{
      name:program.name,description:program.description,
      stampsRequired:program.stamps_required,rewardDescription:program.reward_description
    }},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'Unable to load this loyalty programme.';
    return NextResponse.json({error:message},{status:500,headers:{'Cache-Control':'no-store'}});
  }
}

export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
  try{
    const {token}=await params;
    const program=await resolveProgram(String(token||''));
    if(!program)return NextResponse.json({error:'This loyalty programme is not active.'},{status:404});
    const body=await request.json().catch(()=>({}));
    const customerName=String(body.customerName||'').trim().replace(/\s+/g,' ');
    const phone=String(body.phone||'').trim().replace(/[^0-9+]/g,'');
    const digits=phone.replace(/\D/g,'');
    if(customerName.length<2||customerName.length>100)return NextResponse.json({error:'Enter your name (2 to 100 characters).'}, {status:400});
    if(digits.length<7||digits.length>15)return NextResponse.json({error:'Enter a valid phone number.'},{status:400});
    const db=adminDb();
    const {data:member,error:memberError}=await db.from('loyalty_members').insert({
      workspace_id:program.workspace_id,program_id:program.id,customer_name:customerName,phone
    }).select('id,workspace_id,program_id,customer_name,stamps,rewards_available,rewards_redeemed,created_at').single();
    if(memberError){
      if(memberError.code==='23505')return NextResponse.json({error:'This phone number is already enrolled. Ask the team to open your existing card.'},{status:409});
      throw memberError;
    }
    const {data:wallet,error:walletError}=await db.from('loyalty_wallet_links')
      .insert({workspace_id:program.workspace_id,member_id:member.id})
      .select('wallet_token').single();
    if(walletError){
      await db.from('loyalty_members').delete().eq('workspace_id',program.workspace_id).eq('id',member.id);
      throw walletError;
    }
    const walletUrl=new URL('/loyalty/wallet/'+wallet.wallet_token,request.url).toString();
    return NextResponse.json({success:true,walletUrl,member:{
      name:member.customer_name,stamps:member.stamps,rewardsAvailable:member.rewards_available,
      rewardsRedeemed:member.rewards_redeemed,stampsRequired:program.stamps_required,
      rewardDescription:program.reward_description,programmeName:program.name
    }},{status:201,headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'Unable to join this loyalty programme.';
    return NextResponse.json({error:message},{status:500,headers:{'Cache-Control':'no-store'}});
  }
}
