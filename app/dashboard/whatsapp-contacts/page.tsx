'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import { getSupabase } from '../../../lib/supabase-browser';

type Contact = { id: string; name: string | null; phone: string };

export default function WhatsAppContactsPage() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true); setMessage('');
    try {
      const id = localStorage.getItem('mdsm:selectedWorkspaceId') || '';
      if (!id) { location.href = '/dashboard'; return; }
      setWorkspaceId(id);
      const session = (await getSupabase().auth.getSession()).data.session;
      if (!session) { location.href = '/login'; return; }
      const r = await fetch('/api/whatsapp/contacts', {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store'
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'Unable to load WhatsApp contacts.');
      setContacts(Array.isArray(d.contacts) ? d.contacts : []);
      if (d.message) setMessage(d.message);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to load WhatsApp contacts.');
    } finally { setLoading(false); }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? contacts.filter(c => (c.name || '').toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)) : contacts;
  }, [contacts, query]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selected.includes(c.id));

  function toggle(id: string) {
    setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  }

  function toggleAll() {
    if (allFilteredSelected) setSelected(current => current.filter(id => !filtered.some(c => c.id === id)));
    else setSelected(current => Array.from(new Set([...current, ...filtered.map(c => c.id)])));
  }

  function exportCsv() {
    const rows = contacts.filter(c => selected.includes(c.id));
    if (!rows.length) { setMessage('Select at least one contact to export.'); return; }
    const esc = (value: string) => '"' + value.replaceAll('"', '""') + '"';
    const csv = [['Name', 'Phone Number'].map(esc).join(','), ...rows.map(c => [c.name || '', c.phone].map(esc).join(','))].join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `whatsapp-contacts-${workspaceId.slice(0, 8)}.csv`; a.click(); URL.revokeObjectURL(url);
    setMessage(`${rows.length} contact${rows.length === 1 ? '' : 's'} exported.`);
  }

  return <AppShell title="WhatsApp Contacts"><div className="wa-shell">
    <style jsx>{`
      .wa-shell{min-height:calc(100vh - 72px);background:#f7fafb;padding:28px 30px 48px;color:#17202b}
      .wrap{max-width:1180px;margin:0 auto}.head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:18px}
      .eyebrow{font-size:10px;letter-spacing:.15em;font-weight:950;color:#087f7b}h1{margin:6px 0 5px;font-size:30px;letter-spacing:-.04em}
      .sub{margin:0;color:#71808a;font-size:11px;line-height:1.6}.actions{display:flex;gap:8px;flex-wrap:wrap}
      .btn{border:1px solid #dce6ea;background:#fff;color:#35424c;border-radius:10px;padding:10px 13px;font-size:10px;font-weight:950;cursor:pointer}
      .btn-primary{background:#17202b;color:#fff;border-color:#17202b}.btn:disabled{opacity:.5;cursor:not-allowed}
      .notice{margin-bottom:14px;padding:12px 14px;border:1px solid #dce6ea;background:#fff;border-radius:12px;font-size:10px;color:#53616b}
      .panel{background:#fff;border:1px solid #e0e8eb;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.04)}
      .toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:15px 16px;border-bottom:1px solid #edf1f2}
      .search{width:280px;max-width:100%;padding:10px 12px;border:1px solid #dce6ea;border-radius:10px;font-size:11px;outline:none}
      .count{font-size:10px;color:#71808a;font-weight:850}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:13px 16px;border-bottom:1px solid #edf1f2;font-size:11px}
      th{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#7a8790;background:#fbfcfd}th:first-child,td:first-child{width:44px}
      td.phone{font-variant-numeric:tabular-nums;font-weight:850}.empty{text-align:center;padding:62px 20px;color:#7a8790;font-size:11px}
      .empty strong{display:block;color:#334155;font-size:14px;margin-bottom:5px}.empty p{margin:0 auto 16px;max-width:500px;line-height:1.6}
      @media(max-width:700px){.wa-shell{padding:20px 15px 32px}.head{align-items:flex-start;flex-direction:column}.toolbar{align-items:flex-start;flex-direction:column}.search{width:100%}th,td{padding:11px 10px}}
    `}</style>
    <div className="wrap">
      <div className="head"><div><div className="eyebrow">WHATSAPP • CONTACT EXPORT</div><h1>WhatsApp Contacts</h1><p className="sub">Only contact name and phone number are shown here. Chats, messages and media are not loaded.</p></div>
        <div className="actions"><button className="btn" onClick={() => void load()}>↻ Refresh</button><button className="btn btn-primary" disabled={!selected.length} onClick={exportCsv}>Export CSV{selected.length ? ` (${selected.length})` : ''}</button></div>
      </div>
      {message && <div className="notice">{message}</div>}
      <section className="panel"><div className="toolbar"><input className="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or phone number…" /><div className="count">{selected.length} selected · {filtered.length} shown · {contacts.length} total</div></div>
        {loading ? <div className="empty">Loading contacts…</div> : !contacts.length ? <div className="empty"><strong>No WhatsApp contacts available</strong><p>The workspace has no authorized WhatsApp contact source yet. This screen is ready for the official WhatsApp Business/provider connection.</p><button className="btn btn-primary" onClick={() => location.href='/dashboard/settings#connections'}>Open Connection Settings →</button></div> : !filtered.length ? <div className="empty">No contacts match your search.</div> :
        <table><thead><tr><th><input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label="Select all shown contacts" /></th><th>Name</th><th>Phone Number</th></tr></thead><tbody>{filtered.map(c => <tr key={c.id}><td><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.phone}`} /></td><td>{c.name || '—'}</td><td className="phone">{c.phone}</td></tr>)}</tbody></table>}
      </section>
    </div>
  </div></AppShell>;
}
