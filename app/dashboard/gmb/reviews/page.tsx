'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { getSupabase } from '../../../../lib/supabase-browser';

type Profile = { id: string; business_name: string; location_id: string };
type Suggestion = { id: string; content: string; model: string | null; created_at: string };
type Review = {
  id: string;
  profile_id: string;
  reviewer_name: string | null;
  rating: number | null;
  comment: string | null;
  review_time: string | null;
  reply_text: string | null;
  replied_at: string | null;
  reply_status: string;
  business_name: string | null;
  suggestion: Suggestion | null;
};
type Metrics = {
  total: number;
  replied: number;
  needsReply: number;
  responseRate: number;
  averageRating: number | null;
  fiveStar: number;
  fourStar: number;
  threeStar: number;
  twoStar: number;
  oneStar: number;
};

const css = `
.reviews-page{display:grid;gap:16px}
.hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;flex-wrap:wrap}
.hero h1{margin:5px 0 0}
.hero p{margin:5px 0 0;max-width:760px}
.toolbar{display:grid;grid-template-columns:minmax(180px,1.6fr) 150px 170px 180px auto;gap:10px;align-items:end}
.field{display:grid;gap:5px}
.field span{font-size:9px;font-weight:900;color:#667085;text-transform:uppercase;letter-spacing:.08em}
.input,.select{width:100%;border:1px solid #dbe4e8;border-radius:10px;background:#fff;padding:10px 11px;font-size:11px}
.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.metric{padding:15px}
.metric span{display:block;font-size:9px;font-weight:900;color:#667085;text-transform:uppercase;letter-spacing:.08em}
.metric strong{display:block;font-size:24px;margin-top:6px}
.metric small{display:block;font-size:9px;color:#8a95a3;margin-top:3px}
.review-list{overflow:hidden}
.review{padding:18px;border-top:1px solid #edf0f3}
.review:first-child{border-top:0}
.top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
.identity strong{font-size:12px}
.identity small{display:block;color:#8a95a3;font-size:9px;margin-top:4px}
.status{padding:6px 9px;border-radius:999px;font-size:9px;font-weight:900;white-space:nowrap}
.status.pending{background:#fff7e8;color:#b54708}
.status.replied{background:#edf8f1;color:#14804a}
.stars{font-size:12px;font-weight:900;margin-top:10px}
.comment{margin-top:8px;font-size:11px;line-height:1.6;color:#475467;white-space:pre-wrap}
.meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}
.pill{padding:5px 8px;border-radius:999px;background:#f4f6f7;font-size:9px;font-weight:800;color:#667085}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.replybox{margin-top:10px;padding:12px;border:1px solid #e5eaee;background:#f8fafb;border-radius:11px}
.replybox textarea{width:100%;min-height:100px;border:1px solid #dbe4e8;border-radius:9px;padding:10px;resize:vertical;font:inherit}
.suggestion{margin-top:10px;padding:11px;background:#edf8f7;border-radius:10px;color:#245f5c;font-size:10px;line-height:1.55;white-space:pre-wrap}
.split{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.breakdown{display:grid;gap:6px}
.barrow{display:grid;grid-template-columns:38px 1fr 32px;gap:8px;align-items:center;font-size:9px}
.bar{height:7px;background:#edf0f3;border-radius:99px;overflow:hidden}
.fill{height:100%;background:#087f7b}
.empty{padding:42px 20px;text-align:center;color:#667085;font-size:11px}
.note{font-size:10px;color:#667085}
@media(max-width:1050px){.toolbar{grid-template-columns:1fr 1fr}.metrics{grid-template-columns:repeat(2,1fr)}}
@media(max-width:680px){.toolbar,.metrics,.split{grid-template-columns:1fr}.top{flex-direction:column}.status{align-self:flex-start}}
`;

