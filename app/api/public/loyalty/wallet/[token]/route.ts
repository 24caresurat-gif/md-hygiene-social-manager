import { NextResponse } from 'next/server';
import { adminDb } from '../../../../../../lib/workspace-auth';

const validToken=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){
  try{
    const {token}=await params;
    if(!validToken(String(token||'')))return NextResponse.json({error:'This loyalty card link is invalid.'},{status:404});
    const db=adminDb();
    const {data:link,error:linkError}=await db.from('loyalty_wallet_links')
      .select('workspace_id,member_id').eq('wallet_token',token).maybeSingle();
    if(linkError)throw linkError;
    if(!link)return NextResponse.json({error:'This loyalty card could not be found.'},{status:404});
    const {data:member,error:memberError}=await db.from('loyalty_members')
      .select('id,program_id,customer_name,stamps,rewards_available,rewards_redeemed,created_at')
      .eq('id',link.member_id).eq('workspace_id',link.workspace_id).maybeSingle();
    if(memberError)throw memberError;
    if(!member)return NextResponse.json({error:'This loyalty card is no longer available.'},{status:404});
    const {data:program,error:programError}=await db.from('loyalty_programs')
      .select('name,stamps_required,reward_description,is_active')
      .eq('id',member.program_id).eq('workspace_id',link.workspace_id).maybeSingle();
    if(programError)throw programError;
    if(!program)return NextResponse.json({error:'The loyalty programme was not found.'},{status:404});
    return NextResponse.json({wallet:{
      customerName:member.customer_name,
      stamps:member.stamps,
      rewardsAvailable:member.rewards_available,
      rewardsRedeemed:member.rewards_redeemed,
      stampsRequired:program.stamps_required,
      rewardDescription:program.reward_description,
      programmeName:program.name,
      programmeActive:program.is_active,
      createdAt:member.created_at
    }},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'Unable to load your loyalty card.';
    return NextResponse.json({error:message},{status:500,headers:{'Cache-Control':'no-store'}});
  }
}
