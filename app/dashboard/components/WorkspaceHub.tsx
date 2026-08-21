'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';
import type { Brand } from './BrandSelector';

type Props={workspaces:Brand[];onOpen:(id:string)=>void;onCreate:()=>void};

function saveWorkspace(id:string){try{localStorage.setItem('mdsm:selectedWorkspaceId',id)}catch{}}

export default function WorkspaceHub({workspaces,onOpen,onCreate}:Props){
 const [canCreate,setCanCreate]=useState(false);
 const [busy,setBusy]=useState(false);
 const [confirm,setConfirm]=useState<Brand|null>(null);
 const [confirmName,setConfirmName]=useState('');
 const [error,setError]=useState('');

 useEffect(()=>{
  getSupabase().auth.getUser().then(({data})=>{
   const u=data.user;
   const role=String(u?.app_metadata?.role||u?.user_metadata?.role||'').toLowerCase();
   setCanCreate(role==='admin'||role==='owner'||role==='super_admin');
  });
 },[]);

 async function deleteWorkspace(workspace:Brand){
  if(confirmName.trim()!==workspace.name)return;
  setBusy(true);setError('');
  try{
   const session=(await getSupabase().auth.getSession()).data.session;
   if(!session)throw new Error('Your session has expired.');
   const r=await fetch(`/api/brands/${encodeURIComponent(workspace.id)}`,{method:'DELETE',headers:{Authorization:`Bearer ${session.access_token}`}});
   const d=await r.json().catch(()=>null);
   if(!r.ok)throw new Error(d?.error||'Unable to delete workspace.');
   try{localStorage.removeItem('mdsm:selectedWorkspaceId')}catch{}
   location.reload();
  }catch(e){setError(e instanceof Error?e.message:'Unable to delete workspace.');setBusy(false)}
 }

 return <main className="workspace-hub"><style jsx>{`
 .workspace-hub{min-height:100vh;padding:48px clamp(20px,5vw,72px);background:radial-gradient(circle at 12% 0%,rgba(20,184,166,.11),transparent 32%),radial-gradient(circle at 90% 8%,rgba(59,130,246,.09),transparent 28%),#f7fafb;color:#17202b}.hub-shell{max-width:1240px;margin:0 auto}.hub-top{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:30px}.eyebrow{display:inline-flex;gap:7px;color:#078b87;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.eyebrow i{width:7px;height:7px;border-radius:50%;background:#14b8a6;box-shadow:0 0 0 5px rgba(20,184,166,.12)}h1{margin:8px 0;font-size:clamp(30px,4vw,48px);letter-spacing:-.045em}.sub{margin:0;color:#718096;font-size:14px;line-height:1.6}.create{border:0;border-radius:14px;padding:13px 17px;background:#078b87;color:#fff;font-weight:900;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.card{position:relative;min-height:260px;border:1px solid #dfe8ec;border-radius:24px;padding:24px;background:rgba(255,255,255,.95);box-shadow:0 18px 50px rgba(15,23,42,.07)}.identity{display:flex;align-items:center;gap:14px;min-width:0}.logo{width:62px;height:62px;flex:0 0 62px;border-radius:18px;display:grid;place-items:center;overflow:hidden;background:#e7f8f6;border:1px solid #d4e5e8;font-size:20px;font-weight:950;color:#087f7b}.logo img{width:100%;height:100%;object-fit:cover}.name{margin:0;font-size:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.meta{margin:5px 0 0;color:#81909b;font-size:12px;font-weight:700}.card-head{display:flex;justify-content:space-between;gap:12px}.menu{border:1px solid #dce6ea;background:#fff;border-radius:10px;width:38px;height:38px;cursor:pointer;font-size:18px}.channels{display:flex;gap:8px;flex-wrap:wrap;margin:26px 0}.chip{padding:8px 11px;border-radius:999px;background:#f2f7f8;border:1px solid #e4edef;color:#5e6b76;font-size:10px;font-weight:900}.actions{display:flex;gap:10px;margin-top:28px}.open{flex:1;min-height:44px;border:0;border-radius:12px;background:#17202b;color:#fff;font-weight:900;cursor:pointer}.delete{min-height:44px;padding:0 14px;border:1px solid #efd1d1;border-radius:12px;background:#fff7f7;color:#b42318;font-weight:900;cursor:pointer}.create-card{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border-style:dashed;background:linear-gradient(145deg,rgba(255,255,255,.8),rgba(240,251,250,.75));cursor:pointer}.plus{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:#e7f8f6;color:#078b87;font-size:30px;margin-bottom:14px}.create-card h2{margin:0 0 6px;font-size:17px}.create-card p{margin:0;max-width:280px;color:#81909b;font-size:11px;line-height:1.55}.error{margin:0 0 18px;padding:12px 14px;border-radius:12px;background:#fff1f2;color:#b42318;font-size:12px;font-weight:800}.modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.46);display:grid;place-items:center;padding:20px;z-index:50}.modal{width:min(460px,100%);background:#fff;border-radius:22px;padding:26px;box-shadow:0 30px 90px rgba(15,23,42,.25)}.modal h2{margin:0 0 8px}.modal p{color:#64748b;font-size:13px;line-height:1.55}.modal input{width:100%;height:48px;border:1px solid #d7e3e7;border-radius:12px;padding:0 13px;font-weight:700}.modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.cancel,.danger{height:44px;padding:0 15px;border-radius:11px;font-weight:900;cursor:pointer}.cancel{border:1px solid #d7e3e7;background:#fff}.danger{border:0;background:#b42318;color:#fff}.danger:disabled{opacity:.45;cursor:not-allowed}@media(max-width:800px){.hub-top{align-items:flex-start;flex-direction:column}.grid{grid-template-columns:1fr}.workspace-hub{padding:28px 16px}}
 `}</style>
 <div className="hub-shell">
  <div className="hub-top"><div><span className="eyebrow"><i/> Stage 2 · Workspace Hub</span><h1>Your Workspaces</h1><p className="sub">Select an assigned workspace to continue. Every workspace keeps its accounts, content and publishing separate.</p></div>{canCreate&&<button className="create" onClick={onCreate}>＋ Create New Workspace</button>}</div>
  {error&&<div className="error">⚠ {error}</div>}
  <div className="grid">
   {workspaces.map(w=><article className="card" key={w.id}><div className="card-head"><div className="identity"><div className="logo">{w.logo_url?<img src={w.logo_url} alt=""/>:w.name.slice(0,2).toUpperCase()}</div><div><h2 className="name">{w.name}</h2><p className="meta">Assigned workspace</p></div></div>{canCreate&&<button className="menu" aria-label={`Delete ${w.name}`} onClick={()=>{setConfirm(w);setConfirmName('')}}>⋮</button>}</div><div className="channels"><span className="chip">Facebook</span><span className="chip">Instagram</span><span className="chip">Google Business</span></div><div className="actions"><button className="open" onClick={()=>{saveWorkspace(w.id);onOpen(w.id)}}>Open Workspace →</button>{canCreate&&<button className="delete" onClick={()=>{setConfirm(w);setConfirmName('')}}>Delete</button>}</div></article>)}
   {canCreate&&<button className="card create-card" onClick={onCreate}><span className="plus">＋</span><h2>Create a new workspace</h2><p>Start a new business or brand with a name and optional logo.</p></button>}
   {!workspaces.length&&<div className="card"><h2>No assigned workspaces</h2><p className="sub">Ask an administrator to assign a workspace to your account.</p></div>}
  </div>
 </div>
 {confirm&&<div className="modal-backdrop"><section className="modal"><h2>Delete Workspace?</h2><p>This permanently removes <strong>{confirm.name}</strong> and its workspace data. Type the workspace name exactly to continue.</p><input value={confirmName} onChange={e=>setConfirmName(e.target.value)} placeholder={confirm.name}/><div className="modal-actions"><button className="cancel" onClick={()=>setConfirm(null)}>Cancel</button><button className="danger" disabled={busy||confirmName.trim()!==confirm.name} onClick={()=>void deleteWorkspace(confirm)}>{busy?'Deleting…':'Delete Permanently'}</button></div></section></div>}
 </main>
}