const fmt = (value: string | null) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function ReviewManagementPage() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [rating, setRating] = useState('all');
  const [replyStatus, setReplyStatus] = useState('all');
  const [profileId, setProfileId] = useState('all');
  const [applied, setApplied] = useState({ search: '', rating: 'all', replyStatus: 'all', profileId: 'all' });
  const [editing, setEditing] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  async function load(id: string, filters = applied) {
    setLoading(true);
    setError('');
    try {
      const session = (await getSupabase().auth.getSession()).data.session;
      if (!session) {
        location.href = '/login';
        return;
      }
      const params = new URLSearchParams({
        workspaceId: id,
        q: filters.search,
        rating: filters.rating === 'all' ? '0' : filters.rating,
        replyStatus: filters.replyStatus,
        profileId: filters.profileId,
      });
      const response = await fetch('/api/google/business/reviews?' + params.toString(), {
        headers: { Authorization: 'Bearer ' + session.access_token },
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Unable to load reviews.');
      setProfiles((data.profiles || []) as Profile[]);
      setReviews((data.reviews || []) as Review[]);
      setMetrics((data.metrics || null) as Metrics | null);
      setCanManage(Boolean(data?.access?.canManage));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load reviews.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let currentId = '';
    try { currentId = localStorage.getItem('mdsm:selectedWorkspaceId') || ''; } catch {}
    setWorkspaceId(currentId);
    const onWorkspace = (event: Event) => {
      const next = (event as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId || '';
      if (next && next !== currentId) {
        currentId = next;
        setWorkspaceId(next);
        setApplied({ search: '', rating: 'all', replyStatus: 'all', profileId: 'all' });
        setSearch(''); setRating('all'); setReplyStatus('all'); setProfileId('all');
        void load(next, { search: '', rating: 'all', replyStatus: 'all', profileId: 'all' });
      }
    };
    window.addEventListener('mdsm:workspace-changed', onWorkspace);
    if (currentId) void load(currentId);
    else setLoading(false);
    return () => window.removeEventListener('mdsm:workspace-changed', onWorkspace);
  }, []);

  function applyFilters() {
    const next = { search: search.trim(), rating, replyStatus, profileId };
    setApplied(next);
    if (workspaceId) void load(workspaceId, next);
  }

  async function token() {
    const session = (await getSupabase().auth.getSession()).data.session;
    if (!session) {
      location.href = '/login';
      throw new Error('Your session has expired.');
    }
    return session.access_token;
  }

  async function generate(reviewId: string) {
    setBusy('ai:' + reviewId); setError(''); setMessage('');
    try {
      const t = await token();
      const response = await fetch('/api/google/business/suggestion', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Suggestion generation failed.');
      setReviews(current => current.map(item => item.id === reviewId ? { ...item, suggestion: data.suggestion } : item));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suggestion generation failed.');
    } finally {
      setBusy('');
    }
  }

  async function saveReply(reviewId: string, remove = false) {
    setBusy('reply:' + reviewId); setError(''); setMessage('');
    try {
      const t = await token();
      const response = await fetch('/api/google/business/reply', {
        method: remove ? 'DELETE' : 'POST',
        headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
        body: JSON.stringify(remove ? { reviewId } : { reviewId, reply }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Reply update failed.');
      setEditing(null);
      setReply('');
      setMessage(remove ? 'Reply removed.' : 'Reply published.');
      if (workspaceId) await load(workspaceId, applied);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reply update failed.');
    } finally {
      setBusy('');
    }
  }

  function useSuggestion(item: Review) {
    if (item.suggestion?.content) {
      setEditing(item.id);
      setReply(item.suggestion.content);
    }
  }

  const total = metrics?.total || 0;
  const stars = [5, 4, 3, 2, 1].map(n => ({
    n,
    count: metrics ? [metrics.fiveStar, metrics.fourStar, metrics.threeStar, metrics.twoStar, metrics.oneStar][5 - n] : 0,
  }));

  return (
    <AppShell title='Google Business & Reviews'>
      <style>{css}</style>
      <div className='reviews-page'>
        <div className='hero'>
          <div className='page-head'>
            <div className='eyebrow'>REVIEW MANAGEMENT</div>
            <h1>Google Reviews</h1>
            <p>Central workspace inbox for rating trends, response status, AI drafts and reply actions.</p>
          </div>
          <div className='actions'>
            <button className='btn' onClick={() => location.href = '/dashboard/gmb'}>← Google Business</button>
            <button className='btn btn-soft' onClick={() => location.href = '/dashboard/gmb/images'}>Review Image Generator</button>
          </div>
        </div>

        {error && <div className='alert alert-error'>{error}</div>}
        {message && <div className='alert alert-success'>{message}</div>}

        <section className='panel'>
          <div className='panel-head'>
            <div><div className='eyebrow'>FILTERS</div><h2>Review queue</h2></div>
            <div className='note'>{loading ? 'Loading…' : reviews.length + ' review' + (reviews.length === 1 ? '' : 's') + ' shown'}</div>
          </div>
          <div className='toolbar'>
            <label className='field'><span>Search</span><input className='input' value={search} onChange={e => setSearch(e.target.value)} placeholder='Customer, business or review text' /></label>
            <label className='field'><span>Rating</span><select className='select' value={rating} onChange={e => setRating(e.target.value)}><option value='all'>All ratings</option><option value='5'>5 stars</option><option value='4'>4 stars</option><option value='3'>3 stars</option><option value='2'>2 stars</option><option value='1'>1 star</option></select></label>
            <label className='field'><span>Reply status</span><select className='select' value={replyStatus} onChange={e => setReplyStatus(e.target.value)}><option value='all'>All statuses</option><option value='not_replied'>Needs reply</option><option value='replied'>Replied</option></select></label>
            <label className='field'><span>Business location</span><select className='select' value={profileId} onChange={e => setProfileId(e.target.value)}><option value='all'>All locations</option>{profiles.map(p => <option value={p.id} key={p.id}>{p.business_name}</option>)}</select></label>
            <button className='btn btn-primary' onClick={applyFilters} disabled={loading}>Apply</button>
          </div>
        </section>

        <div className='metrics'>
          <article className='panel metric'><span>Total imported</span><strong>{loading ? '—' : total}</strong><small>Current imported review set</small></article>
          <article className='panel metric'><span>Average rating</span><strong>{loading ? '—' : metrics?.averageRating ?? '—'}</strong><small>Across imported ratings</small></article>
          <article className='panel metric'><span>Needs reply</span><strong>{loading ? '—' : metrics?.needsReply ?? 0}</strong><small>Pending responses</small></article>
          <article className='panel metric'><span>Response rate</span><strong>{loading ? '—' : (metrics?.responseRate ?? 0) + '%'}</strong><small>Reviews with replies</small></article>
          <article className='panel metric'><span>5-star</span><strong>{loading ? '—' : metrics?.fiveStar ?? 0}</strong><small>Positive rating count</small></article>
        </div>

        <section className='panel'>
          <div className='panel-head'><div><div className='eyebrow'>RATING BREAKDOWN</div><h2>Imported rating mix</h2></div></div>
          <div className='split'>
            <div className='breakdown'>{stars.map(item => <div className='barrow' key={item.n}><span>{item.n}★</span><div className='bar'><div className='fill' style={{ width: total ? (item.count / total * 100) + '%' : '0%' }} /></div><strong>{item.count}</strong></div>)}</div>
            <div className='note'>Use the reply queue to review every imported customer comment before publishing. AI suggestions remain drafts until a permitted workspace manager publishes a reply.</div>
          </div>
        </section>

        <section className='panel review-list'>
          <div className='panel-head'><div><div className='eyebrow'>INBOX</div><h2>Customer reviews</h2></div></div>
          {loading ? <div className='empty'>Loading reviews…</div> : !reviews.length ? <div className='empty'>No reviews match these filters.</div> : reviews.map(item => (
            <article className='review' key={item.id}>
              <div className='top'>
                <div className='identity'>
                  <strong>{item.reviewer_name || 'Google reviewer'}</strong>
                  <small>{item.business_name || 'Business Profile'} · {fmt(item.review_time)}</small>
                </div>
                <span className={'status ' + (item.reply_status === 'replied' ? 'replied' : 'pending')}>{item.reply_status === 'replied' ? '✓ Replied' : '● Needs reply'}</span>
              </div>
              <div className='stars'>{item.rating ? '★'.repeat(item.rating) + '☆'.repeat(Math.max(0, 5 - item.rating)) : 'No rating'}</div>
              <div className='comment'>{item.comment || 'Rating-only review'}</div>
              <div className='meta'><span className='pill'>{item.rating ? item.rating + '/5' : 'Unrated'}</span><span className='pill'>{item.reply_status === 'replied' ? 'Public reply saved' : 'Reply pending'}</span>{item.replied_at && <span className='pill'>Replied {fmt(item.replied_at)}</span>}</div>

              {canManage && <div className='actions'>
                <button className='btn btn-soft' disabled={busy !== ''} onClick={() => void generate(item.id)}>{busy === 'ai:' + item.id ? 'Generating…' : '✦ Suggest Reply'}</button>
                {item.suggestion && <button className='btn' onClick={() => useSuggestion(item)}>Use AI Draft</button>}
                {item.reply_text && <button className='btn' onClick={() => { setEditing(item.id); setReply(item.reply_text || ''); }}>Edit Reply</button>}
                {item.reply_text && <button className='btn btn-danger' disabled={busy !== ''} onClick={() => void saveReply(item.id, true)}>Delete Reply</button>}
              </div>}

              {item.suggestion && <div className='suggestion'><strong>{item.suggestion.model || 'AI draft'}:</strong> {item.suggestion.content}</div>}

              {editing === item.id && canManage && <div className='replybox'>
                <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder='Write a professional Google reply…' />
                <div className='actions'>
                  <button className='btn btn-primary' disabled={busy !== '' || !reply.trim()} onClick={() => void saveReply(item.id)}>{busy === 'reply:' + item.id ? 'Publishing…' : 'Publish Reply'}</button>
                  <button className='btn' disabled={busy !== ''} onClick={() => { setEditing(null); setReply(''); }}>Cancel</button>
                </div>
              </div>}
            </article>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
