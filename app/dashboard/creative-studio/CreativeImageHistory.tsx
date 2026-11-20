'use client';
import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';

type HistoryItem = { id: string; url: string; prompt: string; format: string; source_type: string; created_at: string };

export default function CreativeImageHistory({ workspaceId, onUse }: { workspaceId: string; onUse: (url: string) => void }) {
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
  }, [workspaceId]);
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
  return <section className="panel" style={{ marginTop: 18 }}>
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
