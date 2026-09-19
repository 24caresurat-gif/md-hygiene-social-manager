'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';

type Profile = {
  id: string;
  business_name: string;
  location_id: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  status: string;
};

export default function GmbPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [brandId, setBrandId] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const sb = getSupabase();
        const { data } = await sb.auth.getUser();
        if (!data.user) { location.href = '/login'; return; }
        const selected = localStorage.getItem('mdsm:selectedWorkspaceId') || '';
        setBrandId(selected);

        // The API connection will be wired after Google OAuth credentials are configured.
        // We intentionally do not display fake Google locations here.
        setProfiles([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function connectGoogle() {
    setMessage(
      'Google OAuth is the next connection step. The database and workspace isolation are ready; Google Cloud OAuth credentials are still required before live Business Profile locations can be imported.'
    );
  }

  if (loading) return <main className="auth-page"><div className="muted">Loading Google Business Profile…</div></main>;

  return (
    <main className="dashboard-content">
      <div className="page-head">
        <div>
          <div className="eyebrow">GOOGLE BUSINESS PROFILE</div>
          <h1>Google Business & Reviews</h1>
          <p>Manage locations, reviews, review requests, feedback forms, keywords and AI review tools inside the selected workspace.</p>
        </div>
        <button className="btn btn-soft" onClick={() => location.href='/dashboard'}>← Dashboard</button>
      </div>

      {message && <div className="alert alert-success">{message}</div>}

      <section className="panel connect-panel">
        <div>
          <div className="eyebrow">GOOGLE CONNECTION</div>
          <h2 style={{margin:'5px 0'}}>Connect Google Business Profile</h2>
          <p className="muted" style={{fontSize:12,lineHeight:1.55,margin:0}}>
            Connect the Google account that manages this workspace's Business Profile locations.
            OAuth will be used; the application will not ask for your Google password.
          </p>
        </div>
        <button className="btn btn-primary" onClick={connectGoogle}>Connect Google</button>
      </section>

      <div className="brand-card-grid">
        {[
          ['⭐','Review Management','Import reviews, track ratings and prepare replies.'],
          ['📨','Review Requests','Generate customer review-request links and QR campaigns.'],
          ['📝','Feedback Forms','Collect structured customer feedback for this workspace.'],
          ['🤖','AI Review Suggestions','Draft review and reply suggestions for approval.'],
          ['🔎','Keywords Management','Maintain workspace-specific keywords and categories.'],
          ['🖼️','AI Review Images','Store image assets used by review campaigns.'],
        ].map(([icon,title,description]) => (
          <section className="panel" key={title}>
            <div className="channel-icon green">{icon}</div>
            <h2 style={{fontSize:16,margin:'6px 0'}}>{title}</h2>
            <p className="muted" style={{fontSize:11,lineHeight:1.5}}>{description}</p>
            <span className="btn btn-soft" style={{display:'inline-block'}}>Database ready</span>
          </section>
        ))}
      </div>

      <section className="panel" style={{marginTop:16}}>
        <div className="panel-head">
          <div>
            <div className="eyebrow">CONNECTED LOCATIONS</div>
            <h2>Google Business locations</h2>
            <p>{brandId ? 'Locations will be scoped to the selected workspace.' : 'Select a workspace from the dashboard first.'}</p>
          </div>
        </div>
        {profiles.length === 0 ? (
          <div className="empty-state">
            <strong>No Google location connected yet</strong>
            Click “Connect Google” after Google OAuth credentials are configured. Live locations and reviews will then load here.
          </div>
        ) : profiles.map(p => (
          <div className="account-row" key={p.id}>
            <div className="account-avatar google_business">G</div>
            <div className="account-info">
              <strong>{p.business_name}</strong>
              <span>{p.address || p.location_id} · {p.status}</span>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
