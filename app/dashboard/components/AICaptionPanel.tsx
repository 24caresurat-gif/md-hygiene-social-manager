'use client';

import { useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';

export default function AICaptionPanel({
  brandId,
  accountIds,
  currentCaption = '',
  onUse,
}: {
  brandId: string;
  accountIds: string[];
  currentCaption?: string;
  onUse: (caption: string) => void;
}) {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('Professional');
  const [platform, setPlatform] = useState('social media');
  const [language, setLanguage] = useState('English');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ideas, setIdeas] = useState<string[]>([]);
  const [reelScript, setReelScript] = useState('');

  async function run(action: string) {
    setError('');
    setIdeas([]);
    setReelScript('');
    if (!topic.trim() && !currentCaption.trim()) {
      setError('Enter a product/topic first.');
      return;
    }

    try {
      setBusy(true);
      const session = (await getSupabase().auth.getSession()).data.session;
      if (!session) throw new Error('Login required.');

      const response = await fetch('/api/ai/caption', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brandId,
          accountIds,
          topic,
          current: currentCaption,
          action,
          tone,
          platform,
          language,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to generate AI content.');

      if (action === 'ideas') {
        setIdeas(data.ideas || []);
        return;
      }
      if (action === 'reel_script') {
        setReelScript(data.script || '');
        return;
      }
      if (action === 'hashtags') {
        onUse(`${currentCaption}${data.hashtags?.length ? `\\n\\n${data.hashtags.join(' ')}` : ''}`);
        return;
      }
      onUse(`${data.caption || currentCaption}${data.hashtags?.length ? `\\n\\n${data.hashtags.join(' ')}` : ''}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate AI content.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ai-caption-panel">
      <div className="ai-caption-head">
        <strong>✨ AI Content Intelligence</strong>
        <span>Admin approval still required</span>
      </div>
      <div className="ai-caption-grid">
        <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Product / topic" maxLength={1000} />
        <select value={tone} onChange={(event) => setTone(event.target.value)}>
          <option>Professional</option>
          <option>Friendly</option>
          <option>Promotional</option>
          <option>Educational</option>
        </select>
        <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
          <option value="social media">Social Media</option>
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
          <option value="google_business">Google Business</option>
        </select>
        <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Content language">
          <option value="English">English</option>
          <option value="Gujarati">ગુજરાતી (Gujarati)</option>
          <option value="Hindi">हिन्दी (Hindi)</option>
        </select>
      </div>
      <div className="ai-caption-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => void run('generate')}>{busy ? 'Working…' : 'Generate Caption'}</button>
        <button className="btn btn-soft" disabled={busy} onClick={() => void run('rewrite')}>Rewrite</button>
        <button className="btn btn-soft" disabled={busy} onClick={() => void run('hashtags')}>Hashtags</button>
        <button className="btn btn-soft" disabled={busy} onClick={() => void run('ideas')}>Post Ideas</button>
        <button className="btn btn-soft" disabled={busy} onClick={() => void run('reel_script')}>🎬 Reel Script</button>
      </div>
      {ideas.length > 0 && (
        <div className="ai-ideas">
          <strong>Post ideas</strong>
          {ideas.map((idea, index) => <div key={index}>• {idea}</div>)}
        </div>
      )}
      {reelScript && (
        <div className="ai-ideas">
          <strong>🎬 Reel Script ({language})</strong>
          <p style={{ whiteSpace: 'pre-wrap' }}>{reelScript}</p>
          <button className="btn btn-primary" onClick={() => onUse(reelScript)}>Use Script in Editor</button>
        </div>
      )}
      {error && <div className="alert alert-error">⚠ {error}</div>}
    </div>
  );
}
