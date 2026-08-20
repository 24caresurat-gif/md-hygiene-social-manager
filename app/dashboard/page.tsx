'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase-browser';

export default function DashboardPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/login';
      else setEmail(data.user.email ?? '');
      setLoading(false);
    });
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  if (loading) return <main className="auth-page"><div className="muted">Loading workspace…</div></main>;

  return (
    <main className="dashboard">
      <header className="topbar"><div><div className="brand">MD HYGIENE</div><strong>Social Media Manager</strong></div><button className="secondary" onClick={signOut}>Sign out</button></header>
      <section className="workspace">
        <div className="workspace-head"><div><span className="eyebrow">WORKSPACE</span><h1>MD Hygiene</h1><p className="muted">Welcome, {email}</p></div><span className="status">● Ready</span></div>
        <div className="cards">
          <article><span>📘</span><h2>Facebook</h2><p>Connect your Facebook Page to publish posts.</p><button className="secondary" disabled>Connect next</button></article>
          <article><span>📸</span><h2>Instagram</h2><p>Connect your Instagram professional account.</p><button className="secondary" disabled>Connect next</button></article>
          <article><span>✍️</span><h2>Create Post</h2><p>Write, preview and confirm your social post.</p><button className="secondary" disabled>Coming next</button></article>
        </div>
      </section>
    </main>
  );
}
