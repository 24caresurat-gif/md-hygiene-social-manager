'use client';
import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {getSupabase} from '../../../lib/supabase-browser';

type Workspace={id:string;name:string;logo_url?:string|null};
type Permission={module:string;can_view:boolean;can_create:boolean;can_edit:boolean;can_submit:boolean;can_approve:boolean;can_publish:boolean;can_manage:boolean};
type Access={role:string;employee_id?:string|null;permissions:Permission[];is_owner_or_admin:boolean};

const nav=[
  ['Dashboard','⌂','/dashboard','dashboard'],
  ['Accounts','◎','/dashboard/accounts','social_accounts'],
  ['Create Post','✎','/dashboard/publish','content'],
  ['Creative Intelligence','✦','/dashboard/creative-insights','creative'],
  ['Drafts','◇','/dashboard/drafts','drafts'],
  ['Calendar','□','/dashboard/calendar','calendar'],
  ['Publishing History','▤','/dashboard/history','publishing'],
  ['Analytics','▥','/dashboard/analytics','analytics'],
  ['Media Library','▧','/dashboard/media','content'],
  ['Settings','⚙','/dashboard/settings','workspace_settings'],
] as const;

export default function AppShell({children,title='Dashboard'}:{children:ReactNode;title?:string}){
  const[open,setOpen]=useState(false),[profileOpen,setProfileOpen]=useState(false),[email,setEmail]=useState(''),[workspaces,setWorkspaces]=useState<Workspace[]|null>(null),[selected,setSelected]=useState(''),[access,setAccess]=useState<Access|null>(null),[accessLoading,setAccessLoading]=useState(false);

  useEffect(()=>{(async()=>{
    const s=getSupabase();
    const{data}=await s.auth.getUser();
    if(!data.user){location.href='/login';return}
    setEmail(data.user.email||'');
    const session=(await s.auth.getSession()).data.session;
    const r=await fetch('/api/brands',{headers:{Authorization:`Bearer ${session?.access_token||''}`},cache:'no-store'}),d=await r.json().catch(()=>({}));
    const list:Workspace[]=r.ok?(d.brands||[]):[];setWorkspaces(list);
    try{
      const fromUrl=new URLSearchParams(location.search).get('brandId')||'';
      const saved=localStorage.getItem('mdsm:selectedWorkspaceId')||'';
      const candidate=fromUrl||saved;
      const valid=list.some(w=>w.id===candidate);
      if(valid){localStorage.setItem('mdsm:selectedWorkspaceId',candidate);setSelected(candidate)}else if(fromUrl){localStorage.removeItem('mdsm:selectedWorkspaceId')}
    }catch{}
  })()},[]);

  useEffect(()=>{(async()=>{
    if(!selected)return;
    setAccessLoading(true);setAccess(null);
    try{
      const session=(await getSupabase().auth.getSession()).data.session;
      const r=await fetch(`/api/workspace-access?workspace_id=${encodeURIComponent(selected)}`,{headers:{Authorization:`Bearer ${session?.access_token||''}`},cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(!r.ok){
        setAccess(null);
        if(r.status===403){location.href='/dashboard';}
        return;
      }
      setAccess(d as Access);
    }finally{setAccessLoading(false)}
  })()},[selected]);

  const visibleNav=useMemo(()=>nav.filter(([, , ,module])=>{
    if(access?.is_owner_or_admin)return true;
    const p=access?.permissions.find(x=>x.module===module);
    return p?.can_view===true;
  }),[access]);

  useEffect(()=>{
    if(accessLoading||!access)return;
    const current=nav.find(([label])=>label===title);
    if(current){
      const module=current[3];
      if(!access.is_owner_or_admin && !access.permissions.some(p=>p.module===module&&p.can_view)){location.href='/dashboard';}
    }
  },[access,accessLoading,title]);

  async function signOut(){setProfileOpen(false);await getSupabase().auth.signOut();try{localStorage.removeItem('mdsm:selectedWorkspaceId')}catch{}location.href='/login'}
  function backToWorkspaces(){try{localStorage.removeItem('mdsm:selectedWorkspaceId')}catch{}location.href='/dashboard'}
  function selectWorkspace(id:string){if(!id)return;try{localStorage.setItem('mdsm:selectedWorkspaceId',id)}catch{}setSelected(id)}

  if(workspaces===null)return <main className="auth-page"><div className="muted">Loading Social Media Manager…</div></main>;
  if(workspaces.length===0)return <main className="auth-page"><section className="auth-card" style={{maxWidth:520,textAlign:'center'}}><div className="brand">SOCIAL MEDIA MANAGER</div><h1>Welcome to Social Media Manager</h1><p className="muted">Create your first workspace to keep accounts, posts, analytics and publishing organized in one place.</p><button className="primary-btn" onClick={()=>location.href='/dashboard/brands'}>＋ Create Workspace</button><button className="text-btn" style={{display:'block',margin:'14px auto 0'}} onClick={signOut}>Sign out</button></section></main>;
  if(!selected)return <main className="auth-page"><section className="auth-card" style={{maxWidth:560,textAlign:'center'}}><div className="brand">SOCIAL MEDIA MANAGER</div><h1>Workspace required</h1><p className="muted">Select a workspace first. This section only opens accounts and publishing for the selected workspace.</p><select aria-label="Select workspace" defaultValue="" onChange={e=>selectWorkspace(e.target.value)} style={{width:'100%',minHeight:48,border:'1.5px solid #078b87',borderRadius:12,padding:'0 13px',background:'#fff',fontWeight:800,color:'#17202b'}}><option value="">Select a workspace…</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select><button className="text-btn" style={{display:'block',margin:'14px auto 0'}} onClick={backToWorkspaces}>← Back to Workspaces</button><button className="text-btn" style={{display:'block',margin:'10px auto 0',color:'#b42318'}} onClick={signOut}>↪ Logout</button></section></main>;
  const selectedWorkspace=workspaces.find(w=>w.id===selected);
  if(accessLoading||!access)return <main className="auth-page"><div className="muted">Loading workspace access…</div></main>;
  return <main className="app-shell"><div className={`sidebar-backdrop ${open?'show':''}`} onClick={()=>setOpen(false)}/><aside className={`sidebar ${open?'mobile-open':''}`}><div className="logo-block"><div className="logo-mark">MD</div><div className="logo-title">MD<span>HYGIENE</span><small>SOCIAL MANAGER</small></div><button className="drawer-close" onClick={()=>setOpen(false)}>×</button></div><nav>{visibleNav.map(([label,icon,href])=><button key={label} className={`nav-item ${title===label?'active':''}`} onClick={()=>{setOpen(false);location.href=href}}><b>{icon}</b><span>{label}</span></button>)}</nav><div className="side-user" style={{position:'relative'}}><div className="user-avatar">MD</div><div><strong>{access.role==='owner'?'Workspace Owner':access.role==='admin'?'Workspace Admin':access.role==='manager'?'Workspace Manager':'Employee'}</strong><small>{access.employee_id||email||'Account'}</small></div><button aria-label="Account menu" onClick={()=>setProfileOpen(v=>!v)}>⌄</button>{profileOpen&&<div style={{position:'absolute',right:0,bottom:'58px',width:190,padding:8,border:'1px solid #dce6ea',borderRadius:14,background:'#fff',boxShadow:'0 18px 40px rgba(15,23,42,.14)',zIndex:50}}><button onClick={signOut} style={{width:'100%',border:0,borderRadius:10,padding:'11px 12px',background:'#fff1f2',color:'#b42318',fontWeight:900,cursor:'pointer',textAlign:'left'}}>↪ Logout</button></div>}</div></aside><section className="main-shell"><header className="main-header"><button className="menu-btn" onClick={()=>setOpen(true)}>☰</button><strong>{title}</strong><div className="search-box">⌕ <span>Search anything...</span><kbd>Ctrl K</kbd></div><div className="header-actions"><button aria-label="Notifications">♢</button><select aria-label="Switch workspace" value={selected} onChange={e=>selectWorkspace(e.target.value)} style={{border:'1px solid #dce6ea',borderRadius:10,padding:'8px 10px',background:'#fff',fontWeight:800,maxWidth:170}}>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select><button className="header-profile" onClick={()=>setProfileOpen(v=>!v)}><div className="mini-logo">{selectedWorkspace?.logo_url?<img src={selectedWorkspace.logo_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:10}}/>:'WS'}</div><strong>{access.role==='owner'?'Owner':access.role==='admin'?'Admin':access.role==='manager'?'Manager':'Employee'}⌄</strong></button>{profileOpen&&<div style={{position:'absolute',right:16,top:58,width:190,padding:8,border:'1px solid #dce6ea',borderRadius:14,background:'#fff',boxShadow:'0 18px 40px rgba(15,23,42,.14)',zIndex:60}}><div style={{padding:'8px 10px',fontSize:11,color:'#718096',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis'}}>{email||access.employee_id||'Account'}</div><button onClick={signOut} style={{width:'100%',border:0,borderRadius:10,padding:'11px 12px',background:'#fff1f2',color:'#b42318',fontWeight:900,cursor:'pointer',textAlign:'left'}}>↪ Logout</button><button onClick={backToWorkspaces} style={{width:'100%',border:0,borderRadius:10,padding:'11px 12px',background:'#f7fafb',color:'#17202b',fontWeight:900,cursor:'pointer',textAlign:'left',marginTop:5}}>← Workspaces</button></div>}</div></header><div className="page-content">{children}</div></section></main>;
}
