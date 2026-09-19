'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { getSupabase } from '../../../lib/supabase-browser';

type Location = { id:string; business_name:string; location_id:string; address:string|null; phone:string|null; website:string|null; category:string|null; review_url:string|null; status:string };
type Review = { id:string; reviewer_name:string|null; rating:number|null; comment:string|null; review_time:string|null; reply_text:string|null; reply_status:string };

const dateLabel=(v:string|null)=>{if(!v)return 'Date unavailable';const d=new Date(v);return Number.isNaN(d.getTime())?'Date unavailable':d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})};

export default function GmbPage(){
  const[workspaceId,setWorkspaceId]=useState(''),[locations,setLocations]=useState<Location[]>([]),[reviews,setReviews]=useState<Review[]>([]);
  const[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('');

  async function getToken(){const s=(await getSupabase().auth.getSession()).data.session;if(!s){location.href='/login';throw new Error('Your session has expired.')}return s.access_token}
  async function loadData(id:string){
    setLoading(true);setError('');
    try{
      const sb=getSupabase();
      const [{data:l,error:le},{data:r,error:re}]=await Promise.all([
        sb.from('google_business_profiles').select('id,business_name,location_id,address,phone,website,category,review_url,status').eq('workspace_id',id).order('business_name'),
        sb.from('google_business_reviews').select('id,reviewer_name,rating,comment,review_time,reply_text,reply_status').eq('workspace_id',id).order('review_time',{ascending:false}).limit(20),
      ]);
      if(le)throw le;if(re)throw re;setLocations((l||[]) as Location[]);setReviews((r||[]) as Review[]);
    }catch(e){setError(e instanceof Error?e.message:'Unable to load Google Business data.')}finally{setLoading(false)}
  }
  useEffect(()=>{
    let id='';try{id=new URLSearchParams(location.search).get('brandId')||localStorage.getItem('mdsm:selectedWorkspaceId')||''}catch{}setWorkspaceId(id);
    const p=new URLSearchParams(location.search);
    if(p.get('google')==='connected')setMessage(`Google connected: ${p.get('accounts')||0} account(s), ${p.get('locations')||0} location(s), ${p.get('reviews')||0} review(s) imported.`);
    if(p.get('google_error'))setError(
      p.get('google_error')==='config'?'Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel.':
      p.get('google_error')==='oauth_state'?'Google authorization could not be verified. Please try Connect Google again.':
      p.get('google_error')==='session'?'Your login session was not available for the Google connection. Please sign in again.':
      p.get('google_error')==='cancelled'?'Google authorization was cancelled.':p.get('google_error')||'Google Business connection failed.'
    );
    if(id)void loadData(id);else setLoading(false);
  },[]);
  async function connectGoogle(){
    setBusy('connect');setError('');setMessage('');
    try{
      if(!workspaceId)throw new Error('Select a workspace before connecting Google.');
      const token=await getToken();
      const r=await fetch('/api/google/business/login',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({workspaceId})});
      const d=await r.json().catch(()=>({}));if(!r.ok||!d?.url)throw new Error(d?.error||'Unable to start Google OAuth.');
      location.assign(d.url);
    }catch(e){setError(e instanceof Error?e.message:'Unable to connect Google.');setBusy('')}
  }
  async function syncGoogle(){
    setBusy('sync');setError('');setMessage('');
    try{
      const token=await getToken();
      const r=await fetch('/api/google/business/sync',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({workspaceId})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||'Google sync failed.');
      setMessage(`Google sync complete: ${d.locations||0} location(s), ${d.reviews||0} review(s) processed.`);await loadData(workspaceId);
    }catch(e){setError(e instanceof Error?e.message:'Google sync failed.')}finally{setBusy('')}
  }

  return <AppShell title="Google Business & Reviews">
    <style jsx>{`
      .gmb{display:grid;gap:16px}.connect{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:20px}.connect h2{margin:5px 0}.connect p{margin:0;max-width:760px}.actions{display:flex;gap:9px;flex-wrap:wrap}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.stat{padding:16px}.stat span{display:block;color:#667085;font-size:10px;font-weight:800}.stat strong{display:block;font-size:24px;margin-top:6px}.locations{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;padding:0 18px 18px}.loc{padding:17px}.loc h3{margin:0 0 4px;font-size:14px}.loc p{margin:0;color:#667085;font-size:10px;line-height:1.5}.badge{padding:6px 9px;border-radius:999px;background:#edf8f1;color:#14804a;font-size:9px;font-weight:900;height:max-content}.lochead{display:flex;justify-content:space-between;gap:12px}.meta{display:grid;gap:5px;margin-top:14px;padding-top:12px;border-top:1px solid #edf0f3;color:#475467;font-size:10px}.reviews{overflow:hidden}.review{display:grid;grid-template-columns:170px 64px minmax(0,1fr) 92px;gap:12px;padding:13px 18px;border-top:1px solid #edf0f3;align-items:start}.reviewer strong,.reviewer small{display:block}.reviewer strong{font-size:11px}.reviewer small{color:#8a95a3;font-size:9px;margin-top:3px}.stars{font-size:11px;font-weight:900}.comment{font-size:10px;line-height:1.55;color:#475467;white-space:pre-wrap}.reply{text-align:right;font-size:9px;font-weight:900}.replied{color:#14804a}.pending{color:#b54708}.empty{padding:42px 20px;text-align:center;color:#667085;font-size:11px}@media(max-width:900px){.connect{align-items:flex-start;flex-direction:column}.stats,.locations{grid-template-columns:1fr}.review{grid-template-columns:1fr 64px}.comment{grid-column:1/-1}.reply{text-align:left}}
    `}</style>
    <div className="gmb">
      <div className="page-head"><div><div className="eyebrow">GOOGLE BUSINESS PROFILE</div><h1>Google Business & Reviews</h1><p>Workspace-scoped Business Profile locations and live review data. No placeholder Google data is used.</p></div></div>
      {error&&<div className="alert alert-error">{error}</div>}{message&&<div className="alert alert-success">{message}</div>}
      <section className="panel connect"><div><div className="eyebrow">GOOGLE CONNECTION</div><h2>Connect this workspace to Google</h2><p>Use the Google account that manages the Business Profile locations for this workspace. OAuth tokens stay server-side.</p></div><div className="actions">{locations.length>0&&<button className="btn btn-soft" onClick={()=>void syncGoogle()} disabled={busy!==''}>{busy==='sync'?'Syncing…':'↻ Sync from Google'}</button>}<button className="btn btn-primary" onClick={()=>void connectGoogle()} disabled={busy!==''}>{busy==='connect'?'Opening Google…':locations.length?'Reconnect Google':'Connect Google'}</button></div></section>
      <div className="stats"><article className="panel stat"><span>Connected Locations</span><strong>{loading?'—':locations.length}</strong></article><article className="panel stat"><span>Imported Reviews</span><strong>{loading?'—':reviews.length}</strong></article><article className="panel stat"><span>Unreplied Reviews</span><strong>{loading?'—':reviews.filter(x=>x.reply_status!=='replied').length}</strong></article></div>
      <section className="panel"><div className="panel-head"><div><div className="eyebrow">CONNECTED LOCATIONS</div><h2>Business Profile locations</h2><p>{workspaceId?'Scoped to the selected workspace.':'Select a workspace first.'}</p></div></div>{loading?<div className="empty">Loading Google Business data…</div>:locations.length===0?<div className="empty">No Google location connected yet. Click “Connect Google” to import live locations.</div>:<div className="locations">{locations.map(x=><article className="panel loc" key={x.id}><div className="lochead"><div><h3>{x.business_name}</h3><p>{x.category||'Business Profile location'}</p></div><span className="badge">{x.status}</span></div><div className="meta"><span>{x.address||'Address unavailable'}</span><span>{x.phone||'Phone unavailable'}</span><span>{x.website||'Website unavailable'}</span>{x.review_url&&<a href={x.review_url} target="_blank" rel="noreferrer" style={{color:'#087f7b',fontWeight:800}}>Open Google review link →</a>}</div></article>)}</div>}</section>
      <section className="panel reviews"><div className="panel-head"><div><div className="eyebrow">REVIEW MANAGEMENT</div><h2>Latest Google reviews</h2><p>Imported from connected Business Profile locations.</p></div></div>{reviews.length===0?<div className="empty">No Google reviews imported yet.</div>:reviews.map(x=><div className="review" key={x.id}><div className="reviewer"><strong>{x.reviewer_name||'Google reviewer'}</strong><small>{dateLabel(x.review_time)}</small></div><div className="stars">{x.rating?'★'.repeat(x.rating):'—'}</div><div className="comment">{x.comment||'Rating-only review'}</div><div className={`reply ${x.reply_status==='replied'?'replied':'pending'}`}>{x.reply_status==='replied'?'✓ Replied':'● Needs reply'}</div></div>)}</section>
      <div className="locations">{[['Review Requests','Generate customer review-request links and QR campaigns.'],['Feedback Forms','Collect structured customer feedback for this workspace.'],['AI Review Suggestions','Draft review and reply suggestions for approval.'],['Keywords Management','Maintain workspace-specific keywords and categories.'],['AI Review Images','Store image assets used by review campaigns.']].map(([t,d])=><section className="panel" style={{padding:18}} key={t}><div className="eyebrow">MODULE</div><h2 style={{fontSize:15,margin:'5px 0'}}>{t}</h2><p style={{fontSize:11}}>{d}</p><span className="btn btn-soft" style={{display:'inline-flex'}}>Database ready</span></section>)}</div>
    </div>
  </AppShell>;
}
