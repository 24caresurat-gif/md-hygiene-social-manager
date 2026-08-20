'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';

const nav = [
  ['Dashboard','⌂','/dashboard'], ['Accounts','◎','/dashboard/accounts'], ['Create Post','✎','/dashboard/publish'],
  ['Calendar','□','/dashboard/calendar'], ['Analytics','▥','/dashboard/analytics'], ['Media Library','▧','/dashboard/media'],
  ['Leads','♙','/dashboard/leads'], ['Settings','⚙','/dashboard/settings'],
];

export default function AppShell({ children, title = 'Dashboard' }: { children: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  useEffect(() => { getSupabase().auth.getUser().then(({data}) => { if (!data.user) window.location.href='/login'; else setEmail(data.user.email || ''); }); }, []);
  async function signOut(){ await getSupabase().auth.signOut(); window.location.href='/login'; }
  return <main className="app-shell">
    <div className={`sidebar-backdrop ${open?'show':''}`} onClick={()=>setOpen(false)} />
    <aside className={`sidebar ${open?'mobile-open':''}`}>
      <div className="logo-block"><div className="logo-mark">MD</div><div className="logo-title">MD<span>HYGIENE</span><small>SOCIAL MANAGER</small></div><button className="drawer-close" onClick={()=>setOpen(false)}>×</button></div>
      <nav>{nav.map(([label,icon,href])=><button key={label} className={`nav-item ${title===label?'active':''}`} onClick={()=>{setOpen(false);window.location.href=href}}><b>{icon}</b><span>{label}</span></button>)}</nav>
      <div className="plan-card"><div className="plan-icon">✦</div><strong>Professional Plan</strong><small>Valid till 23 Dec 2026</small><button onClick={()=>window.location.href='/dashboard/settings'}>Manage Plan</button></div>
      <div className="side-user"><div className="user-avatar">MD</div><div><strong>MD Hygiene</strong><small>{email || 'Admin'}</small></div><button onClick={signOut}>↪</button></div>
    </aside>
    <section className="main-shell"><header className="main-header"><button className="menu-btn" onClick={()=>setOpen(true)}>☰</button><strong>{title}</strong><div className="search-box">⌕ <span>Search anything...</span><kbd>Ctrl K</kbd></div><div className="header-actions"><button aria-label="Notifications">♢<i>3</i></button><button className="header-profile" onClick={()=>window.location.href='/dashboard/settings'}><div className="mini-logo">MD</div><strong>MD Hygiene</strong><span>⌄</span></button></div></header><div className="page-content">{children}</div></section>
  </main>;
}
