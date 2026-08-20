import Link from 'next/link';

export default function Home() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand">MD HYGIENE</div>
        <h1>Social Media Manager</h1>
        <p className="muted">Manage your social publishing workspace from one place.</p>
        <Link href="/login" style={{ display: 'block', textAlign: 'center', marginTop: 26, padding: 14, borderRadius: 12, background: '#4f46e5', color: '#fff', textDecoration: 'none', fontWeight: 700 }}>
          Sign in to continue
        </Link>
      </section>
    </main>
  );
}
