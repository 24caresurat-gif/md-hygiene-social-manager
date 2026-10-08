import { NextResponse } from 'next/server';
import { adminDb, authenticatedUser, workspaceAccess } from '../../../../lib/workspace-auth';

export async function GET(request:Request){
  try{
    const url=new URL(request.url);
    const workspaceId=String(url.searchParams.get('workspaceId')||'').trim();
    const q=String(url.searchParams.get('q')||'').trim().toLowerCase();
    if(!workspaceId)return NextResponse.json({error:'workspaceId is required.'},{status:400});
    const user=await authenticatedUser(request);
    const db=adminDb();
    const access=await workspaceAccess(db,user.id,workspaceId);
    if(!access?.hasAccess)return NextResponse.json({error:'You do not have access to this workspace.'},{status:403});

    const {data,error}=await db.from('catalog_products')
      .select('id,name,slug,description,image_url,price,compare_at_price,featured,stock_quantity,category_id,catalog_categories(name)')
      .eq('workspace_id',workspaceId).eq('active',true).order('featured',{ascending:false}).order('created_at',{ascending:false}).limit(50);
    if(error)throw error;
    const terms=q.split(/\s+/).filter(Boolean);
    const products=(data||[]).map((p:any)=>{
      const haystack=[p.name,p.description,p.catalog_categories?.name].filter(Boolean).join(' ').toLowerCase();
      const matches=terms.filter(t=>haystack.includes(t)).length;
      const availability=Number(p.stock_quantity||0)>0?3:0;
      const featured=p.featured?2:0;
      return {...p,_score:matches*10+availability+featured};
    }).filter((p:any)=>!terms.length||p._score>0).sort((a:any,b:any)=>b._score-a._score).slice(0,8);
    return NextResponse.json({suggestions:products.map(({_score,...p}:any)=>p)});
  }catch(e){
    const m=e instanceof Error?e.message:'Unable to load product suggestions.';
    return NextResponse.json({error:m},{status:/Authentication|session/i.test(m)?401:500});
  }
}