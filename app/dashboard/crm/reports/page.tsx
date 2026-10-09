'use client';

import {useEffect,useMemo,useState} from 'react';
import AppShell from '../../components/AppShell';
import {getSupabase} from '../../../../lib/supabase-browser';

type Lead={id:string;stage:string;score:number;value:number;created_at:string};
type Task={id:string;status:string;due_at:string|null};

const css=' .page{display:grid;gap:14px;padding:24px;background:#f7fafb;min-height:100%;color:#17202b}.head{display:flex;justify-content:space-between;gap:14px;align-items:flex-end;flex-wrap:wrap}.eyebrow{font-size:10px;letter-spacing:.14em;color:#087f7b;font-weight:950}.head h1{margin:5px 0;font-size:28px}.sub{margin:0;color:#75828b;font-size:10px}.btn{border:1px solid #dce5e9;border-radius:10px;padding:9px 12px;background:#fff;font-size:10px;font-weight:900;cursor:pointer}.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:11px}.grid2{display:grid;grid-template-columns:1.15fr .85fr;gap:14px}.panel{background:#fff;border:1px solid #e0e8eb;border-radius:17px;padding:17px}.panel h2{margin:4px 0;font-size:16px}.panel p{margin:0;color:#7b8790;font-size:9px;line-height:1.5}.stat span{display:block;color:#78858d;font-size:9px;font-weight:850}.stat strong{display:block;font-size:24px;margin:8px 0}.stat small{color:#98a2a9;font-size:8px}.bars{display:grid;gap:10px;margin-top:13px}.bar-top{display:flex;justify-content:space-between;font-size:9px;font-weight:900}.track{height:9px;border-radius:999px;background:#eef2f4;overflow:hidden}.fill{height:100%;background:#17202b;border-radius:999px}.trend{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;align-items:end;height:160px;margin-top:13px}.month{display:grid;grid-template-rows:1fr auto;gap:7px;height:100%}.month-bar-wrap{height:100%;display:flex;align-items:end;justify-content:center}.month-bar{width:22px;border-radius:7px 7px 3px 3px;background:#087f7b;min-height:4px}.month-label{font-size:8px;color:#7d8992;text-align:center}.list{display:grid;gap:8px;margin-top:12px}.item{display:flex;justify-content:space-between;gap:12px;align-items:center;border-top:1px solid #edf1f2;padding:10px 0}.item:first-child{border-top:0}.item strong{font-size:10px}.item span{font-size:9px;color:#7c8992}.badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:#eef2f4;font-size:8px;font-weight:900}.green{background:#edf9f1;color:#087443}.orange{background:#fff7e9;color:#8b5e11}.blue{background:#edf5ff;color:#2166d1}@media(max-width:950px){.grid4{grid-template-columns:repeat(2,1fr)}.grid2{grid-template-columns:1fr}}';

