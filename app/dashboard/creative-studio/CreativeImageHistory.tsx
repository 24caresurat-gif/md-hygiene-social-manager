'use client';
import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';

type HistoryItem = { id: string; url: string; prompt: string; format: string; source_type: string; created_at: string };

export default function CreativeImageHistory({ workspaceId, refreshKey, onUse }: { workspaceId: string; refreshKey: number; onUse: (url: string) => void }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!workspaceId) return;
    const session = (await getSupabase().auth.getSession()).data.session;
    if (!session?.access_token) return;
    const response = await fetch(`/api/creative/history?workspaceId=${encodeURIComponent(workspaceId)}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load image history.');
    setItems(data.items || []);
  }, [workspaceId, refreshKey]);
  useEffect(() => { load().catch(error => setMessage(error instanceof Error ? error.message : 'Could not load image history.')); }, [load]);
  async function remove(id: string) {
    setBusy(true); setMessage('');
    try {
      const session = (await getSupabase().auth.getSession()).data.session;
      if (!session?.access_token) throw new Error('Your session has expired.');
      const response = await fetch('/api/creative/history', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ workspaceId, id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not delete image.');
      setItems(current => current.filter(item => item.id !== id));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not delete image.'); }
    finally { setBusy(false); }
  }
  return <section className="panel" style={{ marginTop: 18 }}><style jsx>{`.panel{background:#fff;border:1px solid #e2e9ed;border-radius:20px;padding:20px;box-shadow:0 12px 35px rgba(15,23,42,.05)}.mini-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.mini-head h2{margin:0;font-size:16px}.variants{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}.variant{border-radius:13px;background:#f6f9fa;border:1px solid #e2e9ed;overflow:hidden}.variant img{width:100%;aspect-ratio:1;object-fit:cover;display:block}.variant>div{padding:8px}.actions{display:flex;gap:8px;flex-wrap:wrap}.soft{background:#eef8f7;color:#087f7b;border:0;border-radius:11px;padding:9px 12px;font-size:10px;font-weight:900;cursor:pointer}.soft:disabled{opacity:.5}.status{padding:11px;border-radius:11px;background:#fff8e8;color:#8a5b00;font-size:10px;line-height:1.5;margin-bottom:14px}`}</style>
    <div className="mini-head"><h2>AI Image History</h2><button className="soft" onClick={() => load().catch(error => setMessage(error.message))}>Refresh</button></div>
    {message && <p className="status">{message}</p>}
    {!items.length ? <p style={{ color: '#718096', fontSize: 12 }}>Generated and edited images will appear here for this workspace.</p> :
      <div className="variants">{items.map(item => <article className="variant" key={item.id}>
        <img src={item.url} alt="Saved AI creative" />
        <div><b>{item.format} · {item.source_type === 'edited' ? 'Edited' : 'Generated'}</b><p style={{ color: '#718096', margin: '5px 0', fontSize: 10 }}>{new Date(item.created_at).toLocaleString()}</p>
          <div className="actions"><button className="soft" onClick={() => onUse(item.url)}>Use in Studio</button><button className="soft" disabled={busy} onClick={() => remove(item.id)}>Delete</button></div>
        </div>
      </article>)}</div>}
  </section>;
}
