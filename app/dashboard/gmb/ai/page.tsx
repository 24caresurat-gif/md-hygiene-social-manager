'use client';
import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { getSupabase } from '../../../../lib/supabase-browser';

type Review={id:string;reviewer_name:string|null;rating:number|null;comment:string|null;reply_status:string};
type Suggestion={content:string;model:string|null};

const css = ".page{display:grid;gap:15px}.panel{padding:18px}.hero h1{margin:5px 0}.note{font-size:10px;color:#667085;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}.metric strong{display:block;font-size:25px;margin-top:5px}.actions{display:flex;gap:7px;flex-wrap:wrap}.btn{border:1px solid #dbe4e8;background:#fff;border-radius:9px;padding:9px 11px;font-size:9px;font-weight:900;cursor:pointer}.primary{background:#087f7b;color:#fff;border-color:#087f7b}.box{margin-top:10px;padding:11px;background:#edf8f7;border-radius:10px;font-size:10px;line-height:1.55;white-space:pre-wrap}.review{border-top:1px solid #edf0f3;padding:12px 0}.review:first-child{border-top:0}.top{display:flex;justify-content:space-between;gap:8px}.pill{padding:5px 8px;border-radius:999px;background:#f1f5f7;font-size:8px;font-weight:900}@media(max-width:900px){.grid{grid-template-columns:1fr}}";

export default function ReputationAIPage(){
  const [workspaceId,setWorkspaceId]=useState('');
  const [reviews,setReviews]=useState<Review[]>([]);
  const [insight,setInsight]=useState('');
  const [improvements,setImprovements]=useState<string[]>([]);
  const [suggestions,setSuggestions]=useState<Record<string,Suggestion|undefined>>({});
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');

  async function token(){
    const s=(await getSupabase().auth.getSession()).data.session;
    if(!s){location.href='/login';throw new Error('Session expired.')}
    return s.access_token;
  }
  async function load(id:string){
    setError('');
    try{
      const t=await token();
      const r=await fetch('/api/google/business/reviews?workspaceId='+encodeURIComponent(id)+'&replyStatus=all&rating=0&profileId=all',{headers:{Authorization:'Bearer '+t},cache:'no-store'});
      const d=await r.json();
      if(!r.ok)throw Error(d?.error||'Unable to load reviews.');
      setReviews(d.reviews||[]);
    }catch(e){setError(e instanceof Error?e.message:'Unable to load reviews.')}
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
    if(id)void load(id);
    return()=>window.removeEventListener('mdsm:workspace-changed',onWorkspace);
  },[]);

  async function generateReply(id:string){
    setBusy(id);setError('');
    try{
      const t=await token();
      const r=await fetch('/api/google/business/suggestion',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({reviewId:id})});
      const d=await r.json();
      if(!r.ok)throw Error(d?.error||'Unable to generate reply.');
      setSuggestions(v=>({...v,[id]:d.suggestion}));
    }catch(e){setError(e instanceof Error?e.message:'Unable to generate reply.')}finally{setBusy('')}
  }
  async function runInsights(){
    setBusy('insights');
    try{
      const t=await token();
      const r=await fetch('/api/google/business/insights?workspaceId='+encodeURIComponent(workspaceId),{headers:{Authorization:'Bearer '+t},cache:'no-store'});
      const d=await r.json();
      if(!r.ok)throw Error(d?.error||'Unable to generate insights.');
      setInsight(d.insight||'');
    }catch(e){setError(e instanceof Error?e.message:'Unable to generate insights.')}finally{setBusy('')}
  }
  async function runImprovements(){
    setBusy('improve');
    try{
      const t=await token();
      const r=await fetch('/api/google/business/rating-improvement?workspaceId='+encodeURIComponent(workspaceId),{headers:{Authorization:'Bearer '+t},cache:'no-store'});
      const d=await r.json();
      if(!r.ok)throw Error(d?.error||'Unable to generate suggestions.');
      setImprovements(d.suggestions||[]);
    }catch(e){setError(e instanceof Error?e.message:'Unable to generate suggestions.')}finally{setBusy('')}
  }

  const needs=reviews.filter(r=>r.reply_status!=='replied');
  const values=reviews.map(r=>Number(r.rating||0)).filter(r=>r>=1&&r<=5);
  const avg=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;

  return <AppShell title='Reputation AI'><style>{css}</style><div className='page'>
    <section className='panel hero'><div className='eyebrow'>AI CONTROL CENTER</div><h1>Reputation AI</h1><p className='note'>Auto-draft review replies, surface business insights and generate rating-improvement actions. External publishing remains connection-gated.</p></section>
    {error&&<div className='alert alert-error'>{error}</div>}
    <section className='grid'>
      <article className='panel metric'><div className='eyebrow'>REVIEWS</div><strong>{reviews.length}</strong><div className='note'>Imported reviews</div><div className='eyebrow' style={{marginTop:10}}>AVERAGE</div><strong>{avg==null?'—':avg.toFixed(2)+'/5'}</strong></article>
      <article className='panel metric'><div className='eyebrow'>AUTO REPLY</div><strong>{needs.length}</strong><div className='note'>Reviews needing reply</div><button className='btn primary' disabled={!needs.length||busy!==''} onClick={()=>needs.slice(0,10).forEach(r=>void generateReply(r.id))} style={{marginTop:10}}>{busy?'Working…':'Auto-draft up to 10'}</button></article>
      <article className='panel'><div className='actions'><button className='btn primary' disabled={!workspaceId||busy!==''} onClick={()=>void runInsights()}>{busy==='insights'?'Generating…':'AI Business Insights'}</button><button className='btn' disabled={!workspaceId||busy!==''} onClick={()=>void runImprovements()}>{busy==='improve'?'Generating…':'Rating Suggestions'}</button></div></article>
    </section>
    <section className='panel'><div className='eyebrow'>BUSINESS INSIGHTS</div><h2 style={{margin:'5px 0'}}>AI Business Insights</h2>{insight?<div className='box'>{insight}</div>:<p className='note'>Run the insight engine to analyze imported reviews and feedback.</p>}</section>
    <section className='panel'><div className='eyebrow'>RATING IMPROVEMENT</div><h2 style={{margin:'5px 0'}}>Rating Improvement Suggestions</h2>{improvements.length?improvements.map((x,i)=><div className='box' key={i}>{i+1}. {x}</div>):<p className='note'>Suggestions focus on operational improvements and ethical feedback collection.</p>}</section>
    <section className='panel'><div className='eyebrow'>AI AUTO REVIEW REPLY</div><h2 style={{margin:'5px 0 10px'}}>Needs reply queue</h2>{needs.length?needs.slice(0,10).map(r=><article className='review' key={r.id}><div className='top'><strong>{r.reviewer_name||'Google reviewer'} · {r.rating||'—'}/5</strong><span className='pill'>{r.reply_status}</span></div><div className='note' style={{marginTop:5}}>{r.comment||'Rating-only review'}</div>{suggestions[r.id]&&<div className='box'>{suggestions[r.id]?.content}</div>}<div className='actions' style={{marginTop:8}}><button className='btn' disabled={busy!==''} onClick={()=>void generateReply(r.id)}>{busy===r.id?'Generating…':suggestions[r.id]?'Regenerate':'Generate Reply'}</button><button className='btn' onClick={()=>location.href='/dashboard/gmb/reviews'}>Review Management →</button></div></article>):<p className='note'>No unreplied imported reviews.</p>}</section>
  </div></AppShell>
}
