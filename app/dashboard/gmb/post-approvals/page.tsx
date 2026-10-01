'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { getSupabase } from '../../../../lib/supabase-browser';

type Post={
  id:string; user_id:string; message:string; link:string|null; media_url:string|null;
  status:string; approval_status:string; created_at:string; updated_at:string;
  gmb:{profile_id?:string|null;topic?:string;cta_type?:string|null;cta_url?:string|null};
};

const css=`
.page{display:grid;gap:16px}.hero{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;flex-wrap:wrap}.hero h1{margin:5px 0}.hero p{margin:5px 0;max-width:780px}.actions{display:flex;gap:8px;flex-wrap:wrap}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metric{padding:15px}.metric span{display:block;font-size:9px;color:#667085;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.metric strong{display:block;font-size:23px;margin-top:6px}.metric small{display:block;color:#8a95a3;font-size:9px;margin-top:3px}
.filters{display:flex;gap:7px;flex-wrap:wrap}.filter{border:1px solid #dbe4e8;background:#fff;border-radius:9px;padding:8px 10px;font-size:9px;font-weight:900;cursor:pointer}.filter.active{background:#edf8f7;border-color:#b9dfdc;color:#087f7b}
.list{overflow:hidden}.row{padding:17px 18px;border-top:1px solid #edf0f3}.row:first-child{border-top:0}.top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.heading{font-size:12px;font-weight:900;color:#25323b}.sub{font-size:9px;color:#8a95a3;margin-top:4px}.pill{padding:5px 8px;border-radius:999px;font-size:8px;font-weight:900;background:#f1f5f7}.pending{background:#fff7e8;color:#b54708}.approved{background:#edf8f1;color:#14804a}.message{margin-top:10px;font-size:11px;line-height:1.6;color:#475467;white-space:pre-wrap}.meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.buttons{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.empty{padding:42px 20px;text-align:center;color:#667085;font-size:11px}.note{font-size:10px;color:#667085;line-height:1.55}
@media(max-width:800px){.metrics{grid-template-columns:1fr 1fr}.hero{align-items:flex-start;flex-direction:column}}@media(max-width:520px){.metrics{grid-template-columns:1fr}}
`;

const fmt=(v:string)=>{const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})};

