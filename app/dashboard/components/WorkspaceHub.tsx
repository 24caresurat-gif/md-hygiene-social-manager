'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';
import type { Brand } from './BrandSelector';

type WorkspaceStatus = {
  connected: number;
  total: number;
  platforms: string[];
  warning?: boolean;
};

type Props = {
  workspaces: Brand[];
  onOpen: (id: string) => void;
  onCreate: () => void;
};

const platformLabel: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  google_business: 'Google',
};

function saveWorkspace(id: string) {
  try {
    localStorage.setItem('mdsm:selectedWorkspaceId', id);
  } catch {}
}

export default function WorkspaceHub({ workspaces, onOpen, onCreate }: Props) {
  const [statuses, setStatuses] = useState<Record<string, WorkspaceStatus>>({});
  const [loading, setLoading] = useState(true);

  const loadStatuses = useCallback(async () => {
    if (!workspaces.length) {
      setStatuses({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const session = (await getSupabase().auth.getSession()).data.session;
      if (!session) return;
      const results = await Promise.all(workspaces.map(async (workspace) => {
        try {
          const response = await fetch(`/api/dashboard/metrics?brandId=${encodeURIComponent(workspace.id)}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: 'no-store',
          });
          const data = await response.json().catch(() => null);
          if (!response.ok) throw new Error();
          const accounts = Array.isArray(data?.accounts) ? data.accounts.filter(Boolean) : [];
          const platforms = [...new Set(accounts.map((account: any) => account.platform).filter(Boolean))] as string[];
          return [workspace.id, {
            connected: accounts.length,
            total: 3,
            platforms,
            warning: Boolean(data?.warnings?.length),
          }] as const;
        } catch {
          return [workspace.id, { connected: 0, total: 3, platforms: [], warning: true }] as const;
        }
      }));
      setStatuses(Object.fromEntries(results));
    } finally {
      setLoading(false);
    }
  }, [workspaces]);

  useEffect(() => { void loadStatuses(); }, [loadStatuses]);

  const totalConnected = useMemo(() => Object.values(statuses).reduce((sum, item) => sum + item.connected, 0), [statuses]);

  function openWorkspace(id: string) {
    saveWorkspace(id);
    onOpen(id);
  }

  return (
    <main className="workspace-hub">
      <style jsx>{`
        .workspace-hub{min-height:100vh;padding:48px clamp(20px,5vw,72px);background:radial-gradient(circle at 12% 0%,rgba(20,184,166,.11),transparent 32%),radial-gradient(circle at 90% 8%,rgba(59,130,246,.09),transparent 28%),#f7fafb;color:#17202b}
        .hub-shell{max-width:1240px;margin:0 auto}
        .hub-top{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:30px}
        .eyebrow{display:inline-flex;align-items:center;gap:7px;color:#078b87;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
        .eyebrow i{width:7px;height:7px;border-radius:50%;background:#14b8a6;box-shadow:0 0 0 5px rgba(20,184,166,.12)}
        h1{margin:8px 0 8px;font-size:clamp(30px,4vw,48px);line-height:1.03;letter-spacing:-.045em}
        .sub{margin:0;color:#718096;font-size:14px;max-width:650px;line-height:1.6}
        .overview{display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid #dfe9ed;background:rgba(255,255,255,.82);border-radius:14px;color:#64748b;font-size:12px;font-weight:800;white-space:nowrap}
        .overview b{color:#17202b;font-size:16px}
        .create{border:0;border-radius:14px;padding:13px 17px;background:#078b87;color:#fff;font-weight:900;font-size:13px;cursor:pointer;box-shadow:0 12px 26px rgba(7,139,135,.2)}
        .create:hover{transform:translateY(-1px);background:#067874}
        .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
        .card{position:relative;overflow:hidden;min-height:300px;border:1px solid #dfe8ec;border-radius:24px;padding:24px;background:rgba(255,255,255,.92);box-shadow:0 18px 50px rgba(15,23,42,.07);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
        .card:hover{transform:translateY(-3px);box-shadow:0 24px 60px rgba(15,23,42,.11);border-color:#cbdde1}
        .card:before{content:"";position:absolute;right:-50px;top:-70px;width:180px;height:180px;border-radius:50%;background:rgba(20,184,166,.06)}
        .card-head{position:relative;display:flex;justify-content:space-between;gap:16px}
        .identity{display:flex;align-items:center;gap:14px;min-width:0}
        .logo{width:62px;height:62px;flex:0 0 62px;border-radius:18px;display:grid;place-items:center;overflow:hidden;background:linear-gradient(145deg,#e7f8f6,#d9edf0);border:1px solid #d4e5e8;font-size:20px;font-weight:950;color:#087f7b}
        .logo img{width:100%;height:100%;object-fit:cover}
        .name{margin:0;font-size:20px;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .accounts{margin:5px 0 0;color:#81909b;font-size:12px;font-weight:700}
        .status{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:7px 10px;background:#ecfdf5;color:#087f57;font-size:10px;font-weight:900;white-space:nowrap;height:max-content}
        .status.warn{background:#fff8e7;color:#a15c00}
        .dot{width:7px;height:7px;border-radius:50%;background:#18a96b}
        .warn-dot{background:#f59e0b}
        .platforms{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0 20px}
        .platform{padding:7px 10px;border-radius:10px;background:#f4f7f8;color:#5e6b76;font-size:10px;font-weight:850;border:1px solid #e7edef}
        .platform.missing{color:#a15c00;background:#fff9ec;border-color:#f4dfb1}
        .empty-platforms{color:#9aa5ad;font-size:11px;font-weight:700}
        .card-actions{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:auto}
        .open,.quick{min-height:44px;border-radius:12px;font-weight:900;font-size:12px;cursor:pointer}
        .open{border:0;background:#17202b;color:#fff}
        .open:hover{background:#0d141c}
        .quick{padding:0 15px;border:1px solid #d7e4e7;background:#fff;color:#087f7b}
        .quick:hover{background:#f0fbfa}
        .create-card{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border-style:dashed;background:linear-gradient(145deg,rgba(255,255,255,.8),rgba(240,251,250,.75));cursor:pointer}
        .plus{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:#e7f8f6;color:#078b87;font-size:30px;font-weight:300;margin-bottom:14px}
        .create-card h2{margin:0 0 6px;font-size:17px}.create-card p{margin:0;max-width:270px;color:#81909b;font-size:11px;line-height:1.55}
        .loading{display:flex;gap:6px;align-items:center;color:#8a969e;font-size:10px;font-weight:800;margin-top:12px}.loading i{width:6px;height:6px;border-radius:50%;background:#14b8a6;animation:pulse 1s infinite alternate}.loading i:nth-child(2){animation-delay:.2s}.loading i:nth-child(3){animation-delay:.4s}
        @keyframes pulse{to{opacity:.25;transform:translateY(-2px)}}
        @media(max-width:800px){.hub-top{align-items:flex-start;flex-direction:column}.overview{white-space:normal}.grid{grid-template-columns:1fr}.workspace-hub{padding:28px 16px}.card{min-height:280px}}
        @media(max-width:480px){.card-head{flex-direction:column}.status{align-self:flex-start}.card-actions{grid-template-columns:1fr}.quick{min-height:40px}}
      `}</style>
      <div className="hub-shell">
        <div className="hub-top">
          <div>
            <span className="eyebrow"><i/> Social Media Manager</span>
            <h1>Your Workspaces</h1>
            <p className="sub">Manage every business and brand from one clean workspace hub. Open a workspace for its accounts, live metrics and publishing tools.</p>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <div className="overview"><b>{workspaces.length}</b> workspaces <span>•</span> <b>{loading ? '—' : totalConnected}</b> connected channels</div>
            <button className="create" onClick={onCreate}>＋ Create New Workspace</button>
          </div>
        </div>
        <div className="grid">
          {workspaces.map((workspace) => {
            const status = statuses[workspace.id];
            const connected = status?.connected ?? 0;
            const complete = connected >= 3;
            return (
              <article className="card" key={workspace.id}>
                <div className="card-head">
                  <div className="identity">
                    <div className="logo">{workspace.logo_url ? <img src={workspace.logo_url} alt="" /> : workspace.name.slice(0,2).toUpperCase()}</div>
                    <div style={{minWidth:0}}><h2 className="name">{workspace.name}</h2><p className="accounts">{connected} Connected Channels</p></div>
                  </div>
                  <span className={`status ${status?.warning || (!loading && connected < 3) ? 'warn' : ''}`}>
                    <i className={`dot ${status?.warning || connected < 3 ? 'warn-dot' : ''}`}/>
                    {loading ? 'Checking' : complete ? 'Connected' : `${3 - connected} Connection${3 - connected === 1 ? '' : 's'} Needed`}
                  </span>
                </div>
                <div className="platforms">
                  {status?.platforms?.length ? status.platforms.map((platform) => <span className="platform" key={platform}>● {platformLabel[platform] || platform}</span>) : !loading ? <span className="empty-platforms">No channels connected yet</span> : null}
                  {!loading && connected < 3 ? <span className="platform missing">⚠ Setup incomplete</span> : null}
                </div>
                {loading ? <div className="loading"><i/><i/><i/> Checking live connections…</div> : null}
                <div className="card-actions">
                  <button className="open" onClick={() => openWorkspace(workspace.id)}>Open Workspace <span>→</span></button>
                  <button className="quick" onClick={() => { saveWorkspace(workspace.id); onOpen(workspace.id); setTimeout(() => { location.href = `/dashboard/publish?brandId=${encodeURIComponent(workspace.id)}`; }, 0); }}>✎ Quick Post</button>
                </div>
              </article>
            );
          })}
          <button className="card create-card" onClick={onCreate}>
            <span className="plus">＋</span>
            <h2>Create a new workspace</h2>
            <p>Start a new business or brand and connect Facebook, Instagram and Google Business.</p>
          </button>
        </div>
      </div>
    </main>
  );
}
