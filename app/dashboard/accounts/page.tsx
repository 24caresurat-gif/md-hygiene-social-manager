'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';

type Account = { id: string; platform: string; name: string; handle: string; status: string };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const client = getSupabase();
        const { data: { user } } = await client.auth.getUser();
        if (!user) { window.location.href = '/login'; return; }
        const params = new URLSearchParams(window.location.search);
        const oauthError = params.get('error');
        if (oauthError) setError(oauthError);
        const { data, error: queryError } = await client.from('social_accounts').select('id,platform,name,handle,status').eq('user_id', user.id).order('created_at', { ascending: false });
        if (queryError) setError(queryError.message);
        else if (data) setAccounts(data as Account[]);
      } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load connected accounts.'); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const platforms = [
    { key: 'facebook', icon: '📘', title: 'Facebook Pages', text: 'Connect and manage multiple Facebook Pages.' },
    { key: 'instagram', icon: '📸', title: 'Instagram', text: 'Connect multiple Instagram professional accounts.' },
    { key: 'google_business', icon: '📍', title: 'Google Business', text: 'Manage multiple Google Business locations.' },
  ];

  function connectPlatform(key: string) {
    if (key === 'facebook') window.location.href = '/api/meta/facebook/login';
  }

  return <main className="dashboard"><header className="topbar"><div><div className="brand">MD HYGIENE</div><strong>Social Media Manager</strong></div><button className="secondary" onClick={() => window.location.href = '/dashboard'}>Back to workspace</button></header><section className="workspace"><div className="workspace-head"><div><span className="eyebrow">CONNECTED ACCOUNTS</span><h1>Social Accounts</h1><p className="muted">Manage all your Facebook Pages, Instagram accounts and Google Business locations in one place.</p>{error && <p className="muted" style={{ marginTop: 12 }}>Connection message: {error}</p>}</div></div><div className="cards">{platforms.map(p => <article key={p.key}><span>{p.icon}</span><h2>{p.title}</h2><p>{p.text}</p><button className="secondary" disabled={p.key !== 'facebook'} onClick={() => connectPlatform(p.key)}>Connect {p.title}</button></article>)}</div><section style={{ marginTop: 32, background: 'white', border: '1px solid #e5e7eb', borderRadius: 20, padding: 26 }}><h2>Connected accounts</h2>{loading ? <p className="muted">Loading…</p> : accounts.length === 0 ? <p className="muted">No accounts connected yet. Connect your first platform above.</p> : accounts.map(a => <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #eee' }}><div><strong>{a.platform}</strong> — {a.name} {a.handle && <span className="muted">{a.handle}</span>}</div><span className="status">● {a.status}</span></div>)}</section></section></main>;
}
