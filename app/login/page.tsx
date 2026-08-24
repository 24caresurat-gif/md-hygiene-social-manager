'use client';

import { FormEvent, useState } from 'react';
import { getSupabase } from '../../lib/supabase-browser';

const EMPLOYEE_DOMAIN = '@employee.md-hygiene.local';

type LoginType = 'admin' | 'team';

export default function LoginPage() {
  const [loginType, setLoginType] = useState<LoginType>('admin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function validateSession(token: string) {
    const response = await fetch('/api/auth/session', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'Your session could not be validated.');
    return data;
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const value = identifier.trim();
      if (!value) throw new Error(loginType === 'admin' ? 'Enter your admin email address.' : 'Enter your Employee ID.');

      const authEmail = loginType === 'team'
        ? `${value.toLowerCase()}${EMPLOYEE_DOMAIN}`
        : value;

      if (loginType === 'admin' && !value.includes('@')) {
        throw new Error('Admin login requires an email address.');
      }

      const { data, error } = await getSupabase().auth.signInWithPassword({ email: authEmail, password });
      if (error) throw error;

      const token = data.session?.access_token;
      if (!token) throw new Error('Login succeeded but no session was created.');
      await validateSession(token);
      window.location.assign('/dashboard');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function forgot() {
    if (loginType === 'team') {
      setMessage('Employee ID password reset must be handled by the workspace owner or admin.');
      return;
    }
    const email = identifier.trim();
    if (!email) { setMessage('Enter your admin email address first.'); return; }
    if (!email.includes('@')) { setMessage('Enter a valid admin email address.'); return; }
    setLoading(true); setMessage('');
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) throw error;
      setMessage('Password reset email sent. Check your inbox.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to send reset email.');
    } finally { setLoading(false); }
  }

  return <main className="login-page">
    <div className="login-shell">
      <aside className="login-side">
        <div className="login-brand"><div className="login-logo">MD</div><div><b>MD HYGIENE</b><small>SOCIAL MEDIA MANAGER</small></div></div>
        <div className="login-side-copy"><span>WORKSPACE HUB</span><h2>Manage every brand from one place.</h2><p>Connect accounts, create content and publish across your workspaces.</p><div><b>✓ Workspace-based access</b><b>✓ Facebook &amp; Instagram</b><b>✓ Secure authentication</b></div></div>
      </aside>
      <section className="login-card">
        <div className="mobile-brand"><div className="login-logo">MD</div><b>MD HYGIENE<small>SOCIAL MEDIA MANAGER</small></b></div>
        <div className="login-heading"><span>{loginType === 'admin' ? 'ADMIN / OWNER LOGIN' : 'TEAM MEMBER LOGIN'}</span><h1>Sign in to your account</h1><p>{loginType === 'admin' ? 'Use your workspace admin or owner email.' : 'Use the Employee ID provided by your workspace admin.'}</p></div>

        <div className="login-switch" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:20}}>
          <button type="button" className={loginType === 'admin' ? 'active' : ''} onClick={() => { setLoginType('admin'); setIdentifier(''); setPassword(''); setMessage(''); }}>Admin / Owner</button>
          <button type="button" className={loginType === 'team' ? 'active' : ''} onClick={() => { setLoginType('team'); setIdentifier(''); setPassword(''); setMessage(''); }}>Team Member</button>
        </div>

        <form onSubmit={submit}>
          <label>{loginType === 'admin' ? 'Admin email address' : 'Employee ID'}
            <div className="field"><span>{loginType === 'admin' ? '✉' : 'ID'}</span><input type={loginType === 'admin' ? 'email' : 'text'} value={identifier} onChange={e => setIdentifier(e.target.value)} autoComplete="username" required placeholder={loginType === 'admin' ? 'you@company.com' : 'EMP001'} /></div>
          </label>
          <label>Password<div className="field"><span>●</span><input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required minLength={8} placeholder="Minimum 8 characters" /><button type="button" className="show-btn" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></div></label>
          <button type="button" className="forgot" onClick={forgot} disabled={loading}>{loginType === 'admin' ? 'Forgot password?' : 'Need a password reset?'}</button>
          <button className="signin" disabled={loading}>{loading ? 'Please wait…' : 'Sign in'}</button>
        </form>
        {message && <div className={`login-message ${message.includes('sent') ? 'ok' : ''}`}>{message}</div>}
        <div className="login-footer">Accounts are created by the workspace administrator. Protected by Supabase authentication.</div>
      </section>
    </div>
  </main>;
}
