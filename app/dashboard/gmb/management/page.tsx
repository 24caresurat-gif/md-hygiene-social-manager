'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { getSupabase } from '../../../../lib/supabase-browser';

type Connection = {
  id: string;
  social_account_id: string;
  account_name: string | null;
  token_expires_at: string | null;
  token_status: string | null;
  token_error: string | null;
  updated_at: string;
};
type Location = {
  id: string;
  business_name: string;
  location_id: string;
  account_id: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  review_url: string | null;
  status: string;
  updated_at: string;
  connection: Connection | null;
};

const css = `
.management{display:grid;gap:16px}
.hero{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;flex-wrap:wrap}
.hero h1{margin:5px 0}.hero p{margin:5px 0 0;max-width:780px}
.actions{display:flex;gap:8px;flex-wrap:wrap}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.stat{padding:15px}.stat span{display:block;font-size:9px;color:#667085;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.stat strong{display:block;font-size:24px;margin-top:6px}.stat small{display:block;color:#8a95a3;font-size:9px;margin-top:3px}
.location-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;padding:0 18px 18px}
.location{padding:17px}.top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.top h2{margin:0 0 4px;font-size:15px}.sub{color:#667085;font-size:10px}
.badge{padding:6px 9px;border-radius:999px;background:#edf8f1;color:#14804a;font-size:9px;font-weight:900;white-space:nowrap}
.fields{display:grid;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid #edf0f3}.field{display:grid;grid-template-columns:105px 1fr;gap:10px;font-size:10px}.field b{color:#667085}.value{color:#27343d;overflow-wrap:anywhere}.value a{color:#087f7b;font-weight:800;text-decoration:none}
.connection{margin-top:12px;padding:11px;background:#f8fafb;border:1px solid #e4ebee;border-radius:10px;font-size:9px;color:#667085}
.connection strong{color:#34424b}.connection.error{background:#fff7f6;border-color:#f2d0cb;color:#b42318}
.note{padding:14px 16px;border:1px dashed #cddadd;border-radius:12px;background:#fbfdfd;color:#5f6d77;font-size:10px;line-height:1.55}
.empty{padding:44px 20px;text-align:center;color:#667085;font-size:11px}
@media(max-width:900px){.summary,.location-grid{grid-template-columns:1fr 1fr}}
@media(max-width:620px){.summary,.location-grid{grid-template-columns:1fr}.hero{align-items:flex-start;flex-direction:column}.field{grid-template-columns:1fr}}
`;

const fmt = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function BusinessManagementPage() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(id: string) {
    setLoading(true); setError('');
    try {
      const session = (await getSupabase().auth.getSession()).data.session;
      if (!session) { location.href = '/login'; return; }
      const response = await fetch('/api/google/business/management?workspaceId=' + encodeURIComponent(id), {
        headers: { Authorization: 'Bearer ' + session.access_token },
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Unable to load Business Profile management.');
      setLocations((data.locations || []) as Location[]);
      setConnections((data.connections || []) as Connection[]);
      setCanManage(Boolean(data?.access?.canManage));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load Business Profile management.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let current = '';
    try { current = localStorage.getItem('mdsm:selectedWorkspaceId') || ''; } catch {}
    setWorkspaceId(current);
    const onWorkspace = (event: Event) => {
      const next = (event as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId || '';
      if (next && next !== current) { current = next; setWorkspaceId(next); void load(next); }
    };
    window.addEventListener('mdsm:workspace-changed', onWorkspace);
    if (current) void load(current); else setLoading(false);
    return () => window.removeEventListener('mdsm:workspace-changed', onWorkspace);
  }, []);

  const tokenErrors = connections.filter(item => item.token_status && item.token_status !== 'active' || item.token_error);
  const activeConnections = connections.filter(item => String(item.token_status || '').toLowerCase() === 'active').length;

  return (
    <AppShell title='Google Business & Reviews'>
      <style>{css}</style>
      <div className='management'>
        <div className='hero'>
          <div className='page-head'>
            <div className='eyebrow'>BUSINESS PROFILE MANAGEMENT</div>
            <h1>Business Profile</h1>
            <p>Manage workspace-scoped Google Business Profile details and connection state. External Google sign-in remains centralized in Settings.</p>
          </div>
          <div className='actions'>
            <button className='btn' onClick={() => location.href='/dashboard/gmb'}>← Google Business</button>
            <button className='btn btn-primary' onClick={() => location.href='/dashboard/settings#connections'}>Connection Settings</button>
          </div>
        </div>

        {error && <div className='alert alert-error'>{error}</div>}

        <div className='summary'>
          <article className='panel stat'><span>Locations</span><strong>{loading ? '—' : locations.length}</strong><small>Imported for this workspace</small></article>
          <article className='panel stat'><span>Connections</span><strong>{loading ? '—' : connections.length}</strong><small>Stored connection records</small></article>
          <article className='panel stat'><span>Active Tokens</span><strong>{loading ? '—' : activeConnections}</strong><small>Current connection state</small></article>
          <article className='panel stat'><span>Token Alerts</span><strong>{loading ? '—' : tokenErrors.length}</strong><small>Needs connection review</small></article>
        </div>

        <section className='panel'>
          <div className='panel-head'>
            <div><div className='eyebrow'>LOCATIONS</div><h2>Workspace Business Profiles</h2><p>Each location stays attached to the selected workspace.</p></div>
          </div>
          {loading ? <div className='empty'>Loading Business Profiles…</div> : !locations.length ? <div className='empty'>No Google locations imported yet. Use Connection Settings after Google is ready, then sync this workspace.</div> : (
            <div className='location-grid'>
              {locations.map(item => (
                <article className='panel location' key={item.id}>
                  <div className='top'><div><h2>{item.business_name}</h2><div className='sub'>{item.category || 'Business Profile location'}</div></div><span className='badge'>{item.status || 'connected'}</span></div>
                  <div className='fields'>
                    <div className='field'><b>Address</b><span className='value'>{item.address || 'Not provided'}</span></div>
                    <div className='field'><b>Phone</b><span className='value'>{item.phone || 'Not provided'}</span></div>
                    <div className='field'><b>Website</b><span className='value'>{item.website ? <a href={item.website} target='_blank' rel='noreferrer'>{item.website}</a> : 'Not provided'}</span></div>
                    <div className='field'><b>Review link</b><span className='value'>{item.review_url ? <a href={item.review_url} target='_blank' rel='noreferrer'>Open public Google review link →</a> : 'Not available'}</span></div>
                    <div className='field'><b>Location ID</b><span className='value'>{item.location_id}</span></div>
                    <div className='field'><b>Last update</b><span className='value'>{fmt(item.updated_at)}</span></div>
                  </div>
                  {item.connection && <div className={'connection' + (item.connection.token_error ? ' error' : '')}><strong>{item.connection.account_name || 'Google account'}</strong> · Token {item.connection.token_status || 'unknown'}{item.connection.token_error ? ' · ' + item.connection.token_error : ''}</div>}
                </article>
              ))}
            </div>
          )}
        </section>

        <div className='note'>
          <strong>Connection model:</strong> Google login and token setup stay in Settings. This management screen does not create fake locations or fake reviews; it only displays data that exists in the selected workspace.
          {canManage ? ' Managers can use the sync/reply tools where available.' : ' Your current role can view this workspace data.'}
        </div>
      </div>
    </AppShell>
  );
}