export default function GooglePostApprovals(){
 const[workspaceId,setWorkspaceId]=useState(''),[posts,setPosts]=useState<Post[]>([]),[filter,setFilter]=useState('pending'),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function token(){const s=(await getSupabase().auth.getSession()).data.session;if(!s){location.href='/login';throw new Error('Your session has expired.')}return s.access_token}
 async function load(id:string){
  setLoading(true);setError('');
  try{const t=await token();const r=await fetch('/api/google/business/post-approvals?workspaceId='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+t},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||'Unable to load Google post approvals.');setPosts((d.posts||[]) as Post[])}
  catch(e){setError(e instanceof Error?e.message:'Unable to load Google post approvals.')}finally{setLoading(false)}
 }
 useEffect(()=>{let current='';try{current=localStorage.getItem('mdsm:selectedWorkspaceId')||''}catch{}setWorkspaceId(current);const onWorkspace=(event:Event)=>{const next=(event as CustomEvent<{workspaceId?:string}>).detail?.workspaceId||'';if(next&&next!==current){current=next;setWorkspaceId(next);void load(next)}};window.addEventListener('mdsm:workspace-changed',onWorkspace);if(current)void load(current);else setLoading(false);return()=>window.removeEventListener('mdsm:workspace-changed',onWorkspace)},[]);
 async function setApproval(id:string,status:string){
  setBusy(id);setError('');setMessage('');
  try{const t=await token();const r=await fetch('/api/google/business/post-approvals',{method:'PATCH',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({workspaceId,postId:id,approvalStatus:status})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||'Unable to update approval.');setPosts(v=>v.map(p=>p.id===id?{...p,approval_status:status,updated_at:d.post?.updated_at||p.updated_at}:p));setMessage(status==='approved'?'Google post approved for later publishing.':'Google post moved back to pending approval.')}
  catch(e){setError(e instanceof Error?e.message:'Unable to update approval.')}finally{setBusy('')}
 }
 const filtered=posts.filter(p=>filter==='all'||p.approval_status===filter);
 const pending=posts.filter(p=>p.approval_status==='pending').length;
 const approved=posts.filter(p=>p.approval_status==='approved').length;
 const imageCount=useMemo(()=>posts.filter(p=>Boolean(p.media_url)).length,[posts]);

 return <AppShell title='Google Business & Reviews'><style>{css}</style><div className='page'>
  <div className='hero'><div className='page-head'><div className='eyebrow'>GOOGLE POST APPROVALS</div><h1>Post Approval Queue</h1><p>Review workspace-scoped Google Business posts before any external Google publishing connection is activated.</p></div><div className='actions'><button className='btn' onClick={()=>location.href='/dashboard/gmb/posts'}>← Google Posts</button><button className='btn btn-soft' onClick={()=>location.href='/dashboard/gmb'}>GMB Overview</button></div></div>
  {error&&<div className='alert alert-error'>{error}</div>}{message&&<div className='alert alert-success'>{message}</div>}
  <div className='metrics'><article className='panel metric'><span>Total drafts</span><strong>{loading?'—':posts.length}</strong><small>Workspace Google posts</small></article><article className='panel metric'><span>Pending</span><strong>{loading?'—':pending}</strong><small>Awaiting approval</small></article><article className='panel metric'><span>Approved</span><strong>{loading?'—':approved}</strong><small>Ready for later publishing</small></article><article className='panel metric'><span>With image</span><strong>{loading?'—':imageCount}</strong><small>Posts with media URL</small></article></div>
  <section className='panel'><div className='panel-head' style={{padding:18}}><div><div className='eyebrow'>QUEUE</div><h2>Approval workflow</h2><p>Approval changes are workspace-scoped and manager-authorized.</p></div><div className='filters'>{[['pending','Pending'],['approved','Approved'],['all','All']].map(([v,l])=><button key={v} className={'filter '+(filter===v?'active':'')} onClick={()=>setFilter(v)}>{l}</button>)}</div></div>
   {loading?<div className='empty'>Loading approval queue…</div>:!filtered.length?<div className='empty'>No Google Business posts in this queue.</div>:filtered.map(post=><article className='row' key={post.id}><div className='top'><div><div className='heading'>{post.gmb.topic||'UPDATE'} · Google Business Post</div><div className='sub'>Created {fmt(post.created_at)} · Last updated {fmt(post.updated_at)}</div></div><span className={'pill '+(post.approval_status==='approved'?'approved':'pending')}>{post.approval_status==='approved'?'Approved':'Pending approval'}</span></div><div className='message'>{post.message}</div><div className='meta'><span className='pill'>Status: {post.status}</span>{post.link&&<span className='pill'>Link attached</span>}{post.media_url&&<span className='pill'>Image attached</span>}{post.gmb.cta_type&&<span className='pill'>CTA: {post.gmb.cta_type}</span>}</div><div className='buttons'>{post.approval_status==='pending'?<button className='btn btn-primary' disabled={busy!==''} onClick={()=>void setApproval(post.id,'approved')}>{busy===post.id?'Saving…':'Approve Post'}</button>:<button className='btn' disabled={busy!==''} onClick={()=>void setApproval(post.id,'pending')}>{busy===post.id?'Saving…':'Move to Pending'}</button>}<button className='btn btn-soft' onClick={()=>location.href='/dashboard/gmb/posts'}>Open Composer</button></div></article>)}
  </section>
  <div className='note'><strong>Publishing boundary:</strong> Approval only changes the internal workspace workflow. No Google API publish call is made until the Google Business connection is configured later in Settings.</div>
 </div></AppShell>
}
