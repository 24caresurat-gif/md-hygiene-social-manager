'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { getSupabase } from '../../../../lib/supabase-browser';

type Data = {
  metrics:{sent:number;completed:number;pending:number;googleClicked:number;completionRate:number;clickRate:number;averageRating:number|null;positive:number;negative:number;feedbackResponses:number};
  statusDistribution:{status:string;count:number}[];
  bySource:{source:string;sent:number;completed:number;clicked:number;completionRate:number;clickRate:number}[];
  daily:{date:string;sent:number;completed:number;clicked:number}[];
  locations:{id:string;business_name:string;sent:number;completed:number;clicked:number;completionRate:number;clickRate:number;averageRating:number|null}[];
  recent:{id:string;name:string|null;source:string;status:string;feedback_rating:number|null;google_clicked_at:string|null;created_at:string;business_name:string|null}[];
};

const css=`
.page{display:grid;gap:16px}
.hero{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;flex-wrap:wrap}.hero h1{margin:5px 0}.hero p{margin:5px 0 0;max-width:780px}
.actions{display:flex;gap:8px;flex-wrap:wrap}.periods{display:flex;gap:6px;flex-wrap:wrap}.period{border:1px solid #dbe4e8;background:#fff;border-radius:9px;padding:8px 10px;font-size:9px;font-weight:900;cursor:pointer}.period.active{background:#edf8f7;border-color:#b9dfdc;color:#087f7b}
.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.metric{padding:15px}.metric span{display:block;font-size:9px;color:#667085;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.metric strong{display:block;font-size:23px;margin-top:6px}.metric small{display:block;color:#8a95a3;font-size:9px;margin-top:3px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.pad{padding:17px}
.funnel{display:grid;gap:8px}.funnel-row{display:grid;grid-template-columns:95px 1fr 45px;align-items:center;gap:9px;font-size:10px}.bar{height:10px;background:#edf0f3;border-radius:99px;overflow:hidden}.fill{height:100%;background:#087f7b}
.table{width:100%;border-collapse:collapse}.table th{padding:10px;text-align:left;font-size:8px;color:#667085;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e9eef0}.table td{padding:11px 10px;font-size:10px;border-bottom:1px solid #edf0f3}.table tr:last-child td{border-bottom:0}
.pill{display:inline-block;padding:5px 8px;border-radius:999px;background:#f2f5f7;font-size:8px;font-weight:900}.good{background:#edf8f1;color:#14804a}.warn{background:#fff7e8;color:#b54708}.danger{background:#fff1f0;color:#b42318}
.chart{height:210px;display:flex;align-items:flex-end;gap:5px;padding:12px 0 18px;overflow:hidden}.column{flex:1;min-width:5px;background:#b9dfdc;border-radius:5px 5px 2px 2px;position:relative}.column span{position:absolute;left:50%;transform:translateX(-50%);bottom:-17px;font-size:7px;color:#98a3aa;white-space:nowrap}
.note{font-size:10px;color:#667085;line-height:1.55}.empty{padding:40px 20px;text-align:center;color:#667085;font-size:11px}
@media(max-width:1000px){.metrics{grid-template-columns:repeat(3,1fr)}.grid{grid-template-columns:1fr}}@media(max-width:650px){.metrics{grid-template-columns:1fr 1fr}.hero{align-items:flex-start;flex-direction:column}}
`;

const fmtDate=(v:string)=>{const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString(undefined,{day:'numeric',month:'short'})};

