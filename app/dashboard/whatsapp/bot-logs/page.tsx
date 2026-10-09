'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { getSupabase } from '../../../../lib/supabase-browser';

type BotEvent = {
  id: string;
  conversation_id: string | null;
  flow_id: string | null;
  session_id: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

const eventLabels: Record<string, string> = {
  inbound: 'Inbound',
  response: 'Bot response',
  button_reply: 'Button reply',
  product_suggestions: 'Product suggestions',
  handoff: 'Handoff',
  template_required: 'Template required',
  after_hours_template_sent: '24×7 template sent',
  after_hours_template_error: '24×7 template error',
  crm_sync_error: 'CRM sync error',
  error: 'Bot error',
};

function formatEvent(type: string) {
  return eventLabels[type] || type.replace(/_/g, ' ');
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function previewPayload(payload: Record<string, unknown> | null) {
  if (!payload) return 'No event payload';
  const keys = Object.keys(payload);
  const preferred = ['message', 'text', 'template', 'step', 'status', 'error'];
  for (const key of preferred) {
    const value = payload[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' || typeof value === 'boolean') return key + ': ' + String(value);
  }
  if (!keys.length) return 'No event payload';
  return keys.slice(0, 4).map(key => key + ': ' + String(payload[key])).join(' · ');
}

export default function WhatsAppBotLogsPage() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [events, setEvents] = useState<BotEvent[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const saved = localStorage.getItem('mdsm:selectedWorkspaceId') || '';
    if (!saved) {
      location.href = '/dashboard';
      return;
    }
    setWorkspaceId(saved);
    setBusy(true);
    setMessage('');
    try {
      const { data, error } = await getSupabase()
        .from('whatsapp_bot_events')
        .select('id,conversation_id,flow_id,session_id,event_type,payload,created_at')
        .eq('workspace_id', saved)
        .order('created_at', { ascending: false })
        .limit(250);
      if (error) throw error;
      setEvents((data || []) as BotEvent[]);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to load bot event logs.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onWorkspace = (event: Event) => {
      const next = (event as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId || '';
      if (next && next !== workspaceId) void load();
    };
    window.addEventListener('mdsm:workspace-changed', onWorkspace);
    return () => window.removeEventListener('mdsm:workspace-changed', onWorkspace);
  }, [load, workspaceId]);

  const types = useMemo(() => {
    const unique = Array.from(new Set(events.map(event => event.event_type)));
    return unique.sort();
  }, [events]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return events.filter(event => {
      if (filter !== 'all' && event.event_type !== filter) return false;
      if (!needle) return true;
      return [
        event.event_type,
        event.conversation_id || '',
        previewPayload(event.payload),
      ].join(' ').toLowerCase().includes(needle);
    });
  }, [events, filter, search]);

  const errorCount = events.filter(event => ['error', 'crm_sync_error', 'after_hours_template_error'].includes(event.event_type)).length;
  const afterHoursCount = events.filter(event => event.event_type === 'after_hours_template_sent').length;
  const handoffCount = events.filter(event => event.event_type === 'handoff').length;

  return (
    <AppShell title="WhatsApp Bot Logs">
      <div className="page">
        <style jsx>{`
          .page{min-height:100vh;background:#f7fafb;padding:28px 32px 48px;color:#17202b}
          .inner{max-width:1180px;margin:0 auto}.top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:20px}
          .eyebrow{font-size:10px;letter-spacing:.14em;color:#078b87;font-weight:950;text-transform:uppercase}
          h1{font-size:31px;letter-spacing:-.04em;margin:6px 0 7px}.muted{color:#74808a;font-size:11px;line-height:1.6}
          .actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.btn{border:1px solid #dce6ea;background:#fff;color:#35424c;border-radius:10px;padding:10px 12px;font-size:10px;font-weight:900;cursor:pointer}.btn-primary{background:#17202b;color:#fff;border-color:#17202b}.btn:disabled{opacity:.5;cursor:wait}
          .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.stat{background:#fff;border:1px solid #e0e8eb;border-radius:16px;padding:16px}.stat span{display:block;color:#7a8790;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}.stat strong{display:block;font-size:25px;margin-top:7px;letter-spacing:-.03em}
          .panel{background:#fff;border:1px solid #e0e8eb;border-radius:18px;padding:18px;box-shadow:0 10px 30px rgba(15,23,42,.04)}
          .filters{display:grid;grid-template-columns:220px 1fr auto;gap:10px;margin-bottom:14px}.input,.select{width:100%;padding:11px 12px;border:1px solid #dce6ea;border-radius:10px;background:#fff;font-size:11px;outline:none}
          .table{display:grid;gap:8px}.row{display:grid;grid-template-columns:180px 1fr 160px;gap:16px;align-items:center;padding:12px 13px;border:1px solid #e8edef;border-radius:12px}.type{font-size:10px;font-weight:950;text-transform:uppercase;color:#2f3b44}.payload{font-size:11px;color:#56636c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.time{text-align:right;color:#8a959d;font-size:10px}
          .ids{margin-top:4px;color:#8a959d;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.empty{padding:34px;text-align:center;color:#78858e;font-size:11px}
          .notice{margin-bottom:14px;padding:11px 12px;border:1px solid #efd0ce;background:#fff6f5;color:#a13b34;border-radius:10px;font-size:11px;font-weight:800}
          @media(max-width:900px){.stats{grid-template-columns:repeat(2,1fr)}.filters{grid-template-columns:1fr 1fr}.filters .btn{width:100%}.row{grid-template-columns:1fr}.time{text-align:left}}
          @media(max-width:620px){.page{padding:20px 15px 36px}.top{flex-direction:column}.stats{grid-template-columns:1fr 1fr}.filters{grid-template-columns:1fr}.row{gap:7px}}
        `}</style>

        <div className="inner">
          <div className="top">
            <div>
              <span className="eyebrow">WHATSAPP AUTOMATION</span>
              <h1>Bot Event Logs</h1>
              <p className="muted">Workspace-scoped execution history for the bot, CRM sync, handoffs and 24×7 fallback templates.</p>
            </div>
            <div className="actions">
              <button className="btn" onClick={() => location.href = '/dashboard/whatsapp/bot'}>← Bot Builder</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void load()}>{busy ? 'Refreshing…' : 'Refresh Logs'}</button>
            </div>
          </div>

          <div className="stats">
            <div className="stat"><span>Total events</span><strong>{events.length}</strong></div>
            <div className="stat"><span>24×7 templates sent</span><strong>{afterHoursCount}</strong></div>
            <div className="stat"><span>Handoffs</span><strong>{handoffCount}</strong></div>
            <div className="stat"><span>Errors</span><strong>{errorCount}</strong></div>
          </div>

          <section className="panel">
            {message && <div className="notice">{message}</div>}
            <div className="filters">
              <select className="select" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter event type">
                <option value="all">All event types</option>
                {types.map(type => <option key={type} value={type}>{formatEvent(type)}</option>)}
              </select>
              <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search event type, conversation or payload…" />
              <button className="btn" onClick={() => { setFilter('all'); setSearch(''); }}>Clear Filters</button>
            </div>

            <div className="table">
              {busy && events.length === 0 ? <div className="empty">Loading bot events…</div> : filtered.length === 0 ? <div className="empty">No bot events match these filters.</div> : filtered.map(event => (
                <article className="row" key={event.id}>
                  <div>
                    <div className="type">{formatEvent(event.event_type)}</div>
                    <div className="ids">{event.conversation_id ? 'Conversation: ' + event.conversation_id.slice(0, 12) + '…' : 'No conversation'}</div>
                  </div>
                  <div>
                    <div className="payload" title={previewPayload(event.payload)}>{previewPayload(event.payload)}</div>
                    <div className="ids">{event.flow_id ? 'Flow ' + event.flow_id.slice(0, 10) + '…' : ''}{event.session_id ? ' · Session ' + event.session_id.slice(0, 10) + '…' : ''}</div>
                  </div>
                  <div className="time">{formatTime(event.created_at)}</div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
