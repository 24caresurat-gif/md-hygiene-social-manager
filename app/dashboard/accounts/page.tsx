'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';

type Account = { id: string; platform: string; name: string; handle: string; status: string };
type FacebookPage = { id: string; name: string; handle: string | null };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [facebookPages, setFacebookPages] = useState<FacebookPage[]>([]);
  const [selectedPage, setSelectedPage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingPages, setLoadingPages] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadAccounts() {
    const client = getSupabase();
    const { data: { user } } = await client.auth.getUser();
    if (!user) { window.location.href = '/login'; return; }
    const { data, error: queryError } = await client
      .from('social_accounts')
      .select('id,platform,name,handle,status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (queryError) setError(queryError.message);
    else if (data) setAccounts(data as Account[]);
  }

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams(window.location.search);
        const oauthError = params.get('error');
        if (oauthError) setError(oauthError);
        await loadAccounts();
        if (params.get('facebook') === 'connected') await loadFacebookPages();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to load connected accounts.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function loadFacebookPages() {
    setLoadingPages(true);
    try {
      const response = await fetch('/api/meta/facebook/pages', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load Facebook Pages.');
      setFacebookPages(data.pages || []);
      if (data.pages?.length === 1) setSelectedPage(data.pages[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load Facebook Pages.');
    } finally {
      setLoadingPages(false);
    }
  }

  async function connectSelectedFacebookPage() {
    if (!selectedPage) {
      setError('Please select a Facebook Page.');
      return;
    }
    setConnecting(true);
    setError('');
    setSuccess('');
    try {
      const client = getSupabase();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('Your Social Manager login session has expired. Please sign in again.');

      const response = await fetch('/api/meta/facebook/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ pageId: selectedPage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to connect Facebook Page.');
      setSuccess(`Connected ${data.page?.name || 'Facebook Page'} successfully.`);
      setFacebookPages([]);
      setSelectedPage('');
      await loadAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to connect Facebook Page.');
    } finally {
      setConnecting(false);
    }
  }

  const platforms = [
    { key: 'facebook', icon: '📘', title: 'Facebook Pages', text: 'Connect and manage multiple Facebook Pages.' },
    { key: 'instagram', icon: '📸', title: 'Instagram', text: 'Connect multiple Instagram professional accounts.' },
    { key: 'google_business', icon: '📍', title: 'Google Business', text: 'Manage multiple Google Business locations.' },
  ];

  function connectPlatform(key: string) {
    if (key === 'facebook') window.location.href = '/api/meta/facebook/login';
  }

  return <main className="dashboard"><header className="topbar"><div><div className="brand">MD HYGIENE</div><strong>Social Media Manager</strong></div><button className="secondary" onClick={() => window.location.href = '/dashboard'}>Back to workspace</button></header><section className="workspace"><div className="workspace-head"><div><span className="eyebrow">CONNECTED ACCOUNTS</span><h1>Social Accounts</h1><p className="muted">Manage all your Facebook Pages, Instagram accounts and Google Business locations in one place.</p>{error && <p className="muted" style={{ marginTop: 12 }}>Connection message: {error}</p>}{success && <p className="muted" style={{ marginTop: 12 }}>{success}</p>}</div></div><div className="cards">{platforms.map(p => <article key={p.key}><span>{p.icon}</span><h2>{p.title}</h2><p>{p.text}</p><button className="secondary" disabled={p.key !== 'facebook'} onClick={() => connectPlatform(p.key)}>Connect {p.title}</button></article>)}</div>{facebookPages.length > 0 && <section style={{ marginTop: 24, background: 'white', border: '1px solid #e5e7eb', borderRadius: 20, padding: 26 }}><h2>Select Facebook Page</h2><p className="muted">Choose the Page you want MD Hygiene Social Manager to manage.</p><select value={selectedPage} onChange={(e) => setSelectedPage(e.target.value)} style={{ marginTop: 14, width: '100%', maxWidth: 520, padding: '12px 14px', borderRadius: 10, border: '1px solid #d1d5db' }}><option value="">Select a Page…</option>{facebookPages.map(page => <option key={page.id} value={page.id}>{page.name}{page.handle ? ` (@${page.handle})` : ''}</option>)}</select><div style={{ marginTop: 14 }}><button className="secondary" disabled={!selectedPage || connecting || loadingPages} onClick={connectSelectedFacebookPage}>{connecting ? 'Connecting…' : 'Connect Selected Page'}</button></div></section>}{loadingPages && <section style={{ marginTop: 24, background: 'white', border: '1px solid #e5e7eb', borderRadius: 20, padding: 26 }}><p className="muted">Loading your Facebook Pages…</p></section>}<section style={{ marginTop: 32, background: 'white', border: '1px solid #e5e7eb', borderRadius: 20, padding: 26 }}><h2>Connected accounts</h2>{loading ? <p className="muted">Loading…</p> : accounts.length === 0 ? <p className="muted">No accounts connected yet. Connect your first platform above.</p> : accounts.map(a => <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #eee' }}><div><strong>{a.platform}</strong> — {a.name} {a.handle && <span className="muted">{a.handle}</span>}</div><span className="status">● {a.status}</span></div>)}</section></section></main>;
}
