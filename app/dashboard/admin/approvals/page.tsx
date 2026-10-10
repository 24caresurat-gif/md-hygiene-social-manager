'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { getSupabase } from '../../../../lib/supabase-browser';

type Decision = 'approved' | 'rejected' | 'changes_requested';
type LegacyDraft = {
  kind: 'legacy';
  id: string;
  brand_id: string;
  caption: string;
  media_url: string | null;
  account_ids: string[];
  approval_status: string;
  submitted_at: string | null;
  reviewer_note: string | null;
  updated_at: string;
  publish_error?: string | null;
  publish_status?: string | null;
  brands?: { id: string; name: string } | null;
};
type ComposerApproval = {
  kind: 'composer';
  id: string;
  draft_id: string;
  workplace_id: string;
  submitted_by: string;
  status: string;
  reviewer_note: string | null;
  submitted_at: string;
  publish_status: string;
  publish_error: string | null;
  workspace_name: string;
  draft: {
    id: string;
    user_id: string;
    brand_id: string;
    workspace_id: string | null;
    title: string | null;
    message: string | null;
    media_urls: string[];
    platforms: string[];
    account_ids: string[] | null;
    approval_status: string;
  };
};
type QueueItem = LegacyDraft | ComposerApproval;

function queueKey(item: QueueItem) {
  return `${item.kind}:${item.id}`;
}
function isPending(item: QueueItem) {
  return item.kind === 'legacy' ? item.approval_status === 'pending' : item.status === 'pending';
}
function caption(item: QueueItem) {
  return item.kind === 'legacy' ? item.caption : item.draft.message || '';
}
function mediaUrl(item: QueueItem) {
  return item.kind === 'legacy' ? item.media_url : item.draft.media_urls?.[0] || null;
}
function accountCount(item: QueueItem) {
  return item.kind === 'legacy' ? item.account_ids?.length || 0 : item.draft.account_ids?.length || 0;
}
function workspaceName(item: QueueItem) {
  return item.kind === 'legacy' ? item.brands?.name || 'Workspace' : item.workspace_name || 'Workspace';
}
function submittedAt(item: QueueItem) {
  return item.kind === 'legacy' ? item.submitted_at : item.submitted_at;
}
function displayStatus(item: QueueItem) {
  return item.kind === 'legacy' ? item.approval_status : item.status;
}
function publishError(item: QueueItem) {
  return item.kind === 'legacy' ? item.publish_error : item.publish_error;
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function token() {
    const session = (await getSupabase().auth.getSession()).data.session;
    if (!session) throw new Error('Login required.');
    return session.access_token;
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const activeWorkspace = localStorage.getItem('mdsm:selectedWorkspaceId') || '';
      if (!activeWorkspace) {
        setItems([]);
        setError('Select a workspace in the dashboard before opening Approvals.');
        return;
      }
      const access = await token();
      const query = `workspace_id=${encodeURIComponent(activeWorkspace)}`;
      const [legacyResponse, composerResponse] = await Promise.all([
        fetch(`/api/admin/draft-approvals?${query}`, {
          headers: { Authorization: `Bearer ${access}` },
          cache: 'no-store',
        }),
        fetch(`/api/admin/approvals?${query}`, {
          headers: { Authorization: `Bearer ${access}` },
          cache: 'no-store',
        }),
      ]);
      const [legacyData, composerData] = await Promise.all([
        legacyResponse.json().catch(() => ({})),
        composerResponse.json().catch(() => ({})),
      ]);
      if (!legacyResponse.ok) throw new Error(legacyData.error || 'Unable to load draft approvals.');
      if (!composerResponse.ok) throw new Error(composerData.error || 'Unable to load Create Post approvals.');

      const legacy = (legacyData.drafts || []).map((item: Omit<LegacyDraft, 'kind'>) => ({ ...item, kind: 'legacy' as const }));
      const composer = (composerData.approvals || []).map((item: Omit<ComposerApproval, 'kind'>) => ({ ...item, kind: 'composer' as const }));
      setItems([...legacy, ...composer].sort((a, b) => {
        const left = new Date(submittedAt(a) || 0).getTime();
        const right = new Date(submittedAt(b) || 0).getTime();
        return right - left;
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load approvals.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function decide(item: QueueItem, decision: Decision, alsoPublish = false) {
    const key = queueKey(item);
    setBusy(key);
    setError('');
    try {
      const access = await token();
      const reviewUrl = item.kind === 'legacy' ? '/api/admin/draft-approvals' : '/api/admin/approvals';
      const reviewResponse = await fetch(reviewUrl, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, decision, note: notes[key] || '' }),
      });
      const reviewData = await reviewResponse.json().catch(() => ({}));
      if (!reviewResponse.ok) throw new Error(reviewData.error || 'Unable to save the review decision.');

      if (alsoPublish && decision === 'approved') {
        const publishResponse = item.kind === 'legacy'
          ? await fetch('/api/admin/draft-approvals/publish', {
              method: 'POST',
              headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: item.id }),
            })
          : await fetch(`/api/admin/approvals/${encodeURIComponent(item.id)}/publish`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${access}` },
            });
        const publishData = await publishResponse.json().catch(() => ({}));
        if (!publishResponse.ok) throw new Error(publishData.error || 'Approved, but publishing failed. The approved post remains available to retry.');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to review this post.');
      await load();
    } finally {
      setBusy('');
    }
  }

  async function publishApproved(item: QueueItem) {
    const key = queueKey(item);
    setBusy(key);
    setError('');
    try {
      const access = await token();
      const response = item.kind === 'legacy'
        ? await fetch('/api/admin/draft-approvals/publish', {
            method: 'POST',
            headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: item.id }),
          })
        : await fetch(`/api/admin/approvals/${encodeURIComponent(item.id)}/publish`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${access}` },
          });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Publishing failed. The approved post is still available to retry.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to publish approved post.');
      await load();
    } finally {
      setBusy('');
    }
  }

  return (
    <AppShell title="Approvals">
      <style jsx>{`
        .page{max-width:1120px;margin:0 auto;padding:4px 0 30px}
        .head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:22px}
        .eyebrow{font-size:10px;font-weight:900;letter-spacing:.16em;color:#078b87}
        h1{font-size:34px;letter-spacing:-.04em;margin:5px 0 7px}
        .subtitle{font-size:12px;color:#78858e;margin:0}
        .panel{background:#fff;border:1px solid #e2e9ed;border-radius:18px;padding:18px;margin-top:14px}
        .card-head{display:grid;grid-template-columns:150px minmax(0,1fr);gap:18px;align-items:start}
        .thumb{width:150px;aspect-ratio:4/5;border-radius:12px;overflow:hidden;background:#f1f6f7;border:1px solid #e2e9ed;display:grid;place-items:center;color:#839099;font-size:11px;text-align:center}
        .thumb img{width:100%;height:100%;object-fit:cover}
        .meta{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;font-size:10px;color:#6c7881}
        .pill{border:1px solid #dce6e8;background:#f5f9fa;padding:5px 8px;border-radius:999px;font-weight:800}
        .pending{background:#fff7e6;color:#8a5b00;border-color:#f3dfaf}
        .approved{background:#eef8f0;color:#267347;border-color:#cde9d4}
        .caption{white-space:pre-wrap;line-height:1.6;font-size:13px;overflow-wrap:anywhere}
        .note{width:100%;margin-top:14px;border:1px solid #dce4e8;border-radius:10px;padding:11px;font:inherit;font-size:12px}
        .actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}
        button{border:1px solid #dce5e8;border-radius:9px;background:#fff;padding:9px 12px;font-weight:800;font-size:11px;cursor:pointer}
        button:disabled{opacity:.5;cursor:not-allowed}
        .primary{background:#078b87;border-color:#078b87;color:#fff}
        .danger{color:#b42318}
        .alert{padding:12px 14px;border-radius:10px;background:#fff0f0;color:#b42318;font-size:12px;margin-bottom:14px}
        .empty{text-align:center;padding:50px 18px;color:#6f7c85;border:1px dashed #d9e4e8;border-radius:16px;background:#fbfdfd}
        .error-text{font-size:11px;color:#b42318;margin-top:8px;white-space:pre-wrap}
        @media(max-width:650px){.head{align-items:flex-start;flex-direction:column}.card-head{grid-template-columns:1fr}.thumb{width:100%;max-width:280px}.actions button{flex:1}}
      `}</style>
      <div className="page">
        <header className="head">
          <div>
            <span className="eyebrow">WORKSPACE CONTENT CONTROL</span>
            <h1>Approval Center</h1>
            <p className="subtitle">Review submissions from Create Post and Drafts for the selected workspace.</p>
          </div>
          <button onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh'}</button>
        </header>
        {error && <div className="alert" role="alert">{error}</div>}
        {loading ? <div className="empty">Loading workspace approvals…</div> : items.length ? items.map(item => {
          const key = queueKey(item);
          const pending = isPending(item);
          const media = mediaUrl(item);
          const status = displayStatus(item);
          return (
            <article className="panel" key={key}>
              <div className="card-head">
                <div className="thumb">{media ? <img src={media} alt="Submitted creative" /> : 'No creative attached'}</div>
                <div>
                  <span className="eyebrow">{item.kind === 'legacy' ? 'DRAFTS WORKFLOW' : 'CREATE POST WORKFLOW'}</span>
                  <h2 style={{fontSize:19,margin:'5px 0'}}>{workspaceName(item)}</h2>
                  <div className="meta">
                    <span className={`pill ${pending ? 'pending' : 'approved'}`}>{status.replaceAll('_',' ')}</span>
                    <span className="pill">{accountCount(item)} account(s)</span>
                    {submittedAt(item) && <span className="pill">Submitted {new Date(submittedAt(item) as string).toLocaleString()}</span>}
                  </div>
                  <p className="caption">{caption(item) || 'No caption provided.'}</p>
                  {publishError(item) && <p className="error-text">Last publish error: {publishError(item)}</p>}
                  {item.kind === 'composer' && item.draft.platforms?.length > 0 && <p className="subtitle">Platforms: {item.draft.platforms.join(', ')}</p>}
                </div>
              </div>
              {pending && <textarea className="note" rows={3} value={notes[key] || ''} onChange={e => setNotes(v => ({...v,[key]:e.target.value}))} placeholder="Reviewer note / reason for rejection / requested changes" />}
              <div className="actions">
                {!pending ? (
                  <button className="primary" disabled={busy===key} onClick={() => void publishApproved(item)}>{busy===key ? 'Publishing…' : '↻ Publish Approved'}</button>
                ) : (
                  <>
                    <button className="primary" disabled={busy===key} onClick={() => void decide(item,'approved',true)}>{busy===key ? 'Working…' : '✓ Approve & Publish'}</button>
                    <button disabled={busy===key} onClick={() => void decide(item,'approved')}>✓ Approve Only</button>
                    <button disabled={busy===key} onClick={() => void decide(item,'changes_requested')}>✎ Request Changes</button>
                    <button className="danger" disabled={busy===key} onClick={() => void decide(item,'rejected')}>✕ Reject</button>
                  </>
                )}
              </div>
            </article>
          );
        }) : <div className="empty"><strong>No posts waiting for review or publishing.</strong><p className="subtitle" style={{marginTop:8}}>Submissions for this workspace will appear here.</p></div>}
      </div>
    </AppShell>
  );
}
