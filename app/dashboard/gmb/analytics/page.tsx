'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { getSupabase } from '../../../../lib/supabase-browser';

type Analytics = {
  metrics: { reviews:number; replied:number; needsReply:number; responseRate:number; averageRating:number|null; positive:number; negative:number; locations:number; connections:number };
  ratingDistribution: {rating:number;count:number}[];
  daily: {date:string;reviews:number;replied:number;averageRating:number|null}[];
  monthly: {month:string;reviews:number;replied:number;negative:number;averageRating:number|null}[];
  locations: {id:string;business_name:string;status:string;reviews:number;averageRating:number|null;needsReply:number;negative:number}[];
  connections: {id:string;account_name:string|null;token_status:string|null;token_error:string|null;updated_at:string}[];
};

const css=`
.analytics{display:grid;gap:16px}
.hero{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
.hero h1{margin:5px 0}.hero p{margin:5px 0 0;max-width:780px}
.actions{display:flex;gap:8px;flex-wrap:wrap}.periods{display:flex;gap:6px;flex-wrap:wrap}
.period{border:1px solid #dbe4e8;background:#fff;border-radius:9px;padding:8px 10px;font-size:9px;font-weight:900;cursor:pointer}
.period.active{background:#edf8f7;border-color:#b9dfdc;color:#087f7b}
.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.metric{padding:15px}.metric span{display:block;font-size:9px;color:#667085;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.metric strong{display:block;font-size:23px;margin-top:6px}.metric small{display:block;color:#8a95a3;font-size:9px;margin-top:3px}
.grid{display:grid;grid-template-columns:1.25fr .75fr;gap:14px}
.panel-pad{padding:17px}
.chart{height:220px;display:flex;align-items:flex-end;gap:5px;overflow:hidden;padding:14px 0 0}
.column{flex:1;min-width:5px;background:#b9dfdc;border-radius:5px 5px 2px 2px;position:relative}.column span{position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);font-size:7px;color:#98a3aa;white-space:nowrap}
.rating-list{display:grid;gap:9px}.rating-row{display:grid;grid-template-columns:32px 1fr 30px;gap:8px;align-items:center;font-size:10px}.bar{height:9px;border-radius:99px;background:#edf0f3;overflow:hidden}.fill{height:100%;background:#087f7b}
.table{width:100%;border-collapse:collapse}.table th{padding:10px;text-align:left;font-size:8px;color:#667085;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e9eef0}.table td{padding:11px 10px;font-size:10px;border-bottom:1px solid #edf0f3}.table tr:last-child td{border-bottom:0}
.name{font-weight:850;color:#25323b}.muted{color:#7a8791}.status{padding:5px 8px;border-radius:999px;background:#edf8f1;color:#14804a;font-size:8px;font-weight:900}.warn{background:#fff7e8;color:#b54708}.danger{background:#fff1f0;color:#b42318}
.empty{padding:40px 20px;text-align:center;color:#667085;font-size:11px}.note{font-size:10px;color:#667085;line-height:1.55}
@media(max-width:1000px){.metrics{grid-template-columns:repeat(3,1fr)}.grid{grid-template-columns:1fr}}
@media(max-width:650px){.metrics{grid-template-columns:1fr 1fr}.hero{align-items:flex-start;flex-direction:column}}
`;

const fmtMonth=(v:string)=>{const d=new Date(v+'-01T00:00:00');return Number.isNaN(d.getTime())?'—':d.toLocaleDateString(undefined,{month:'short',year:'numeric'})};
const fmtDate=(v:string)=>{const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString(undefined,{day:'numeric',month:'short'})};