export default function CRMReportsPage(){
 const[workspaceId,setWorkspaceId]=useState(''),[leads,setLeads]=useState<Lead[]>([]),[tasks,setTasks]=useState<Task[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 async function load(id=workspaceId){
  if(!id)return;setLoading(true);setError('');
  try{
   const sb=getSupabase();
   const [l,t]=await Promise.all([sb.from('crm_leads').select('id,stage,score,value,created_at').eq('workspace_id',id),sb.from('crm_tasks').select('id,status,due_at').eq('workspace_id',id)]);
   if(l.error)throw l.error;if(t.error)throw t.error;setLeads((l.data||[]) as Lead[]);setTasks((t.data||[]) as Task[]);
  }catch(e){setError(e instanceof Error?e.message:'Unable to load CRM reports.')}finally{setLoading(false)}
 }
 useEffect(()=>{let id='';try{id=localStorage.getItem('mdsm:selectedWorkspaceId')||''}catch{}setWorkspaceId(id);if(id)void load(id);const onWorkspace=(e:Event)=>{const next=(e as CustomEvent<{workspaceId?:string}>).detail?.workspaceId||'';if(next){setWorkspaceId(next);void load(next)}};window.addEventListener('mdsm:workspace-changed',onWorkspace);return()=>window.removeEventListener('mdsm:workspace-changed',onWorkspace)},[]);

 const stages=[['new','New'],['qualified','Qualified'],['proposal','Proposal'],['negotiation','Negotiation'],['won','Won'],['lost','Lost']] as const;
 const counts=useMemo(()=>Object.fromEntries(stages.map(([k])=>[k,leads.filter(l=>l.stage===k).length])),[leads]);
 const won=leads.filter(l=>l.stage==='won'),open=leads.filter(l=>!['won','lost'].includes(l.stage));
 const conversion=leads.length?Math.round(won.length/leads.length*100):0,avgScore=leads.length?Math.round(leads.reduce((n,l)=>n+Number(l.score||0),0)/leads.length):0;
 const pipeline=open.reduce((n,l)=>n+Number(l.value||0),0),wonValue=won.reduce((n,l)=>n+Number(l.value||0),0);
 const overdue=tasks.filter(t=>!['completed','cancelled'].includes(t.status)&&t.due_at&&new Date(t.due_at)<new Date()).length,openTasks=tasks.filter(t=>!['completed','cancelled'].includes(t.status)).length;
 const months=useMemo(()=>{const out:{label:string;count:number}[]=[];const now=new Date();for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);const c=leads.filter(l=>{const x=new Date(l.created_at);return x.getFullYear()===d.getFullYear()&&x.getMonth()===d.getMonth()}).length;out.push({label:d.toLocaleDateString('en',{month:'short'}),count:c})}return out},[leads]);
 const maxMonth=Math.max(1,...months.map(x=>x.count));

 return <AppShell title="CRM Reports"><div className="page"><style jsx>{css}</style>
  <div className="head"><div><div className="eyebrow">CRM • REPORTING</div><h1>CRM Reporting Dashboard</h1><p className="sub">Workspace-scoped lead and follow-up performance.</p></div><button className="btn" onClick={()=>void load()}>↻ Refresh</button></div>
  {error&&<div style={{padding:10,color:'#9f1239'}}>{error}</div>}{loading&&<div style={{padding:10}}>Loading report data…</div>}
  <div className="grid4">
   <article className="panel stat"><span>Total Leads</span><strong>{loading?'—':leads.length}</strong><small>All recorded leads</small></article>
   <article className="panel stat"><span>Lead → Won</span><strong>{loading?'—':conversion}%</strong><small>{won.length} won</small></article>
   <article className="panel stat"><span>Open Pipeline</span><strong>{loading?'—':pipeline.toLocaleString()}</strong><small>Open lead value</small></article>
   <article className="panel stat"><span>Won Value</span><strong>{loading?'—':wonValue.toLocaleString()}</strong><small>Recorded won value</small></article>
  </div>
  <div className="grid4">
   <article className="panel stat"><span>Average Score</span><strong>{loading?'—':avgScore}/100</strong><small>Current lead quality</small></article>
   <article className="panel stat"><span>Open Tasks</span><strong>{loading?'—':openTasks}</strong><small>Follow-up workload</small></article>
   <article className="panel stat"><span>Overdue</span><strong>{loading?'—':overdue}</strong><small>Needs attention</small></article>
   <article className="panel stat"><span>Qualified</span><strong>{loading?'—':counts.qualified||0}</strong><small>Sales-ready leads</small></article>
  </div>
  <div className="grid2">
   <section className="panel"><div className="eyebrow">PIPELINE MIX</div><h2>Lead Stages</h2><p>Lead distribution across the sales funnel.</p><div className="bars">{stages.map(([key,label])=>{const count=counts[key]||0;const width=leads.length?Math.max(3,Math.round(count/leads.length*100)):3;return <div key={key}><div className="bar-top"><span>{label}</span><span>{count}</span></div><div className="track"><div className="fill" style={{width:width+'%'}}/></div></div>})}</div></section>
   <section className="panel"><div className="eyebrow">LEAD INTAKE</div><h2>Last 6 Months</h2><p>New leads created each month.</p><div className="trend">{months.map(m=><div className="month" key={m.label}><div className="month-bar-wrap"><div className="month-bar" style={{height:Math.max(4,Math.round(m.count/maxMonth*100))+'%'}}/></div><div className="month-label">{m.label}<br/>{m.count}</div></div>)}</div></section>
  </div>
  <div className="grid2">
   <section className="panel"><div className="eyebrow">SALES SNAPSHOT</div><h2>Funnel Health</h2><div className="list"><div className="item"><div><strong>Qualified</strong><span>Leads ready for sales action</span></div><span className="badge green">{counts.qualified||0}</span></div><div className="item"><div><strong>Negotiation</strong><span>Late-stage active opportunities</span></div><span className="badge blue">{counts.negotiation||0}</span></div><div className="item"><div><strong>Lost</strong><span>Unsuccessful opportunities</span></div><span className="badge orange">{counts.lost||0}</span></div></div></section>
   <section className="panel"><div className="eyebrow">FOLLOW-UP HEALTH</div><h2>Task Status</h2><div className="list"><div className="item"><div><strong>Open / in progress</strong><span>Tasks still requiring action</span></div><span className="badge blue">{openTasks}</span></div><div className="item"><div><strong>Overdue</strong><span>Due time already passed</span></div><span className="badge orange">{overdue}</span></div><div className="item"><div><strong>Completed</strong><span>Closed follow-up work</span></div><span className="badge green">{tasks.filter(t=>t.status==='completed').length}</span></div></div></section>
  </div>
 </div></AppShell>
}
