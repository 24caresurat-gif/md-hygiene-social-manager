'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '../../../../lib/supabase-browser';

export default function CreateWorkspacePage() {
  const [name, setName] = useState('');
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      if (!data.user) location.href = '/login';
    }).catch(() => {
      location.href = '/login';
    });
  }, []);

  function chooseLogo(file: File | null) {
    setError('');
    if (!file) {
      setLogo(null);
      setPreview('');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Logo must be 5 MB or smaller.');
      return;
    }
    setLogo(file);
    setPreview(URL.createObjectURL(file));
  }

  async function submit() {
    if (!name.trim()) {
      setError('Workspace name is required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const supabase = getSupabase();
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('Your session has expired. Please sign in again.');

      let logo_url: string | null = null;
      if (logo) {
        const ext = (logo.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
        const upload = await supabase.storage.from('workspace-logos').upload(path, logo, {
          contentType: logo.type,
          upsert: false,
          cacheControl: '31536000',
        });
        if (upload.error) throw upload.error;
        logo_url = supabase.storage.from('workspace-logos').getPublicUrl(path).data.publicUrl;
      }

      const response = await fetch('/api/brands', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name: name.trim(), logo_url }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Unable to create workspace.');

      const id = data?.brand?.id;
      if (id) {
        try { localStorage.setItem('mdsm:selectedWorkspaceId', id); } catch {}
      }
      location.href = '/dashboard';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create workspace.');
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', padding: '34px 20px', background: '#f7fafb', color: '#17202b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(760px, 100%)' }}>
        <button type="button" onClick={() => { location.href = '/dashboard'; }} style={{ border: 0, background: 'transparent', color: '#657381', fontWeight: 800, fontSize: 12, cursor: 'pointer', marginBottom: 22 }}>
          ← Back to Workspaces
        </button>
        <section style={{ background: '#fff', border: '1px solid #dfe8ec', borderRadius: 28, padding: 'clamp(26px, 5vw, 46px)', boxShadow: '0 24px 70px rgba(15,23,42,.09)' }}>
          <div style={{ color: '#078b87', fontSize: 11, fontWeight: 900, letterSpacing: '.14em', textTransform: 'uppercase' }}>● Stage 3 · Workspace Setup</div>
          <h1 style={{ fontSize: 'clamp(30px, 5vw, 44px)', letterSpacing: '-.045em', margin: '10px 0 8px' }}>Create New Workspace</h1>
          <p style={{ margin: '0 0 30px', color: '#718096', fontSize: 14, lineHeight: 1.6 }}>
            Give your workspace a name and logo. Social connections, brands, team permissions and publishing can be configured step by step after creation.
          </p>

          <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 30, flexWrap: 'wrap' }}>
            <div style={{ width: 112, height: 112, borderRadius: 28, display: 'grid', placeItems: 'center', overflow: 'hidden', background: '#e7f8f6', border: '1px solid #cfe5e6', color: '#078b87', fontSize: 30, fontWeight: 950, flex: '0 0 112px' }}>
              {preview ? <img src={preview} alt="Workspace logo preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : name.trim() ? name.trim().slice(0, 2).toUpperCase() : '＋'}
            </div>
            <div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, border: '1px solid #d7e4e7', borderRadius: 12, background: '#fff', padding: '11px 14px', color: '#17202b', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
                ＋ Upload Workspace Logo
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => chooseLogo(e.target.files?.[0] || null)} style={{ display: 'none' }} />
              </label>
              <span style={{ display: 'block', marginTop: 8, color: '#82909a', fontSize: 10 }}>PNG, JPG or WEBP · Maximum 5 MB</span>
              {logo && <button type="button" onClick={() => chooseLogo(null)} style={{ border: 0, background: 'transparent', color: '#657381', fontWeight: 800, fontSize: 11, cursor: 'pointer', marginTop: 8 }}>Remove logo</button>}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 9 }}>
            <label style={{ fontSize: 11, fontWeight: 900, color: '#52606d', letterSpacing: '.08em', textTransform: 'uppercase' }}>Workspace Name</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MD Hygiene" onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} style={{ height: 52, border: '1px solid #d7e3e7', borderRadius: 13, padding: '0 15px', fontSize: 15, fontWeight: 700, outline: 'none' }} />
          </div>

          {error && <div style={{ margin: '18px 0', padding: '12px 14px', borderRadius: 12, background: '#fff1f2', color: '#b42318', fontSize: 12, fontWeight: 700 }}>⚠ {error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 30 }}>
            <button type="button" onClick={() => { location.href = '/dashboard'; }} style={{ height: 48, padding: '0 18px', borderRadius: 12, border: '1px solid #d7e4e7', background: '#fff', color: '#53606c', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            <button type="button" disabled={busy || !name.trim()} onClick={() => void submit()} style={{ height: 48, padding: '0 18px', borderRadius: 12, border: 0, background: '#17202b', color: '#fff', fontWeight: 900, fontSize: 12, cursor: busy || !name.trim() ? 'not-allowed' : 'pointer', opacity: busy || !name.trim() ? .5 : 1 }}>{busy ? 'Creating…' : 'Create Workspace →'}</button>
          </div>
        </section>
      </div>
    </main>
  );
}
