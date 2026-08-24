'use client';
import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {getSupabase} from '../../../lib/supabase-browser';

type Workspace={id:string;name:string;logo_url?:string|null};
type Permission={module:string;can_view:boolean;can_create:boolean;can_edit:boolean;can_submit:boolean;can_approve:boolean;can_publish:boolean;can_manage:boolean};
type Access={role:string;employee_id?:string|null;permissions:Permission[];is_owner_or_admin:boolean};
type IconName='dashboard'|'accounts'|'create'|'creative'|'drafts'|'calendar'|'history'|'analytics'|'media'|'settings'|'search'|'bell'|'menu'|'chevron';

const nav=[
  ['Dashboard','dashboard','/dashboard','dashboard'],
  ['Accounts','accounts','/dashboard/accounts','social_accounts'],
  ['Create Post','create','/dashboard/publish','content'],
  ['Creative Intelligence','creative','/dashboard/creative-insights','creative'],
  ['Drafts','drafts','/dashboard/drafts','drafts'],
  ['Calendar','calendar','/dashboard/calendar','calendar'],
  ['Publishing History','history','/dashboard/history','publishing'],
  ['Analytics','analytics','/dashboard/analytics','analytics'],
  ['Media Library','media','/dashboard/media','content'],
] as const;

function Icon({name,size=18}:{name:IconName;size?:number}){
  const common={width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,ariaHidden:true};
  switch(name){
    case 'dashboard': return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
    case 'accounts': return <svg {...common}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/><path d="M16.5 7.5h.01"/></svg>;
    case 'create': return <svg {...common}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>;
    case 'creative': return <svg {...common}><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z"/></svg>;
    case 'drafts': return <svg {...common}><path d="M6 3.5h9l3 3V20.5H6Z"/><path d="M15 3.5v3h3"/><path d="M9 12h6M9 16h4"/></svg>;
    case 'calendar': return <svg {...common}><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 9.5h18"/></svg>;
    case 'history': return <svg {...common}><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4.5v5h5"/><path d="M12 7v5l3 2"/></svg>;
    case 'analytics': return <svg {...common}><path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/></svg>;
    case 'media': return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4.5 17 4.5-4.5 3.2 3.2 2.3-2.3 5 3.6"/></svg>;
    case 'settings': return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 1.7-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V20h-2.4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L8 17l.1-.1A1.7 1.7 0 0 0 8.4 15a1.7 1.7 0 0 0-1.6-1H6v-2.4h.8a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L8 8.6l1.7-1.7.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.7 1.7-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0-1.6 1H22V14h-.8a1.7 1.7 0 0 0-1.8 1Z"/></svg>;
    case 'search': return <svg {...common}><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>;
    case 'bell': return <svg {...common}><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>;
    case 'menu': return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case 'chevron': return <svg {...common}><path d="m7 10 5 5 5-5"/></svg>;
  }
}

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
      if(!r.ok){setAccess(null);if(r.status===403){location.href='/dashboard';}return;}
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
    if(current){const module=current[3];const allowed=access.is_owner_or_admin||access.permissions.some(p=>p.module===module&&p.can_view);if(!allowed)location.href='/dashboard';}
  },[access,accessLoading,title]);

  async function signOut(){setProfileOpen(false);await getSupabase().auth.signOut();try{localStorage.removeItem('mdsm:selectedWorkspaceId')}catch{}location.href='/login'}
  function backToWorkspaces(){setProfileOpen(false);try{localStorage.removeItem('mdsm:selectedWorkspaceId')}catch{}location.href='/dashboard'}
  function selectWorkspace(id:string){if(!id)return;setProfileOpen(false);try{localStorage.setItem('mdsm:selectedWorkspaceId',id)}catch{}setSelected(id)}

  if(workspaces===null)return <main className="auth-page"><div className="muted">Loading Social Media Manager…</div></main>;
  if(workspaces.length===0)return <main className="auth-page"><section className="auth-card" style={{maxWidth:520,textAlign:'center'}}><div className="brand">SOCIAL MEDIA MANAGER</div><h1>Welcome to Social Media Manager</h1><p className="muted">Create your first workspace to keep accounts, posts, analytics and publishing organized in one place.</p><button className="primary-btn" onClick={()=>location.href='/dashboard/brands'}><Icon name="create" size={16}/> Create Workspace</button><button className="text-btn" style={{display:'block',margin:'14px auto 0'}} onClick={signOut}>Sign out</button></section></main>;
  if(!selected)return <main className="auth-page"><section className="auth-card" style={{maxWidth:560,textAlign:'center'}}><div className="brand">SOCIAL MEDIA MANAGER</div><h1>Workspace required</h1><p className="muted">Select a workspace first. This section only opens accounts and publishing for the selected workspace.</p><select aria-label="Select workspace" defaultValue="" onChange={e=>selectWorkspace(e.target.value)} style={{width:'100%',minHeight:48,border:'1.5px solid #087f7b',borderRadius:12,padding:'0 13px',background:'#fff',fontWeight:700,color:'#17202b'}}><option value="">Select a workspace…</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select><button className="text-btn" style={{display:'block',margin:'14px auto 0'}} onClick={backToWorkspaces}>← Back to Workspaces</button><button className="text-btn" style={{display:'block',margin:'10px auto 0',color:'#b42318'}} onClick={signOut}>Logout</button></section></main>;
  const selectedWorkspace=workspaces.find(w=>w.id===selected);
  if(accessLoading||!access)return <main className="auth-page"><div className="muted">Loading workspace access…</div></main>;
  return <main className="app-shell"><div className={`sidebar-backdrop ${open?'show':''}`} onClick={()=>setOpen(false)}/><aside className={`sidebar ${open?'mobile-open':''}`}><div className="logo-block"><div className="logo-mark">MD</div><div className="logo-title">MD<span>HYGIENE</span><small>SOCIAL MANAGER</small></div><button className="drawer-close" onClick={()=>setOpen(false)}><Icon name="chevron" size={18}/></button></div><nav>{visibleNav.map(([label,icon,href])=><button key={label} className={`nav-item ${title===label?'active':''}`} onClick={()=>{setOpen(false);setProfileOpen(false);location.href=href}}><b><Icon name={icon as IconName} size={17}/></b><span>{label}</span></button>)}</nav><div className="side-user"><div className="user-avatar">MD</div><div><strong>{access.role==='owner'?'Workspace Owner':access.role==='admin'?'Workspace Admin':access.role==='manager'?'Workspace Manager':'Employee'}</strong><small>{access.employee_id||email||'Account'}</small></div></div></aside><section className="main-shell"><header className="main-header"><button className="menu-btn" onClick={()=>setOpen(true)} aria-label="Open navigation"><Icon name="menu" size={18}/></button><strong>{title}</strong><div className="search-box"><Icon name="search" size={16}/><span>Search anything...</span><kbd>Ctrl K</kbd></div><div className="header-actions"><button aria-label="Notifications"><Icon name="bell" size={17}/></button><select aria-label="Switch workspace" value={selected} onChange={e=>selectWorkspace(e.target.value)} style={{border:'1px solid #dfe4ea',borderRadius:10,padding:'8px 10px',background:'#fff',fontWeight:700,maxWidth:170}}>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select><div style={{position:'relative'}}><button className="header-profile" onClick={()=>setProfileOpen(v=>!v)} aria-expanded={profileOpen}><div className="mini-logo">{selectedWorkspace?.logo_url?<img src={selectedWorkspace.logo_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:10}}/>:'WS'}</div><strong>{access.role==='owner'?'Owner':access.role==='admin'?'Admin':access.role==='manager'?'Manager':'Employee'} <Icon name="chevron" size={14}/></strong></button>{profileOpen&&<div style={{position:'absolute',right:0,top:46,width:210,padding:8,border:'1px solid #e1e6eb',borderRadius:12,background:'#fff',boxShadow:'0 18px 40px rgba(15,23,42,.14)',zIndex:60}}><div style={{padding:'8px 10px 10px',fontSize:11,color:'#667085',fontWeight:650,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{email||access.employee_id||'Account'}</div><button onClick={signOut} style={{width:'100%',border:0,borderRadius:9,padding:'10px 12px',background:'#fff1f0',color:'#b42318',fontWeight:800,cursor:'pointer',textAlign:'left'}}>Logout</button><button onClick={backToWorkspaces} style={{width:'100%',border:0,borderRadius:9,padding:'10px 12px',background:'#f7f9fb',color:'#17202b',fontWeight:800,cursor:'pointer',textAlign:'left',marginTop:5}}>Workspaces</button></div>}</div></div></header><div className="page-content">{children}</div></section></main>;
}