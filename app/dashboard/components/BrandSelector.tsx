'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';

export type Brand = { id: string; name: string; slug: string; logo_url?: string | null };
export const ALL_BRANDS_ID = 'all';

export default function BrandSelector({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const session = (await getSupabase().auth.getSession()).data.session;
        if (!session) return;
        const r = await fetch('/api/brands', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
        const d = await r.json();
        if (r.ok) setBrands(d.brands || []);
      } finally { setLoading(false); }
    })();
  }, []);
  return <div className="account-picker">
    <label>Business / Brand</label>
    <select value={value} onChange={e => onChange(e.target.value)} disabled={loading}>
      <option value={ALL_BRANDS_ID}>All Businesses</option>
      {brands.map(b => <option value={b.id} key={b.id}>{b.name}</option>)}
    </select>
  </div>;
}
