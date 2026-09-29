'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { getSupabase } from '../../../lib/supabase-browser';

type Location = {
  id: string;
  business_name: string;
  location_id: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  review_url: string | null;
  status: string;
};

type Review = {
  id: string;
  reviewer_name: string | null;
  rating: number | null;
  comment: string | null;
  review_time: string | null;
  reply_text: string | null;
  reply_status: string;
};

type Suggestion = {
  id: string;
  content: string;
  model: string | null;
  created_at: string;
};

const gmbStyles = `
.gmb{display:grid;gap:16px}
.connect{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:20px}
.connect h2{margin:5px 0}
.connect p{margin:0;max-width:760px}
.actions{display:flex;gap:8px;flex-wrap:wrap}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.stat{padding:16px}
.stat span{display:block;color:#667085;font-size:10px;font-weight:800}
.stat strong{display:block;font-size:24px;margin-top:6px}
.locations{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;padding:0 18px 18px}
.loc{padding:16px}
.lochead{display:flex;justify-content:space-between;gap:10px}
.loc h3{margin:0 0 4px;font-size:14px}
.loc p,.meta{margin:0;color:#667085;font-size:10px;line-height:1.5}
.badge{padding:6px 9px;border-radius:999px;background:#edf8f1;color:#14804a;font-size:9px;font-weight:900;height:max-content}
.meta{display:grid;gap:5px;margin-top:12px;padding-top:10px;border-top:1px solid #edf0f3}
.reviews{overflow:hidden}
.review{padding:16px 18px;border-top:1px solid #edf0f3}
.reviewgrid{display:grid;grid-template-columns:160px 58px minmax(0,1fr) 100px;gap:12px}
.reviewer strong,.reviewer small{display:block}
.reviewer strong{font-size:11px}
.reviewer small{font-size:9px;color:#8a95a3;margin-top:3px}
.stars{font-size:11px;font-weight:900}
.comment{font-size:10px;line-height:1.55;color:#475467;white-space:pre-wrap}
.reply-status{font-size:9px;font-weight:900;text-align:right}
.replied{color:#14804a}
.pending{color:#b54708}
.tools{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}
.tool{border:1px solid #dce5e8;border-radius:9px;background:#fff;padding:8px 10px;font-size:9px;font-weight:850;cursor:pointer}
.tool.primary{background:#edf8f7;color:#087f7b;border-color:#cde7e5}
.tool.danger{color:#b42318}
.replybox{margin-top:10px;padding:12px;background:#f8fafb;border:1px solid #e5eaee;border-radius:11px}
.replybox textarea{width:100%;min-height:86px;border:1px solid #dbe4e8;border-radius:9px;padding:10px;resize:vertical}
.suggestion{margin-top:8px;padding:10px;background:#edf8f7;border-radius:9px;font-size:10px;color:#245f5c;white-space:pre-wrap}
.module-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.module{padding:18px}
.module h2{font-size:15px;margin:4px 0}
.module p{font-size:11px}
.empty{padding:40px 20px;text-align:center;color:#667085;font-size:11px}
@media(max-width:900px){
  .connect{align-items:flex-start;flex-direction:column}
  .stats,.locations,.module-grid{grid-template-columns:1fr}
  .reviewgrid{grid-template-columns:1fr 58px}
  .comment{grid-column:1/-1}
  .reply-status{text-align:left}
}
`;

