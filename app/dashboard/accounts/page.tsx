'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase-browser';

type Account = { id: string; platform: string; name: string; handle: string; status: string };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/login'; return; }
      const { data } = await supabase.from('social_accounts').select('id,platform,name,handle,status').eq('user_id', user.id).order('created_at', { ascending: false });
      if (data) setAccounts(data as Account[]);
      setLoading(false);
    }
    load();
  }, []);

  const platforms = [
    { key: 'facebook', icon: '📘', title: 'Facebook Pages', text: 'Connect and manage multiple Facebook Pages.' },
    { key: 'instagram', icon: '📸', title: 'Instagram', text: 'Connect multiple Instagram professional accounts.' },
    { key: 'google_business', icon: '📍', title: 'Google Business', text: 'Manage multiple Google Business locations.' },
  ];

  return <main className="dashboard"><header className="topbar"><div><div className="brand">MD HYGIENE</div><strong>Social Media Manager</strong></div><button className="secondary" onClick={() => window.location.href = '/dashboard'}>Back to workspace</button></header><section className="workspace"><div className="workspace-head"><div><span className="eyebrow">CONNECTED ACCOUNTS</span><h1>Social Accounts</h1><p className="muted">Manage all your Facebook Pages, Instagram accounts and Google Business locations in one place.</p></div></div><div className="cards">{platforms.map(p => <article key={p.key}><span>{p.icon}</span><h2>{p.title}</h2><p>{p.text}</p><button className="secondary" disabled>Connect {p.title}</button></article>)}</div><section style={{ marginTop: 32, background: 'white', border: '1px solid #e5e7eb', borderRadius: 20, padding: 26 }}><h2>Connected accounts</h2>{loading ? <p className="muted">Loading…</p> : accounts.length === 0 ? <p className="muted">No accounts connected yet. Connect your first platform above.</p> : accounts.map(a => <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #eee' }}><div><strong>{a.platform}</strong> — {a.name} {a.handle && <span className="muted">{a.handle}</span>}</div><span className="status">● {a.status}</span></div>)}</section></section></main>;
}
