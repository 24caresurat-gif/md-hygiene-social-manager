'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';
import WorkspaceHub from '../components/WorkspaceHub';
import type { Brand } from '../components/BrandSelector';

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Brand[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = getSupabase();
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          location.href = '/login';
          return;
        }

        const session = (await supabase.auth.getSession()).data.session;
        if (!session) {
          location.href = '/login';
          return;
        }

        const response = await fetch('/api/brands', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || 'Unable to load workspaces.');

        if (active) setWorkspaces(Array.isArray(payload?.brands) ? payload.brands : []);
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : 'Unable to load workspaces.');
          setWorkspaces([]);
        }
      }
    })();

    return () => { active = false; };
  }, []);

  if (workspaces === null) {
    return <main className="auth-page"><div className="muted">Loading workspaces…</div></main>;
  }

  if (error) {
    return <main className="auth-page"><section className="auth-card" style={{ maxWidth: 620 }}><h1>Workspace Error</h1><p className="muted">{error}</p><button className="primary-btn" onClick={() => location.reload()}>Retry</button></section></main>;
  }

  return <WorkspaceHub workspaces={workspaces} onOpen={(id) => {
    try { localStorage.setItem('mdsm:selectedWorkspaceId', id); } catch {}
    location.href = '/dashboard';
  }} />;
}