export default function RequestAnalyticsPage(){
 const[workspaceId,setWorkspaceId]=useState(''),[data,setData]=useState<Data|null>(null),[days,setDays]=useState(90),[loading,setLoading]=useState(true),[error,setError]=useState('');
 async function load(id:string,period=days){
  setLoading(true);setError('');
  try{
   const s=(await getSupabase().auth.getSession()).data.session;if(!s){location.href='/login';return}
   const r=await fetch('/api/google/business/request-analytics?workspaceId='+encodeURIComponent(id)+'&days='+period,{headers:{Authorization:'Bearer '+s.access_token},cache:'no-store'});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||'Unable to load request analytics.');setData(d as Data);
  }catch(e){setError(e instanceof Error?e.message:'Unable to load request analytics.')}finally{setLoading(false)}
 }
 useEffect(()=>{let current='';try{current=localStorage.getItem('mdsm:selectedWorkspaceId')||''}catch{}setWorkspaceId(current);const onWorkspace=(event:Event)=>{const next=(event as CustomEvent<{workspaceId?:string}>).detail?.workspaceId||'';if(next&&next!==current){current=next;setWorkspaceId(next);void load(next,days)}};window.addEventListener('mdsm:workspace-changed',onWorkspace);if(current)void load(current);else setLoading(false);return()=>window.removeEventListener('mdsm:workspace-changed',onWorkspace)},[]);
 const maxDaily=useMemo(()=>Math.max(...(data?.daily||[]).map(x=>x.sent),1),[data]);
 return <AppShell title='Google Business & Reviews'><style>{css}</style><div className='page'>
  <div className='hero'><div className='page-head'><div className='eyebrow'>REVIEW REQUEST ANALYTICS</div><h1>Request Performance</h1><p>Track review-request delivery records, customer feedback completion, Google clicks and source/location performance for the selected workspace.</p></div><div className='actions'><div className='periods'>{[30,90,180,365].map(p=><button key={p} className={'period '+(days===p?'active':'')} onClick={()=>{setDays(p);if(workspaceId)void load(workspaceId,p)}}>{p} days</button>)}</div><button className='btn' onClick={()=>location.href='/dashboard/gmb/requests'}>← Review Requests</button></div></div>
  {error&&<div className='alert alert-error'>{error}</div>}
  <div className='metrics'>
   <article className='panel metric'><span>Requests sent</span><strong>{loading?'—':data?.metrics.sent??0}</strong><small>Created in selected period</small></article>
   <article className='panel metric'><span>Completed</span><strong>{loading?'—':data?.metrics.completed??0}</strong><small>Feedback response recorded</small></article>
   <article className='panel metric'><span>Completion rate</span><strong>{loading?'—':(data?.metrics.completionRate??0)+'%'}</strong><small>Requests resulting in feedback</small></article>
   <article className='panel metric'><span>Google clicks</span><strong>{loading?'—':data?.metrics.googleClicked??0}</strong><small>Public review link clicks</small></article>
   <article className='panel metric'><span>Avg feedback rating</span><strong>{loading?'—':data?.metrics.averageRating??'—'}</strong><small>Submitted feedback ratings</small></article>
  </div>
  {loading?<section className='panel empty'>Loading request analytics…</section>:!data?<section className='panel empty'>No request analytics available.</section>:<>
   <div className='grid'>
    <section className='panel pad'><div className='panel-head'><div><div className='eyebrow'>REQUEST FUNNEL</div><h2>Customer journey</h2></div></div><div className='funnel'>{[['Sent',data.metrics.sent,data.metrics.sent],['Completed',data.metrics.completed,data.metrics.sent],['Google clicked',data.metrics.googleClicked,data.metrics.sent]].map(([label,count,total],i)=><div className='funnel-row' key={String(label)}><span>{label}</span><div className='bar'><div className='fill' style={{width:(Number(total)?Number(count)/Number(total)*100:0)+'%'}}/></div><strong>{count}</strong></div>)}</div><div className='note' style={{marginTop:14}}>“Completed” is based on a linked feedback response or a request status of completed. Google clicks are tracked when the customer opens the public review destination.</div></section>
    <section className='panel pad'><div className='panel-head'><div><div className='eyebrow'>SOURCE MIX</div><h2>Request channels</h2></div></div>{data.bySource.length?<table className='table'><thead><tr><th>Source</th><th>Sent</th><th>Completed</th><th>Click rate</th></tr></thead><tbody>{data.bySource.map(x=><tr key={x.source}><td className='pill'>{x.source}</td><td>{x.sent}</td><td>{x.completed}</td><td>{x.clickRate}%</td></tr>)}</tbody></table>:<div className='empty'>No source data yet.</div>}</section>
   </div>
   <section className='panel pad'><div className='panel-head'><div><div className='eyebrow'>REQUEST VOLUME</div><h2>Daily requests</h2></div></div>{data.daily.length?<div className='chart'>{data.daily.slice(-30).map(x=><div className='column' key={x.date} style={{height:Math.max(8,(x.sent/maxDaily)*175)}} title={x.date+': '+x.sent+' sent, '+x.completed+' completed'}><span>{fmtDate(x.date)}</span></div>)}</div>:<div className='empty'>No request activity in this period.</div>}</section>
   <section className='panel pad'><div className='panel-head'><div><div className='eyebrow'>LOCATION PERFORMANCE</div><h2>Business Profile locations</h2></div></div>{data.locations.length?<table className='table'><thead><tr><th>Location</th><th>Sent</th><th>Completed</th><th>Completion</th><th>Clicks</th><th>Avg rating</th></tr></thead><tbody>{data.locations.map(x=><tr key={x.id}><td><strong>{x.business_name}</strong></td><td>{x.sent}</td><td>{x.completed}</td><td>{x.completionRate}%</td><td>{x.clicked}</td><td>{x.averageRating??'—'}</td></tr>)}</tbody></table>:<div className='empty'>No location activity yet.</div>}</section>
   <section className='panel pad'><div className='panel-head'><div><div className='eyebrow'>RECENT ACTIVITY</div><h2>Latest review requests</h2></div></div>{data.recent.length?<table className='table'><thead><tr><th>Customer</th><th>Location</th><th>Source</th><th>Status</th><th>Rating</th><th>Created</th></tr></thead><tbody>{data.recent.map(x=>{const status=String(x.status||'').toLowerCase();const cls=status==='completed'?'good':status==='cancelled'?'danger':'warn';return <tr key={x.id}><td><strong>{x.name||'Customer'}</strong></td><td>{x.business_name||'—'}</td><td>{x.source}</td><td><span className={'pill '+cls}>{x.status||'unknown'}</span></td><td>{x.feedback_rating??'—'}</td><td>{fmtDate(x.created_at)}</td></tr>})}</tbody></table>:<div className='empty'>No requests created yet.</div>}</section>
  </>}
 </div></AppShell>
}
