'use client';
import {useEffect,useState} from 'react';
import AppShell from '../../components/AppShell';
import {getSupabase} from '../../../../lib/supabase-browser';

type ResponseRow={id:string;form_id:string;request_id:string|null;customer_name:string|null;customer_email:string|null;rating:number|null;answers:any;sentiment:string|null;created_at:string};
type Form={id:string;name:string};
type Suggestion={id:string;content:string;model:string|null;created_at:string};

const css='.page{display:grid;gap:16px}.toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.filters{display:flex;gap:8px;flex-wrap:wrap}.filters select{border:1px solid #dbe4e8;border-radius:10px;padding:9px 11px;background:#fff}.row{display:grid;grid-template-columns:minmax(0,1.3fr) 75px 100px 125px minmax(240px,1fr);gap:12px;padding:15px 18px;border-top:1px solid #edf0f3;align-items:start}.row:first-child{border-top:0}.customer strong{font-size:11px}.customer small{display:block;color:#8a95a3;font-size:9px;margin-top:3px}.stars{font-size:11px;font-weight:900}.tag{padding:5px 8px;border-radius:999px;background:#f1f5f7;font-size:9px;font-weight:900;width:max-content}.positive{background:#edf8f1;color:#14804a}.neutral{background:#fff7e8;color:#b54708}.negative{background:#fff1f0;color:#b42318}.muted{color:#667085;font-size:10px;line-height:1.5}.answers{display:grid;gap:5px}.answer{padding:8px 10px;background:#f8fafb;border:1px solid #e7ecef;border-radius:9px;font-size:10px}.answer b{display:block;font-size:9px;color:#667085;margin-bottom:2px}.actions{display:flex;gap:7px;flex-wrap:wrap}.suggestion{margin-top:9px;padding:10px;border-radius:9px;background:#edf8f7;color:#245f5c;font-size:10px;white-space:pre-wrap}.empty{padding:40px;text-align:center;color:#667085;font-size:11px}@media(max-width:950px){.row{grid-template-columns:1fr}}';

function fmt(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}
function answerEntries(a:any){return Object.entries(a&&typeof a==='object'?a:{}).filter(([,v])=>String(v??'').trim()).slice(0,8) as [string,unknown][]}

export default function FeedbackResponsesPage(){
 const[workspaceId,setWorkspaceId]=useState(''),[rows,setRows]=useState<ResponseRow[]>([]),[forms,setForms]=useState<Form[]>([]),[suggestions,setSuggestions]=useState<Record<string,Suggestion|undefined>>({}),[filter,setFilter]=useState('all'),[canManage,setCanManage]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState('');
 async function load(id:string){
  setLoading(true);setError('');
  try{
   const sb=getSupabase(),s=(await sb.auth.getSession()).data.session;
   const[r,f,a]=await Promise.all([
    sb.from('feedback_responses').select('id,form_id,request_id,customer_name,customer_email,rating,answers,sentiment,created_at').eq('workspace_id',id).order('created_at',{ascending:false}).limit(100),
    sb.from('feedback_forms').select('id,name').eq('workspace_id',id),
    fetch('/api/workspace-access?workspace_id='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+(s?.access_token||'')},cache:'no-store'})
   ]);
   if(r.error)throw r.error;if(f.error)throw f.error;
   setRows((r.data||[]) as ResponseRow[]);setForms((f.data||[]) as Form[]);
   const d=await a.json().catch(()=>({}));setCanManage(Boolean(d?.is_owner_or_admin||['owner','admin','manager'].includes(String(d?.effectiveRole||'').toLowerCase())));
  }catch(e){setError(e instanceof Error?e.message:'Unable to load feedback responses.')}finally{setLoading(false)}
 }
 useEffect(()=>{let id='';try{id=localStorage.getItem('mdsm:selectedWorkspaceId')||''}catch{}setWorkspaceId(id);const onWorkspace=(event:Event)=>{const next=(event as CustomEvent<{workspaceId?:string}>).detail?.workspaceId||'';if(next&&next!==id){id=next;setWorkspaceId(next);void load(next);}};window.addEventListener('mdsm:workspace-changed',onWorkspace);if(id)void load(id);else setLoading(false);return()=>window.removeEventListener('mdsm:workspace-changed',onWorkspace)},[]);
 async function suggest(id:string){
  setBusy(id);setError('');
  try{
   const s=(await getSupabase().auth.getSession()).data.session;
   const r=await fetch('/api/google/business/feedback-suggestion',{method:'POST',headers:{Authorization:'Bearer '+(s?.access_token||''),'Content-Type':'application/json'},body:JSON.stringify({responseId:id})});
   const d=await r.json();if(!r.ok)throw Error(d?.error||'Unable to generate suggestion.');setSuggestions(v=>({...v,[id]:d.suggestion}));
  }catch(e){setError(e instanceof Error?e.message:'Unable to generate suggestion.')}finally{setBusy('')}
 }
 const visible=filter==='all'?rows:rows.filter(x=>x.sentiment===filter);
 return <AppShell title='Google Business & Reviews'><style>{css}</style><div className='page'><div className='page-head'><div><div className='eyebrow'>FEEDBACK RESPONSES</div><h1>Customer Feedback Inbox</h1><p>Review customer responses by workspace, inspect structured answers, and prepare professional response drafts.</p></div></div>{error&&<div className='alert alert-error'>{error}</div>}<section className='panel'><div className='panel-head'><div><div className='eyebrow'>RESPONSE LIBRARY</div><h2>Latest feedback</h2></div><div className='filters'><select aria-label='Filter sentiment' value={filter} onChange={e=>setFilter(e.target.value)}><option value='all'>All sentiment</option><option value='positive'>Positive</option><option value='neutral'>Neutral</option><option value='negative'>Negative</option></select></div></div>{loading?<div className='empty'>Loading…</div>:!visible.length?<div className='empty'>No feedback responses yet.</div>:visible.map(x=>{const f=forms.find(y=>y.id===x.form_id);return <article className='row' key={x.id}><div className='customer'><strong>{x.customer_name||'Anonymous customer'}</strong><small>{x.customer_email||'No email'} · {fmt(x.created_at)} · {f?.name||'Form removed'}</small></div><div className='stars'>{x.rating?'★'.repeat(x.rating):'—'}</div><span className={'tag '+(x.sentiment||'')}>{(x.sentiment||'unclassified').toUpperCase()}</span><div className='muted'>{x.request_id?'Linked to review request':'Direct feedback'}</div><div><div className='answers'>{answerEntries(x.answers).map(([k,v])=><div className='answer' key={k}><b>{k}</b>{String(v)}</div>)}</div>{canManage&&<div className='actions' style={{marginTop:9}}><button className='btn btn-soft' disabled={busy===x.id} onClick={()=>void suggest(x.id)}>{busy===x.id?'Generating…':'✦ AI Response Suggestion'}</button></div>}{suggestions[x.id]&&<div className='suggestion'><strong>{suggestions[x.id]?.model||'Draft'}:</strong> {suggestions[x.id]?.content}</div>}</div></article>})}</section></div></AppShell>
}
