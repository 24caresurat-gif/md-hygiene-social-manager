'use client';
import {useEffect,useState} from 'react';
import AppShell from '../../components/AppShell';
import {getSupabase} from '../../../../lib/supabase-browser';

type Req={id:string;source:string|null;status:string|null;feedback_rating:number|null;google_clicked_at:string|null;created_at:string};
type Fb={id:string;customer_name:string|null;rating:number|null;created_at:string};
type Rev={id:string;rating:number|null;reply_status:string|null;review_time:string|null};
type Stand={id:string;label:string|null;scan_count:number};

const css=`.rs-page{display:grid;gap:16px}.rs-stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}.rs-stat{padding:16px}.rs-stat span{display:block;color:#667085;font-size:10px;font-weight:800}.rs-stat strong{display:block;font-size:24px;margin-top:6px}.rs-stat small{display:block;color:#8a95a3;font-size:9px;margin-top:4px}.rs-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.rs-pad{padding:20px}.rs-step{margin-top:14px}.rs-steplabel{display:flex;justify-content:space-between;font-size:11px;font-weight:800;margin-bottom:6px}.rs-bar{height:10px;background:#edf0f3;border-radius:999px;overflow:hidden}.rs-fill{height:100%;background:#087f7b;border-radius:999px}.rs-fill.warm{background:#f5a524}.rs-muted{color:#667085;font-size:10px;line-height:1.5;margin-top:4px}.rs-row{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid #edf0f3;font-size:11px}.rs-row:first-of-type{border-top:0}.rs-empty{padding:20px 0;color:#667085;font-size:11px}.rs-controls{display:flex;gap:8px;align-items:center}.rs-controls select{border:1px solid #dbe4e8;border-radius:10px;padding:9px 12px;min-height:40px}.rs-note{padding:14px 18px;border-radius:12px;background:#fff7e6;color:#8a5a00;font-size:11px;line-height:1.5}.rs-dist{display:grid;grid-template-columns:34px minmax(0,1fr) 34px;gap:10px;align-items:center;margin-top:10px;font-size:11px}@media(max-width:1100px){.rs-stats{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:700px){.rs-stats,.rs-two{grid-template-columns:1fr}}`;

const WINDOWS=[{d:7,l:'Last 7 days'},{d:30,l:'Last 30 days'},{d:90,l:'Last 90 days'},{d:0,l:'All time'}];
const SOURCES:Record<string,string>={qr:'QR standee',whatsapp:'WhatsApp',email:'Email',sms:'SMS',manual:'Manual link'};
const pct=(a:number,b:number)=>b>0?Math.round((a/b)*100):0;
const avg=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
function fmt(v:string|null){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}