const dateLabel = (value: string | null) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function GmbPage() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [suggestion, setSuggestion] = useState<Record<string, Suggestion | undefined>>({});

  async function token() {
    const session = (await getSupabase().auth.getSession()).data.session;
    if (!session) {
      location.href = '/login';
      throw new Error('Your session has expired.');
    }
    return session.access_token;
  }

  async function load(id: string) {
    setLoading(true);
    setError('');
    try {
      const sb = getSupabase();
      const [locationsResult, reviewsResult] = await Promise.all([
        sb
          .from('google_business_profiles')
          .select('id,business_name,location_id,address,phone,website,category,review_url,status')
          .eq('workspace_id', id)
          .order('business_name'),
        sb
          .from('google_business_reviews')
          .select('id,reviewer_name,rating,comment,review_time,reply_text,reply_status')
          .eq('workspace_id', id)
          .order('review_time', { ascending: false })
          .limit(50),
      ]);

      if (locationsResult.error) throw locationsResult.error;
      if (reviewsResult.error) throw reviewsResult.error;

      setLocations((locationsResult.data || []) as Location[]);
      setReviews((reviewsResult.data || []) as Review[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load Google Business data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let id = '';
    try {
      id = localStorage.getItem('mdsm:selectedWorkspaceId') || '';
    } catch {}

    setWorkspaceId(id);

    const params = new URLSearchParams(location.search);
    if (params.get('google') === 'connected') {
      setMessage('Google connected successfully.');
    }
    if (params.get('google_error')) {
      setError(params.get('google_error') || 'Google connection failed.');
    }

    if (id) {
      void load(id);
    } else {
      setLoading(false);
    }
  }, []);

  function connect() {
    location.href = '/dashboard/settings#connections';
  }

  async function sync() {
    setBusy('sync');
    setError('');
    try {
      const accessToken = await token();
      const response = await fetch('/api/google/business/sync', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Sync failed.');
      setMessage(
        'Sync complete: ' +
          (data.locations || 0) +
          ' locations and ' +
          (data.reviews || 0) +
          ' reviews processed.'
      );
      await load(workspaceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setBusy('');
    }
  }

  async function generate(reviewId: string) {
    setBusy('ai:' + reviewId);
    setError('');
    try {
      const accessToken = await token();
      const response = await fetch('/api/google/business/suggestion', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reviewId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Suggestion generation failed.');
      setSuggestion((current) => ({ ...current, [reviewId]: data.suggestion }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suggestion generation failed');
    } finally {
      setBusy('');
    }
  }

  async function saveReply(reviewId: string, doDelete = false) {
    setBusy('reply:' + reviewId);
    setError('');
    try {
      const accessToken = await token();
      const response = await fetch('/api/google/business/reply', {
        method: doDelete ? 'DELETE' : 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(doDelete ? { reviewId } : { reviewId, reply }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Reply update failed.');
      setEditing(null);
      setReply('');
      setMessage(doDelete ? 'Reply removed.' : 'Reply published to Google.');
      await load(workspaceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reply update failed');
    } finally {
      setBusy('');
    }
  }

  function applySuggestion(review: Review) {
    const generated = suggestion[review.id];
    if (generated) {
      setEditing(review.id);
      setReply(generated.content);
    }
  }

  return (
    <AppShell title='Google Business & Reviews'>
      <style jsx>{gmbStyles}</style>

      <div className='gmb'>
        <div className='page-head'>
          <div>
            <div className='eyebrow'>GOOGLE BUSINESS PROFILE</div>
            <h1>Google Business &amp; Reviews</h1>
            <p>
              Live workspace-scoped locations and reviews. Google credentials are the only
              remaining external setup.
            </p>
          </div>
        </div>

        {error && <div className='alert alert-error'>{error}</div>}
        {message && <div className='alert alert-success'>{message}</div>}

        <section className='panel connect'>
          <div>
            <div className='eyebrow'>CONNECTION</div>
            <h2>
              {locations.length
                ? 'Google is connected'
                : 'Open Connection Settings Business Profile'}
            </h2>
            <p>
              Connect the Google account that manages this workspace. Tokens remain server-side.
            </p>
          </div>
          <div className='actions'>
            {locations.length > 0 && (
              <button
                className='btn btn-soft'
                disabled={busy !== ''}
                onClick={() => void sync()}
              >
                {busy === 'sync' ? 'Syncing…' : '↻ Sync from Google'}
              </button>
            )}
            <button
              className='btn btn-primary'
              disabled={busy !== ''}
              onClick={() => void connect()}
            >
              {busy === 'connect'
                ? 'Opening Google…'
                : locations.length
                  ? 'Open Connection Settings'
                  : 'Connect Google'}
            </button>
          </div>
        </section>

        <div className='stats'>
          <article className='panel stat'>
            <span>Connected Locations</span>
            <strong>{loading ? '—' : locations.length}</strong>
          </article>
          <article className='panel stat'>
            <span>Imported Reviews</span>
            <strong>{loading ? '—' : reviews.length}</strong>
          </article>
          <article className='panel stat'>
            <span>Needs Reply</span>
            <strong>
              {loading ? '—' : reviews.filter((item) => item.reply_status !== 'replied').length}
            </strong>
          </article>
        </div>

        <section className='panel'>
          <div className='panel-head'>
            <div>
              <div className='eyebrow'>LOCATIONS</div>
              <h2>Business Profile locations</h2>
            </div>
          </div>

          {loading ? (
            <div className='empty'>Loading…</div>
          ) : locations.length === 0 ? (
            <div className='empty'>No locations imported yet.</div>
          ) : (
            <div className='locations'>
              {locations.map((item) => (
                <article className='panel loc' key={item.id}>
                  <div className='lochead'>
                    <div>
                      <h3>{item.business_name}</h3>
                      <p>{item.category || 'Business Profile location'}</p>
                    </div>
                    <span className='badge'>{item.status}</span>
                  </div>
                  <div className='meta'>
                    <span>{item.address || 'Address unavailable'}</span>
                    <span>{item.phone || 'Phone unavailable'}</span>
                    {item.website && <span>{item.website}</span>}
                    {item.review_url && (
                      <a
                        href={item.review_url}
                        target='_blank'
                        rel='noreferrer'
                        style={{ color: '#087f7b', fontWeight: 800 }}
                      >
                        Open Google review link →
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className='panel reviews'>
          <div className='panel-head'>
            <div>
              <div className='eyebrow'>REVIEW MANAGEMENT</div>
              <h2>Latest reviews</h2>
              <p>
                Reply directly from the workspace. Google handles the final moderation/state.
              </p>
            </div>
          </div>

          {reviews.length === 0 ? (
            <div className='empty'>No reviews imported yet.</div>
          ) : (
            reviews.map((review) => (
              <div className='review' key={review.id}>
                <div className='reviewgrid'>
                  <div className='reviewer'>
                    <strong>{review.reviewer_name || 'Google reviewer'}</strong>
                    <small>{dateLabel(review.review_time)}</small>
                  </div>
                  <div className='stars'>
                    {review.rating ? '★'.repeat(review.rating) : '—'}
                  </div>
                  <div className='comment'>
                    {review.comment || 'Rating-only review'}
                  </div>
                  <div
                    className={
                      'reply-status ' +
                      (review.reply_status === 'replied' ? 'replied' : 'pending')
                    }
                  >
                    {review.reply_status === 'replied' ? '✓ Replied' : '● Needs reply'}
                  </div>
                </div>

                <div className='tools'>
                  <button
                    className='tool primary'
                    disabled={busy !== ''}
                    onClick={() => void generate(review.id)}
                  >
                    {busy === 'ai:' + review.id ? 'Generating…' : '✦ Suggest Reply'}
                  </button>

                  {review.reply_text && (
                    <button
                      className='tool'
                      onClick={() => {
                        setEditing(review.id);
                        setReply(review.reply_text || '');
                      }}
                    >
                      Edit Reply
                    </button>
                  )}

                  {review.reply_text && (
                    <button
                      className='tool danger'
                      disabled={busy !== ''}
                      onClick={() => void saveReply(review.id, true)}
                    >
                      Delete Reply
                    </button>
                  )}

                  {suggestion[review.id] && (
                    <button className='tool' onClick={() => applySuggestion(review)}>
                      Use Suggestion
                    </button>
                  )}
                </div>

                {suggestion[review.id] && (
                  <div className='suggestion'>
                    <strong>
                      Suggestion · {suggestion[review.id]?.model || 'draft'}
                    </strong>
                    <br />
                    {suggestion[review.id]?.content}
                  </div>
                )}

                {editing === review.id && (
                  <div className='replybox'>
                    <textarea
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder='Write a professional reply…'
                    />
                    <div className='tools'>
                      <button
                        className='tool primary'
                        disabled={busy !== '' || !reply.trim()}
                        onClick={() => void saveReply(review.id)}
                      >
                        {busy === 'reply:' + review.id ? 'Publishing…' : 'Publish Reply'}
                      </button>
                      <button
                        className='tool'
                        disabled={busy !== ''}
                        onClick={() => {
                          setEditing(null);
                          setReply('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </section>

        <div className='module-grid'>
          {[
            [
              'Review Requests',
              'Create customer review links and track sent/opened/feedback activity.',
              '/dashboard/gmb/requests',
            ],
            [
              'Feedback Forms',
              'Create public feedback forms connected to review requests.',
              '/dashboard/gmb/forms',
            ],
            [
              'Keywords Management',
              'Manage workspace keywords used in review-response suggestions.',
              '/dashboard/gmb/keywords',
            ],
            [
              'Review Image Generator',
              'Create shareable review quote cards from imported reviews.',
              '/dashboard/gmb/images',
            ],
          ].map(([title, description, href]) => (
            <section className='panel module' key={title}>
              <div className='eyebrow'>MODULE</div>
              <h2>{title}</h2>
              <p>{description}</p>
              <button className='btn btn-soft' onClick={() => (location.href = href)}>
                Open Module →
              </button>
            </section>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
