'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';

type Account = { id: string; name: string; handle: string | null; platform: string; status: string };

export default function PublishPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const client = getSupabase();
        const { data: { user } } = await client.auth.getUser();
        if (!user) { window.location.href = '/login'; return; }
        const { data, error: queryError } = await client
          .from('social_accounts')
          .select('id,name,handle,platform,status')
          .eq('user_id', user.id)
          .eq('platform', 'facebook')
          .eq('status', 'connected')
          .order('created_at', { ascending: false });
        if (queryError) throw new Error(queryError.message);
        setAccounts((data || []) as Account[]);
        if (data?.length === 1) setAccountId(data[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to load Facebook Pages.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function publish() {
    setPublishing(true);
    setError('');
    setSuccess('');
    try {
      const client = getSupabase();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('Your Social Manager session has expired.');
      const response = await fetch('/api/meta/facebook/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ accountId, message, link }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Facebook publish failed.');
      setSuccess(`Published successfully to ${data.page}. Post ID: ${data.postId || 'created'}`);
      setMessage('');
      setLink('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Facebook publish failed.');
    } finally {
      setPublishing(false);
    }
  }

  return <main className="dashboard"><header className="topbar"><div><div className="brand">MD HYGIENE</div><strong>Social Media Manager</strong></div><button className="secondary" onClick={() => window.location.href = '/dashboard'}>Back to workspace</button></header><section className="workspace"><div className="workspace-head"><div><span className="eyebrow">PUBLISH</span><h1>Facebook Post</h1><p className="muted">Create a post, preview it, then publish it to your connected Facebook Page.</p></div></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}><section style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 20, padding: 26 }}><h2>Compose</h2><label className="muted">Facebook Page</label><select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ marginTop: 8, width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #d1d5db' }} disabled={loading || publishing}><option value="">Select a Page…</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.handle ? ` (@${a.handle})` : ''}</option>)}</select><label className="muted" style={{ display: 'block', marginTop: 18 }}>Caption</label><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your professional Facebook caption…" rows={10} style={{ marginTop: 8, width: '100%', padding: 14, borderRadius: 10, border: '1px solid #d1d5db', resize: 'vertical' }} disabled={publishing} /><label className="muted" style={{ display: 'block', marginTop: 18 }}>Optional Link</label><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." style={{ marginTop: 8, width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #d1d5db' }} disabled={publishing} /><button className="secondary" style={{ marginTop: 18 }} disabled={!accountId || !message.trim() || publishing || loading} onClick={publish}>{publishing ? 'Publishing…' : 'Confirm & Publish to Facebook'}</button>{error && <p className="muted" style={{ marginTop: 14 }}>Publish error: {error}</p>}{success && <p className="muted" style={{ marginTop: 14 }}>{success}</p>}</section><section style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 20, padding: 26 }}><h2>Preview</h2><div style={{ border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden' }}><div style={{ padding: '14px 16px', borderBottom: '1px solid #eee' }}><strong>{accounts.find(a => a.id === accountId)?.name || 'Facebook Page'}</strong></div><div style={{ padding: 18, minHeight: 180, whiteSpace: 'pre-wrap' }}>{message || <span className="muted">Your post preview will appear here…</span>}</div>{link && <div style={{ padding: '12px 18px', borderTop: '1px solid #eee' }} className="muted">{link}</div>}</div></section></div></section></main>;
}
