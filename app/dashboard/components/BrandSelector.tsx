'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';

export type Brand = { id: string; name: string; slug: string; logo_url?: string | null };
export const ALL_BRANDS_ID = 'all';

export default function BrandSelector({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [workspaces, setWorkspaces] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = (await getSupabase().auth.getSession()).data.session;
        if (!session) return;
        const r = await fetch('/api/brands', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Unable to load workspaces.');
        if (active) setWorkspaces(d.brands || []);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load workspaces.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <div className="workspaceSelector" aria-label="Workspace selector">
      <style jsx>{`
        .workspaceSelector { width:min(390px,100%); background:#fff; border:1px solid #dce6ea; border-radius:16px; padding:14px; box-shadow:0 10px 28px rgba(15,23,42,.07); }
        .title { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
        .icon { width:38px; height:38px; border-radius:11px; display:grid; place-items:center; background:#e8f8f7; color:#078b87; font-size:19px; font-weight:900; }
        .title strong { display:block; color:#17202b; font-size:12px; font-weight:900; }
        .title small { display:block; margin-top:2px; color:#7b8794; font-size:9px; }
        .select { width:100%; min-height:44px; appearance:auto; border:1.5px solid #078b87; border-radius:11px; background:#fff; color:#17202b; padding:0 12px; font-size:13px; font-weight:800; outline:none; }
        .select:focus { box-shadow:0 0 0 3px rgba(7,139,135,.14); }
        .select:disabled { opacity:.65; }
        .manage { display:inline-block; margin-top:8px; color:#078b87; font-size:10px; font-weight:800; text-decoration:none; }
        .manage:hover { text-decoration:underline; }
        .error { display:block; margin-top:7px; color:#b42318; font-size:9px; font-weight:700; }
        @media(max-width:760px) { .workspaceSelector { width:100%; } .select { min-height:46px; font-size:14px; } }
      `}</style>
      <div className="title">
        <span className="icon">▦</span>
        <div><strong>Workspace</strong><small>Accounts, dashboard & publishing</small></div>
      </div>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} disabled={loading} aria-label="Select workspace">
        <option value={ALL_BRANDS_ID}>{loading ? 'Loading workspaces…' : 'All Workspaces'}</option>
        {workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name}</option>)}
      </select>
      {error ? <small className="error">{error}</small> : null}
      <a className="manage" href="/dashboard/brands">＋ Create Workspace</a>
    </div>
  );
}
