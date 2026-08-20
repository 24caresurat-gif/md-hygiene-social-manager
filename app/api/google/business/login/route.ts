import { NextResponse } from 'next/server';

export async function GET(request:Request){
 const clientId=process.env.GOOGLE_BUSINESS_CLIENT_ID;
 if(!clientId)return NextResponse.json({error:'Google Business OAuth is not configured. Add GOOGLE_BUSINESS_CLIENT_ID and GOOGLE_BUSINESS_CLIENT_SECRET in Vercel.'},{status:503});
 const origin=new URL(request.url).origin; const state=crypto.randomUUID();
 const params=new URLSearchParams({client_id:clientId,redirect_uri:`${origin}/api/google/business/callback`,response_type:'code',scope:'https://www.googleapis.com/auth/business.manage',access_type:'offline',prompt:'consent',state});
 const response=NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
 response.cookies.set('google_business_oauth_state',state,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:600});
 return response;
}