export default function GbmAnalyticsPage(){
 const[workspaceId,setWorkspaceId]=useState(''),[data,setData]=useState<Analytics|null>(null),[days,setDays]=useState(90),[loading,setLoading]=useState(true),[error,setError]=useState('');
 async function load(id:string,period=days){
  setLoading(true);setError('');
  try{
   const session=(await getSupabase().auth.getSession()).data.session;
   if(!session){location.href='/login';return}
   const r=await fetch('/api/google/business/analytics?workspaceId='+encodeURIComponent(id)+'&days='+period,{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||'Unable to load Google Business analytics.');
   setData(d as Analytics);
  }catch(e){setError(e instanceof Error?e.message:'Unable to load Google Business analytics.')}finally{setLoading(false)}
 }
 useEffect(()=>{
  let current='';try{current=localStorage.getItem('mdsm:selectedWorkspaceId')||''}catch{}setWorkspaceId(current);
  const onWorkspace=(event:Event)=>{const next=(event as CustomEvent<{workspaceId?:string}>).detail?.workspaceId||'';if(next&&next!==current){current=next;setWorkspaceId(next);void load(next,days)}};
  window.addEventListener('mdsm:workspace-changed',onWorkspace);if(current)void load(current);else setLoading(false);
  return()=>window.removeEventListener('mdsm:workspace-changed',onWorkspace);
 },[]);
 const maxDaily=useMemo(()=>Math.max(...(data?.daily||[]).map(x=>x.reviews),1),[data]);
 const maxRating=useMemo(()=>Math.max(...(data?.ratingDistribution||[]).map(x=>x.count),1),[data]);
 const latestDaily=(data?.daily||[]).slice(-30);
 return <AppShell title='Google Business & Reviews'><style>{css}</style>
 <div className='analytics'>
  <div className='hero'><div className='page-head'><div className='eyebrow'>GOOGLE BUSINESS ANALYTICS</div><h1>Review Analytics</h1><p>Workspace-scoped review trends, response activity, rating mix, location performance and connection health.</p></div><div className='actions'><div className='periods'>{[30,90,180,365].map(p=><button key={p} className={'period '+(days===p?'active':'')} onClick={()=>{setDays(p);if(workspaceId)void load(workspaceId,p)}}>{p} days</button>)}</div><button className='btn' onClick={()=>location.href='/dashboard/gmb'}>← Google Business</button></div></div>
  {error&&<div className='alert alert-error'>{error}</div>}
  <div className='metrics'>
   <article className='panel metric'><span>Reviews</span><strong>{loading?'—':data?.metrics.reviews??0}</strong><small>Within selected period</small></article>
   <article className='panel metric'><span>Average rating</span><strong>{loading?'—':data?.metrics.averageRating??'—'}</strong><small>Imported ratings</small></article>
   <article className='panel metric'><span>Response rate</span><strong>{loading?'—':(data?.metrics.responseRate??0)+'%'}</strong><small>Reviews with replies</small></article>
   <article className='panel metric'><span>Needs reply</span><strong>{loading?'—':data?.metrics.needsReply??0}</strong><small>Pending replies</small></article>
   <article className='panel metric'><span>Negative 1–2★</span><strong>{loading?'—':data?.metrics.negative??0}</strong><small>Rating-based count</small></article>
  </div>
  {loading?<section className='panel empty'>Loading analytics…</section>:!data?<section className='panel empty'>No analytics available.</section>:<>
   <div className='grid'>
    <section className='panel panel-pad'><div className='panel-head'><div><div className='eyebrow'>REVIEW VOLUME</div><h2>Last 30 data points</h2></div></div>{latestDaily.length?<div className='chart'>{latestDaily.map(item=><div className='column' key={item.date} style={{height:Math.max(8,(item.reviews/maxDaily)*180)}} title={item.date+': '+item.reviews+' reviews'}><span>{fmtDate(item.date)}</span></div>)}</div>:<div className='empty'>No dated reviews in this period.</div>}</section>
    <section className='panel panel-pad'><div className='panel-head'><div><div className='eyebrow'>RATING MIX</div><h2>Rating distribution</h2></div></div><div className='rating-list'>{[5,4,3,2,1].map(rating=>{const count=data.ratingDistribution.find(x=>x.rating===rating)?.count||0;return <div className='rating-row' key={rating}><span>{rating}★</span><div className='bar'><div className='fill' style={{width:(count/maxRating*100)+'%'}}/></div><strong>{count}</strong></div>})}</div><div className='note' style={{marginTop:14}}>Negative volume here is defined by 1–2 star ratings; it is not a sentiment model.</div></section>
   </div>
   <section className='panel panel-pad'><div className='panel-head'><div><div className='eyebrow'>MONTHLY TREND</div><h2>Reviews and replies by month</h2></div></div>{data.monthly.length?<table className='table'><thead><tr><th>Month</th><th>Reviews</th><th>Replies</th><th>Negative</th><th>Avg rating</th></tr></thead><tbody>{data.monthly.slice(-12).reverse().map(m=><tr key={m.month}><td className='name'>{fmtMonth(m.month)}</td><td>{m.reviews}</td><td>{m.replied}</td><td>{m.negative}</td><td>{m.averageRating??'—'}</td></tr>)}</tbody></table>:<div className='empty'>No monthly data yet.</div>}</section>
   <section className='panel panel-pad'><div className='panel-head'><div><div className='eyebrow'>LOCATION PERFORMANCE</div><h2>Business Profile locations</h2></div></div>{data.locations.length?<table className='table'><thead><tr><th>Location</th><th>Reviews</th><th>Avg</th><th>Needs reply</th><th>Negative</th><th>Status</th></tr></thead><tbody>{data.locations.map(x=><tr key={x.id}><td className='name'>{x.business_name}</td><td>{x.reviews}</td><td>{x.averageRating??'—'}</td><td>{x.needsReply}</td><td>{x.negative}</td><td><span className={'status '+(x.status==='connected'?'':'warn')}>{x.status||'unknown'}</span></td></tr>)}</tbody></table>:<div className='empty'>No locations imported.</div>}</section>
   <section className='panel panel-pad'><div className='panel-head'><div><div className='eyebrow'>CONNECTION HEALTH</div><h2>Google connections</h2></div></div>{data.connections.length?<table className='table'><thead><tr><th>Account</th><th>Token</th><th>Updated</th><th>Alert</th></tr></thead><tbody>{data.connections.map(x=>{const alert=Boolean(x.token_error)||String(x.token_status||'').toLowerCase()!=='active';return <tr key={x.id}><td className='name'>{x.account_name||'Google account'}</td><td><span className={'status '+(alert?'warn':'')}>{x.token_status||'unknown'}</span></td><td>{fmtDate(x.updated_at)}</td><td className={alert?'danger':'muted'}>{x.token_error||'No connection alert'}</td></tr>})}</tbody></table>:<div className='empty'>No Google connection records. Connection setup remains in Settings.</div>}</section>
  </>}
 </div></AppShell>
}
