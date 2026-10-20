'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { getSupabase } from '../../../../lib/supabase-browser';

type Contact = { id: string; name: string | null; phone: string | null; email: string | null };
type Lead = { id: string; title: string; stage: string; contact_id: string | null; contact?: Contact | null };
type FollowUp = {
  id: string; lead_id: string | null; contact_id: string | null; activity_type: string;
  note: string; status: string; next_follow_up_at: string | null; created_at: string;
  lead?: Lead | null; contact?: Contact | null;
};

const panelStyle = { background: '#fff', border: '1px solid #e0e8eb', borderRadius: 16, padding: 18, boxShadow: '0 8px 25px rgba(15,23,42,.03)' } as const;
const fieldStyle = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#34424c' } as const;
const controlStyle = { width: '100%', boxSizing: 'border-box' as const, padding: '10px 11px', border: '1px solid #dce6ea', borderRadius: 9, background: '#fff', color: '#17202b', fontSize: 12 };
const activityTypes = [['call','Call'],['whatsapp','WhatsApp'],['email','Email'],['meeting','Meeting'],['note','Note'],['other','Other']];

export default function CRMFollowUpsPage() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [entries, setEntries] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ lead_id: '', contact_id: '', activity_type: 'call', note: '', status: 'completed', next_follow_up_at: '' });

  async function load(id = workspaceId) {
    if (!id) return;
    setLoading(true); setError('');
    try {
      const sb = getSupabase();
      const [c, l, h] = await Promise.all([
        sb.from('crm_contacts').select('id,name,phone,email').eq('workspace_id', id).order('created_at', { ascending: false }),
        sb.from('crm_leads').select('id,title,stage,contact_id,contact:crm_contacts(id,name,phone,email)').eq('workspace_id', id).order('created_at', { ascending: false }),
        sb.from('crm_follow_up_history').select('*,lead:crm_leads(id,title,stage),contact:crm_contacts(id,name,phone,email)').eq('workspace_id', id).order('created_at', { ascending: false }).limit(100)
      ]);
      if (c.error) throw c.error;
      if (l.error) throw l.error;
      if (h.error) throw h.error;
      setContacts((c.data || []) as Contact[]);
      setLeads((l.data || []) as Lead[]);
      setEntries((h.data || []) as FollowUp[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load follow-up history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let id = '';
    try { id = localStorage.getItem('mdsm:selectedWorkspaceId') || ''; } catch {}
    if (!id) { location.href = '/dashboard'; return; }
    setWorkspaceId(id);
    void load(id);
    const onWorkspace = (event: Event) => {
      const next = (event as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId || '';
      if (next && next !== id) {
        setWorkspaceId(next);
        setForm({ lead_id: '', contact_id: '', activity_type: 'call', note: '', status: 'completed', next_follow_up_at: '' });
        void load(next);
      }
    };
    window.addEventListener('mdsm:workspace-changed', onWorkspace);
    return () => window.removeEventListener('mdsm:workspace-changed', onWorkspace);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(x => [
      x.note, x.activity_type, x.status, x.lead?.title, x.lead?.stage,
      x.contact?.name, x.contact?.phone, x.contact?.email
    ].some(v => String(v || '').toLowerCase().includes(q)));
  }, [entries, query]);

  function setField(key: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function save() {
    setError(''); setNotice('');
    if (!form.lead_id && !form.contact_id) { setError('Select a lead or a contact.'); return; }
    if (!form.note.trim()) { setError('Add the interaction notes.'); return; }
    setSaving(true);
    try {
      const sb = getSupabase();
      const user = (await sb.auth.getUser()).data.user;
      const payload = {
        workspace_id: workspaceId,
        lead_id: form.lead_id || null,
        contact_id: form.contact_id || null,
        activity_type: form.activity_type,
        note: form.note.trim(),
        status: form.status,
        next_follow_up_at: form.next_follow_up_at ? new Date(form.next_follow_up_at).toISOString() : null,
        created_by: user?.id || null
      };
      const { error: insertError } = await sb.from('crm_follow_up_history').insert(payload);
      if (insertError) throw insertError;
      setForm(prev => ({ ...prev, note: '', next_follow_up_at: '', status: 'completed' }));
      setNotice('Follow-up activity saved.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save follow-up activity.');
    } finally {
      setSaving(false);
    }
  }

  return <AppShell title="CRM Follow-ups">
    <div style={{ minHeight: '100%', padding: 24, background: '#f7fafb', color: '#17202b' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '.14em', color: '#087f7b', fontWeight: 950 }}>CRM • ACTIVITY HISTORY</div>
          <h1 style={{ margin: '6px 0 4px', fontSize: 29 }}>Follow-ups</h1>
          <p style={{ margin: 0, color: '#73818b', fontSize: 12 }}>Record calls, WhatsApp conversations, emails and next follow-up dates against a lead or contact.</p>
        </div>
        <button style={{ ...controlStyle, width: 'auto', cursor: 'pointer', fontWeight: 800 }} onClick={() => void load()}>Refresh</button>
      </header>

      {error && <div role="alert" style={{ ...panelStyle, marginBottom: 12, borderColor: '#f5c8cf', color: '#9f1239' }}>{error} <button onClick={() => setError('')}>Dismiss</button></div>}
      {notice && <div role="status" style={{ ...panelStyle, marginBottom: 12, borderColor: '#bfe7db', color: '#087443' }}>{notice}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,.82fr) minmax(0,1.18fr)', gap: 14, alignItems: 'start' }}>
        <section style={panelStyle}>
          <h2 style={{ margin: '0 0 5px', fontSize: 17 }}>Log an interaction</h2>
          <p style={{ margin: '0 0 14px', color: '#77858e', fontSize: 11, lineHeight: 1.5 }}>Activity history is separate from reminders. Use CRM Tasks for reminders that need to trigger automation.</p>
          <div style={{ display: 'grid', gap: 11 }}>
            <label style={fieldStyle}>Lead (optional)
              <select style={controlStyle} value={form.lead_id} onChange={e => {
                const value = e.target.value;
                const linked = leads.find(l => l.id === value);
                setForm(prev => ({ ...prev, lead_id: value, contact_id: linked?.contact_id || prev.contact_id }));
              }}>
                <option value="">Choose lead…</option>{leads.map(l => <option key={l.id} value={l.id}>{l.title} · {l.stage}</option>)}
              </select>
            </label>
            <label style={fieldStyle}>Contact (optional)
              <select style={controlStyle} value={form.contact_id} onChange={e => setField('contact_id', e.target.value)}>
                <option value="">Choose contact…</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.name || 'Unnamed contact'}{c.phone ? ' · ' + c.phone : ''}</option>)}
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              <label style={fieldStyle}>Activity type
                <select style={controlStyle} value={form.activity_type} onChange={e => setField('activity_type', e.target.value)}>
                  {activityTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label style={fieldStyle}>Status
                <select style={controlStyle} value={form.status} onChange={e => setField('status', e.target.value)}>
                  <option value="completed">Completed</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option>
                </select>
              </label>
            </div>
            <label style={fieldStyle}>Next follow-up date
              <input style={controlStyle} type="datetime-local" value={form.next_follow_up_at} onChange={e => setField('next_follow_up_at', e.target.value)} />
            </label>
            <label style={fieldStyle}>Notes
              <textarea style={{ ...controlStyle, minHeight: 100, resize: 'vertical' }} value={form.note} maxLength={4000} onChange={e => setField('note', e.target.value)} placeholder="What was discussed? What should happen next?" />
            </label>
            <button style={{ ...controlStyle, background: '#17202b', color: '#fff', cursor: 'pointer', fontWeight: 900, opacity: saving || loading ? .6 : 1 }} disabled={saving || loading} onClick={() => void save()}>{saving ? 'Saving…' : 'Save Follow-up'}</button>
          </div>
        </section>

        <section style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div><h2 style={{ margin: '0 0 4px', fontSize: 17 }}>Recent follow-ups</h2><p style={{ margin: 0, color: '#77858e', fontSize: 11 }}>Latest 100 records in this workspace</p></div>
            <input style={{ ...controlStyle, maxWidth: 280 }} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search notes, contact or lead…" />
          </div>
          {loading ? <div style={{ padding: 32, textAlign: 'center', color: '#7b8791', fontSize: 12 }}>Loading history…</div> :
            filtered.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#7b8791', fontSize: 12 }}>No follow-up history found.</div> :
            <div style={{ marginTop: 12 }}>
              {filtered.map(entry => {
                const target = entry.lead?.title || entry.contact?.name || entry.contact?.phone || 'CRM record';
                return <article key={entry.id} style={{ padding: '13px 0', borderTop: '1px solid #edf1f2' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <div><strong style={{ fontSize: 12 }}>{target}</strong><div style={{ marginTop: 4, fontSize: 9, color: '#839099' }}>{entry.activity_type.toUpperCase()} · {new Date(entry.created_at).toLocaleString()}</div></div>
                    <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'capitalize', color: entry.status === 'completed' ? '#087443' : entry.status === 'pending' ? '#8b5e11' : '#66737d' }}>{entry.status}</span>
                  </div>
                  <p style={{ fontSize: 11, lineHeight: 1.5, margin: '8px 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{entry.note}</p>
                  <div style={{ fontSize: 9, color: '#839099' }}>Next follow-up: {entry.next_follow_up_at ? new Date(entry.next_follow_up_at).toLocaleString() : 'Not set'}{entry.contact?.phone ? ' · ' + entry.contact.phone : ''}</div>
                </article>;
              })}
            </div>}
        </section>
      </div>
      <style jsx>{'@media(max-width:950px){div[style*="minmax(280px"]{grid-template-columns:1fr!important}}'}</style>
    </div>
  </AppShell>;
}
