'use client';
import { useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';

export default function AICaptionPanel({ brandId, accountIds, onUse }: { brandId: string; accountIds: string[]; onUse: (caption: string) => void }) {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('Professional');
  const [platform, setPlatform] = useState('social media');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setError('');
    if (!topic.trim()) { setError('Enter a product or topic first.'); return; }
    try {
      setBusy(true);
      const session = (await getSupabase().auth.getSession()).data.session;
      if (!session) throw new Error('Login required.');
      const r = await fetch('/api/ai/caption', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, accountIds, topic, tone, platform, language: 'English' }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Unable to generate caption.');
      onUse(`${data.caption}${data.hashtags?.length ? `\n\n${data.hashtags.join(' ')}` : ''}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to generate caption.');
    } finally { setBusy(false); }
  }

  return <div className="ai-caption-panel">
    <div className="ai-caption-head"><strong>✨ AI Caption</strong><span>Approval still required</span></div>
    <div className="ai-caption-grid">
      <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Product / topic" maxLength={1000} />
      <select value={tone} onChange={e => setTone(e.target.value)}><option>Professional</option><option>Friendly</option><option>Promotional</option><option>Educational</option></select>
      <select value={platform} onChange={e => setPlatform(e.target.value)}><option value="social media">Social Media</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="google_business">Google Business</option></select>
      <button className="btn btn-primary" disabled={busy} onClick={() => void generate()}>{busy ? 'Generating…' : 'Generate'}</button>
    </div>
    {error && <div className="alert alert-error">⚠ {error}</div>}
  </div>;
}