export default function ReviewStatusPage(){
 const[workspaceId,setWorkspaceId]=useState(''),[reqs,setReqs]=useState<Req[]>([]),[fbs,setFbs]=useState<Fb[]>([]),[revs,setRevs]=useState<Rev[]>([]),[stands,setStands]=useState<Stand[]>([]),[hasGoogle,setHasGoogle]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[days,setDays]=useState(30);

 async function load(id:string){
  setLoading(true);setError('');
  try{
   const sb=getSupabase();
   const[r,f,v,s,p]=await Promise.all([
    sb.from('review_requests').select('id,source,status,feedback_rating,google_clicked_at,created_at').eq('workspace_id',id).order('created_at',{ascending:false}).limit(2000),
    sb.from('feedback_responses').select('id,customer_name,rating,created_at').eq('workspace_id',id).order('created_at',{ascending:false}).limit(2000),
    sb.from('google_business_reviews').select('id,rating,reply_status,review_time').eq('workspace_id',id).order('review_time',{ascending:false}).limit(2000),
    sb.from('qr_standees').select('id,label,scan_count').eq('workspace_id',id).order('scan_count',{ascending:false}),
    sb.from('google_business_profiles').select('id').eq('workspace_id',id).limit(1)
   ]);
   if(r.error)throw r.error;if(f.error)throw f.error;if(v.error)throw v.error;if(s.error)throw s.error;if(p.error)throw p.error;
   setReqs((r.data||[]) as Req[]);setFbs((f.data||[]) as Fb[]);setRevs((v.data||[]) as Rev[]);setStands((s.data||[]) as Stand[]);setHasGoogle((p.data||[]).length>0);
  }catch(e){setError(e instanceof Error?e.message:'Unable to load review status.')}finally{setLoading(false)}
 }

 useEffect(()=>{
  let id='';
  try{id=localStorage.getItem('mdsm:selectedWorkspaceId')||''}catch{}
  setWorkspaceId(id);
  const onWorkspace=(event:Event)=>{
   const next=(event as CustomEvent<{workspaceId?:string}>).detail?.workspaceId||'';
   if(next&&next!==id){id=next;setWorkspaceId(next);void load(next)}
  };
  window.addEventListener('mdsm:workspace-changed',onWorkspace);
  if(id)void load(id);else setLoading(false);
  return()=>window.removeEventListener('mdsm:workspace-changed',onWorkspace);
 },[]);

 const cutoff=days>0?Date.now()-days*86400000:0;
 const within=(v:string|null)=>{if(!days)return true;if(!v)return false;const t=new Date(v).getTime();return !Number.isNaN(t)&&t>=cutoff};

 const rq=reqs.filter(x=>within(x.created_at));
 const total=rq.length;
 const opened=rq.filter(x=>(x.status&&x.status!=='sent')||x.feedback_rating!=null||x.google_clicked_at).length;
 const rated=rq.filter(x=>x.feedback_rating!=null).length;
 const clicked=rq.filter(x=>x.google_clicked_at).length;
 const steps=[{label:'Requests sent or QR scans',n:total},{label:'Opened',n:opened},{label:'Rated',n:rated},{label:'Sent to Google',n:clicked}];

 const bySource:Record<string,number>={};
 rq.forEach(x=>{const k=x.source||'manual';bySource[k]=(bySource[k]||0)+1});
 const sourceRows=Object.keys(bySource).sort((a,b)=>bySource[b]-bySource[a]);

 const fb=fbs.filter(x=>within(x.created_at));
 const fbRatings=fb.map(x=>x.rating).filter((n):n is number=>n!=null);
 const low=fb.filter(x=>x.rating!=null&&x.rating<=3);

 const rv=revs.filter(x=>within(x.review_time));
 const rvRatings=rv.map(x=>x.rating).filter((n):n is number=>n!=null);
 const needsReply=revs.filter(x=>x.reply_status!=='replied').length;
 const dist=[5,4,3,2,1].map(n=>({n,c:rv.filter(x=>x.rating===n).length}));
 const maxDist=Math.max(1,...dist.map(x=>x.c));

 const scans=stands.reduce((a,b)=>a+Number(b.scan_count||0),0);
 const empty=!loading&&!reqs.length&&!fbs.length&&!revs.length&&!stands.length;

 return <AppShell title='Google Business & Reviews'><style>{css}</style>
 <div className='rs-page'>
  <div className='page-head'><div><div className='eyebrow'>REVIEW STATUS</div><h1>Review Status Dashboard</h1><p>How customers move from a review request to feedback and Google, plus your Google review health.</p></div>
   <div className='rs-controls'><select value={days} onChange={e=>setDays(Number(e.target.value))}>{WINDOWS.map(w=><option key={w.d} value={w.d}>{w.l}</option>)}</select><button className='btn btn-soft' onClick={()=>{location.href='/dashboard/gmb/requests'}}>Review Requests</button></div></div>
  {error&&<div className='alert alert-error'>{error}</div>}
  {!workspaceId&&!loading&&<div className='rs-note'>Select a workspace to see its review status.</div>}
  {workspaceId&&!loading&&!hasGoogle&&<div className='rs-note'>Google Business is not connected for this workspace yet, so Google review numbers will show zero until you connect and sync. Request and feedback numbers work without it.</div>}
  {empty&&workspaceId&&<div className='rs-note'>No review activity yet. Create a review request to start collecting feedback; the numbers below fill in as customers respond.</div>}
  <div className='rs-stats'>
   <article className='panel rs-stat'><span>Review requests</span><strong>{loading?'—':total}</strong><small>{WINDOWS.find(w=>w.d===days)?.l}</small></article>
   <article className='panel rs-stat'><span>Avg feedback rating</span><strong>{loading||!fbRatings.length?'—':avg(fbRatings).toFixed(1)}</strong><small>{fbRatings.length} responses</small></article>
   <article className='panel rs-stat'><span>Low ratings</span><strong>{loading?'—':low.length}</strong><small>3 stars or below</small></article>
   <article className='panel rs-stat'><span>Google reviews</span><strong>{loading?'—':rv.length}</strong><small>{rvRatings.length?'Avg '+avg(rvRatings).toFixed(1):'No ratings yet'}</small></article>
   <article className='panel rs-stat'><span>Needs reply</span><strong>{loading?'—':needsReply}</strong><small>All time</small></article>
   <article className='panel rs-stat'><span>Standee scans</span><strong>{loading?'—':scans}</strong><small>All time</small></article>
  </div>
  <div className='rs-two'>
   <section className='panel rs-pad'>
    <div className='eyebrow'>FUNNEL</div><h2 style={{margin:'5px 0 0'}}>From request to Google</h2>
    {steps.map(s=><div className='rs-step' key={s.label}><div className='rs-steplabel'><span>{s.label}</span><strong>{loading?'—':s.n}</strong></div><div className='rs-bar'><div className='rs-fill' style={{width:pct(s.n,total)+'%'}}/></div><div className='rs-muted'>{pct(s.n,total)+'% of requests'}</div></div>)}
   </section>
   <section className='panel rs-pad'>
    <div className='eyebrow'>GOOGLE REVIEWS</div><h2 style={{margin:'5px 0 0'}}>Rating spread</h2>
    {!rv.length?<div className='rs-empty'>No Google reviews in this period.</div>:dist.map(x=><div className='rs-dist' key={x.n}><span>{x.n} star</span><div className='rs-bar'><div className={'rs-fill'+(x.n<=3?' warm':'')} style={{width:pct(x.c,maxDist)+'%'}}/></div><strong>{x.c}</strong></div>)}
   </section>
   <section className='panel rs-pad'>
    <div className='eyebrow'>SOURCES</div><h2 style={{margin:'5px 0 6px'}}>Where requests come from</h2>
    {!sourceRows.length?<div className='rs-empty'>No requests in this period.</div>:sourceRows.map(k=><div className='rs-row' key={k}><span>{SOURCES[k]||k}</span><strong>{bySource[k]}</strong></div>)}
   </section>
   <section className='panel rs-pad'>
    <div className='eyebrow'>NEEDS ATTENTION</div><h2 style={{margin:'5px 0 6px'}}>Recent low ratings</h2>
    {!low.length?<div className='rs-empty'>No low ratings in this period.</div>:low.slice(0,5).map(x=><div className='rs-row' key={x.id}><span>{x.customer_name||'Anonymous customer'}</span><span><strong>{x.rating} star</strong> · {fmt(x.created_at)}</span></div>)}
   </section>
   <section className='panel rs-pad'>
    <div className='eyebrow'>STANDEES</div><h2 style={{margin:'5px 0 6px'}}>Most scanned</h2>
    {!stands.length?<div className='rs-empty'>No standees created yet.</div>:stands.slice(0,5).map(x=><div className='rs-row' key={x.id}><span>{x.label||'Standee'}</span><strong>{x.scan_count} scans</strong></div>)}
   </section>
  </div>
 </div>
 </AppShell>
}
