'use client';

import { FormEvent, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase-browser';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setReady(Boolean(data.session));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setReady(Boolean(session));
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setMessage('Password must be at least 8 characters.');
    if (password !== confirm) return setMessage('Passwords do not match.');
    setSaving(true);
    setMessage('');
    try {
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error) throw error;
      setMessage('Password updated successfully. You can now sign in with your new password.');
      setPassword('');
      setConfirm('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f4f7f8', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <section style={{ width: 'min(430px,100%)', background: '#fff', border: '1px solid #e2e8ec', borderRadius: 20, padding: 32, boxShadow: '0 20px 50px rgba(15,23,42,.08)' }}>
        <div style={{ fontWeight: 950, color: '#078b87', letterSpacing: '.04em', fontSize: 12 }}>MD HYGIENE</div>
        <h1 style={{ margin: '10px 0 6px', fontSize: 28 }}>Set a new password</h1>
        <p style={{ color: '#687582', fontSize: 13, lineHeight: 1.5 }}>Choose a strong password for your Social Media Manager account.</p>
        {!ready && <div style={{ padding: 12, borderRadius: 10, background: '#fff7e8', color: '#8a5a00', fontSize: 12 }}>Open this page from the password reset email.</div>}
        <form onSubmit={submit} style={{ display: 'grid', gap: 14, marginTop: 22 }}>
          <label style={{ display: 'grid', gap: 7, fontSize: 12, fontWeight: 800 }}>New password<input type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" style={{ height: 46, border: '1px solid #d8e0e5', borderRadius: 10, padding: '0 12px' }} /></label>
          <label style={{ display: 'grid', gap: 7, fontSize: 12, fontWeight: 800 }}>Confirm password<input type="password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" style={{ height: 46, border: '1px solid #d8e0e5', borderRadius: 10, padding: '0 12px' }} /></label>
          <button disabled={!ready || saving} style={{ height: 46, border: 0, borderRadius: 10, background: '#078b87', color: '#fff', fontWeight: 900 }}>{saving ? 'Updating…' : 'Update password'}</button>
        </form>
        {message && <div style={{ marginTop: 16, padding: 11, borderRadius: 10, background: message.includes('successfully') ? '#edf9f1' : '#fff0f0', color: message.includes('successfully') ? '#087443' : '#b42318', fontSize: 12, fontWeight: 700 }}>{message}</div>}
      </section>
    </main>
  );
}
