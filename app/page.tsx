export default function Home() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <section style={{ width: '100%', maxWidth: 900, background: '#fff', borderRadius: 20, padding: 40, boxShadow: '0 10px 40px rgba(0,0,0,.08)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7280' }}>
          MD Hygiene
        </div>
        <h1 style={{ fontSize: 42, margin: '12px 0 10px' }}>Social Media Manager</h1>
        <p style={{ fontSize: 18, lineHeight: 1.6, color: '#6b7280', maxWidth: 650 }}>
          Your social publishing dashboard is ready for the next step: Supabase authentication, workspace setup, and social account connections.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
          <span style={{ padding: '10px 14px', borderRadius: 999, background: '#eef2ff' }}>Next.js</span>
          <span style={{ padding: '10px 14px', borderRadius: 999, background: '#ecfdf5' }}>Supabase</span>
          <span style={{ padding: '10px 14px', borderRadius: 999, background: '#f3f4f6' }}>Vercel</span>
        </div>
      </section>
    </main>
  );
}
