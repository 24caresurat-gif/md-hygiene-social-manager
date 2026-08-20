'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase-browser';

const nav = [
  ['Dashboard','⌂','/dashboard'], ['Accounts','◉','/dashboard/accounts'], ['Create Post','✎','/dashboard/publish'],
  ['Calendar','□','#'], ['Analytics','▥','#'], ['Media Library','▧','#'], ['Leads','♙','#'], ['Settings','⚙','#'],
];
const stats = [['Total Posts','128','↑ 18% this month','↗'],['Total Reach','24.5K','↑ 24% this month','◉'],['Engagement','2.7K','↑ 16% this month','♡'],['Followers','12.8K','↑ 12% this month','♧'],['Impressions','45.3K','↑ 20% this month','➤']];

export default function DashboardPage() {
  const [email, setEmail] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [mobileNav, setMobileNav] = useState(false);
  useEffect(() => { try { getSupabase().auth.getUser().then(({ data, error }) => { if (error) setError(error.message); else if (!data.user) window.location.href = '/login'; else setEmail(data.user.email ?? ''); setLoading(false); }); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to connect to Supabase.'); setLoading(false); } }, []);
  async function signOut() { try { await getSupabase().auth.signOut(); } finally { window.location.href = '/login'; } }
  function go(href:string){ if(href!=='#') window.location.href=href; setMobileNav(false); }
  if (loading) return <main className="auth-page"><div className="muted">Loading workspace…</div></main>;
  if (error) return <main className="auth-page"><section className="auth-card"><div className="brand">MD HYGIENE</div><h1>Configuration needed</h1><p className="muted">{error}</p></section></main>;
  return <main className="app-shell">
    <button className={`mobile-nav-backdrop ${mobileNav?'show':''}`} aria-label="Close navigation" onClick={()=>setMobileNav(false)} />
    <aside className={`sidebar ${mobileNav?'mobile-open':''}`}><div className="logo-block"><div className="logo-mark">MD</div><div className="logo-title">MD<span>HYGIENE</span><small>SOCIAL MANAGER</small></div><button className="mobile-close" onClick={()=>setMobileNav(false)}>×</button></div>
      <nav>{nav.map(([label,icon,href])=><button key={label} className={label==='Dashboard'?'nav-item active':'nav-item'} onClick={()=>go(href)}><b>{icon}</b><span>{label}</span></button>)}</nav>
      <div className="plan-card"><div className="plan-icon">➤</div><strong>Plan: Professional</strong><small>Valid till 23 Dec 2026</small><button>Upgrade Plan</button></div>
      <div className="side-user"><div className="user-avatar">MD</div><div><strong>MD Hygiene</strong><small>{email || 'Admin'}</small></div><button onClick={signOut}>⌄</button></div><div className="dark-toggle"><span>◐ &nbsp; Dark Mode</span><i/></div>
    </aside>
    <section className="main-shell"><header className="main-header"><button className="menu-btn" aria-label="Open navigation" onClick={()=>setMobileNav(true)}>☰</button><strong>Dashboard</strong><div className="search-box">⌕ <span>Search anything...</span><kbd>Ctrl K</kbd></div><div className="header-actions"><span>♧</span><span className="notification">♢<i>3</i></span><div className="header-profile"><div className="mini-logo">MD</div><strong>MD Hygiene</strong><span>⌄</span></div></div></header>
      <div className="dashboard-content"><div className="welcome-row"><div><h1>Welcome back, MD Hygiene! 👋</h1><p>Manage your social media presence from one place.</p></div><span className="live-pill"><i/> System Status: Online</span></div>
        <div className="stat-grid">{stats.map(([name,value,change,icon])=><article className="stat-card" key={name}><div className="stat-icon">{icon}</div><div><span>{name}</span><strong>{value}</strong><small>{change}</small></div></article>)}</div>
        <div className="channel-grid"><Channel icon="f" title="Facebook" subtitle="Connect your Facebook Page" name="M D Hygiene India" detail="Page connected" tone="blue" action="Manage Facebook" href="/dashboard/accounts"/><Channel icon="◎" title="Instagram" subtitle="Connect your Instagram Account" name="mdhygiene_india" detail="Business Account" tone="pink" action="Manage Instagram" href="/dashboard/accounts"/><Channel icon="G" title="Google Business" subtitle="Connect your Business Profile" name="MD Hygiene" detail="Business Profile" tone="green" action="Manage Google Business" href="/dashboard/accounts"/></div>
        <div className="bottom-grid"><section className="recent-card"><div className="section-head"><div><span>CONTENT</span><h2>Recent Posts</h2></div><button>View all</button></div>{[['Stay Fresh, Stay Confident with MD Hygiene...','Facebook','4.2K','312'],['Comfort that cares for you always 💗','Instagram','6.1K','645'],['Trusted protection for every moment ✨','Facebook','3.8K','278'],['Hygiene is not a choice, it’s a lifestyle.','Instagram','5.3K','532']].map((p,i)=><div className="post-row" key={i}><div className={`post-thumb thumb-${i}`}>{i%2?'♡':'MD'}</div><div className="post-title"><strong>{p[0]}</strong><small>{p[1]} · Published</small></div><span>{p[2]}</span><span>{p[3]}</span><em>Published</em><b>⋮</b></div>)}</section><aside className="right-column"><div className="quick-card"><span className="quick-icon">✎</span><div><strong>Quick Create Post</strong><small>Create and publish new post across all platforms</small></div><button onClick={()=>go('/dashboard/publish')}>＋ &nbsp; Create New Post</button></div><div className="summary-card"><div className="section-head"><div><span>OVERVIEW</span><h2>Monthly Summary</h2></div><select><option>May 2025</option></select></div><Summary label="Total Posts" value="128" change="↑ 18%"/><Summary label="Total Reach" value="24.5K" change="↑ 24%"/><Summary label="Engagement" value="2.7K" change="↑ 16%"/><Summary label="New Followers" value="1.2K" change="↑ 14%"/></div></aside></div>
      </div></section>
  </main>;
}
function Channel({icon,title,subtitle,name,detail,tone,action,href}:{icon:string;title:string;subtitle:string;name:string;detail:string;tone:string;action:string;href:string}){return <article className="channel-card"><div className={`channel-icon ${tone}`}>{icon}</div><div className="channel-head"><div><h2>{title}</h2><small>{subtitle}</small></div><span className="connected-pill">✓ Connected</span></div><div className="channel-account"><div className="mini-logo">MD</div><div><strong>{name}</strong><small>{detail}</small></div></div><button className={`channel-action ${tone}`} onClick={()=>window.location.href=href}>{action}<b>›</b></button></article>}
function Summary({label,value,change}:{label:string;value:string;change:string}){return <div className="summary-row"><span>◉</span><strong>{label}</strong><b>{value}</b><em>{change}</em></div>}
