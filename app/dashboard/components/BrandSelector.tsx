'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';

export type Brand = { id: string; name: string; slug: string; logo_url?: string | null };
export const ALL_BRANDS_ID = 'all';

export default function BrandSelector({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = (await getSupabase().auth.getSession()).data.session;
        if (!session) return;
        const r = await fetch('/api/brands', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Unable to load businesses.');
        if (active) setBrands(d.brands || []);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load businesses.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <div className="brand-selector" aria-label="Business workspace selector">
      <div className="brand-selector-title">
        <span className="brand-selector-icon">▦</span>
        <div>
          <strong>Select Business / Brand</strong>
          <small>Dashboard, accounts & publishing</small>
        </div>
      </div>
      <select
        className="brand-selector-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        aria-label="Select business or brand"
      >
        <option value={ALL_BRANDS_ID}>All Businesses</option>
        {brands.map((b) => <option value={b.id} key={b.id}>{b.name}</option>)}
      </select>
      {error ? <small className="brand-selector-error">{error}</small> : null}
      <a className="brand-manage-link" href="/dashboard/brands">＋ Create / Manage Business Cards</a>
    </div>
  );
}
