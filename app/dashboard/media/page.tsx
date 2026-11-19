'use client';
import { useCallback, useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { getSupabase } from '../../../lib/supabase-browser';

type MediaFile = {
  name: string;
  path: string;
  url: string;
  createdAt: string | null;
  metadata: { mimetype?: string; size?: number } | null;
};

export default function MediaPage() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState('');

  const request = useCallback(async (url: string, options: RequestInit = {}) => {
    const session = (await getSupabase().auth.getSession()).data.session;
    if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  }, []);

  const loadFiles = useCallback(async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await request(`/api/media/library?brandId=${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load media library.');
      setFiles(data.files || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load media library.');
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const saved = localStorage.getItem('mdsm:selectedWorkspaceId') || '';
    if (!saved) {
      location.href = '/dashboard';
      return;
    }
    setWorkspaceId(saved);
    void loadFiles(saved);
  }, [loadFiles]);

  async function add(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length || !workspaceId) return;
    setUploading(true);
    setMessage('');
    setError('');
    let uploaded = 0;
    try {
      for (const file of selected) {
        const form = new FormData();
        form.append('file', file);
        form.append('brandId', workspaceId);
        const response = await request('/api/media/upload', { method: 'POST', body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Could not upload ${file.name}.`);
        uploaded += 1;
      }
      setMessage(`${uploaded} media asset${uploaded === 1 ? '' : 's'} uploaded successfully.`);
      await loadFiles(workspaceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Media upload failed.');
      if (uploaded) await loadFiles(workspaceId);
    } finally {
      setUploading(false);
    }
  }

  async function remove(file: MediaFile) {
    if (!workspaceId || deleting) return;
    setDeleting(file.path);
    setError('');
    try {
      const response = await request('/api/media/library?brandId=' + encodeURIComponent(workspaceId), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to remove media.');
      setFiles((current) => current.filter((item) => item.path !== file.path));
      setMessage('Media asset removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove media.');
    } finally {
      setDeleting('');
    }
  }

  return (
    <AppShell title="Media Library">
      <div className="page-head">
        <div>
          <span className="eyebrow">ASSETS</span>
          <h1>Media Library</h1>
          <p>Store and reuse workspace images and videos before publishing.</p>
        </div>
        <label className="btn btn-primary" aria-disabled={uploading}>
          {uploading ? 'Uploading…' : '＋ Upload Media'}
          <input hidden type="file" multiple accept="image/*,video/*" disabled={uploading} onChange={add} />
        </label>
      </div>
      <section className="panel" style={{ padding: 24 }}>
        {message && <div className="data-warning" style={{ marginBottom: 16 }}>{message}</div>}
        {error && <div role="alert" className="data-warning" style={{ marginBottom: 16 }}>{error}</div>}
        {loading ? (
          <div className="empty-state large-empty"><p>Loading workspace media…</p></div>
        ) : files.length ? (
          <div className="media-grid">
            {files.map((file) => {
              const isVideo = (file.metadata?.mimetype || '').startsWith('video/');
              return (
                <article className="media-item" key={file.path}>
                  <div className="media-preview">
                    {isVideo ? <video src={file.url} controls preload="metadata" /> : <img src={file.url} alt={file.name} loading="lazy" />}
                  </div>
                  <strong title={file.name}>{file.name}</strong>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <a className="text-btn" href={file.url} target="_blank" rel="noreferrer">Open</a>
                    <button className="text-btn" disabled={deleting === file.path} onClick={() => remove(file)}>
                      {deleting === file.path ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state large-empty">
            <div className="empty-icon">▧</div>
            <h2>Your media library is empty</h2>
            <p>Upload images or videos. Assets are stored in Supabase and remain available when you sign in again.</p>
            <label className="btn btn-primary" aria-disabled={uploading}>
              ＋ Upload First Asset
              <input hidden type="file" multiple accept="image/*,video/*" disabled={uploading} onChange={add} />
            </label>
          </div>
        )}
      </section>
    </AppShell>
  );
}
