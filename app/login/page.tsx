'use client';

import { FormEvent, useState } from 'react';
import { getSupabase } from '../../lib/supabase-browser';

const EMPLOYEE_DOMAIN = '@employee.md-hygiene.local';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
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
      const supabase = getSupabase();
      const identifier = email.trim();
      const authEmail = mode === 'login' && !identifier.includes('@') ? `${identifier.toLowerCase()}${EMPLOYEE_DOMAIN}` : identifier;
      const result = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: authEmail, password })
        : await supabase.auth.signUp({ email: authEmail, password });
      if (result.error) throw result.error;
      if (mode === 'signup') {
        setMessage('Account created. Check your email if confirmation is enabled.');
      } else {
        const token = result.data.session?.access_token;
        if (!token) throw new Error('Login succeeded but no session was created.');
        await validateSession(token);
        window.location.assign('/dashboard');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function forgot() {
    const identifier = email.trim();
    if (!identifier) { setMessage('Enter your email address or Employee ID first.'); return; }
    if (!identifier.includes('@')) { setMessage('Employee ID password reset must be handled by the workspace owner.'); return; }
    setLoading(true); setMessage('');
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(identifier, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) throw error;
      setMessage('Password reset email sent. Check your inbox.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to send reset email.');
    } finally { setLoading(false); }
  }

  const isLogin = mode === 'login';
  const switchMode = () => { setMode(isLogin ? 'signup' : 'login'); setMessage(''); };

  return <main className="login-page">
    <div className="login-shell">
      <aside className="login-side"><div className="login-brand"><div className="login-logo">MD</div><div><b>MD HYGIENE</b><small>SOCIAL MEDIA MANAGER</small></div></div><div className="login-side-copy"><span>WORKSPACE HUB</span><h2>Manage every brand from one place.</h2><p>Connect accounts, create content and publish across your workspaces.</p><div><b>✓ Workspace-based access</b><b>✓ Facebook &amp; Instagram</b><b>✓ Secure authentication</b></div></div></aside>
      <section className="login-card"><div className="mobile-brand"><div className="login-logo">MD</div><b>MD HYGIENE<small>SOCIAL MEDIA MANAGER</small></b></div><div className="login-heading"><span>{isLogin ? 'WELCOME BACK' : 'GET STARTED'}</span><h1>{isLogin ? 'Sign in to your account' : 'Create your account'}</h1><p>{isLogin ? 'Use your email or Workspace Employee ID.' : 'Create your account to start managing your brands.'}</p></div>
        <form onSubmit={submit}><label>{isLogin ? 'Email address or Employee ID' : 'Email address'}<div className="field"><span>✉</span><input type={isLogin ? 'text' : 'email'} value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required placeholder={isLogin ? 'you@company.com or EMP001' : 'you@company.com'} /></div></label><label>Password<div className="field"><span>●</span><input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete={isLogin ? 'current-password' : 'new-password'} required minLength={8} placeholder="Minimum 8 characters" /><button type="button" className="show-btn" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></div></label>{isLogin && <button type="button" className="forgot" onClick={forgot} disabled={loading}>Forgot password?</button>}<button className="signin" disabled={loading}>{loading ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}</button></form>
        {message && <div className={`login-message ${message.includes('sent') || message.includes('created') ? 'ok' : ''}`}>{message}</div>}<div className="login-switch">{isLogin ? <>Don&apos;t have an account? <button type="button" onClick={switchMode}>Create account</button></> : <>Already have an account? <button type="button" onClick={switchMode}>Sign in</button></>}</div><div className="login-footer">Protected by Supabase authentication</div>
      </section>
    </div>
  </main>;
}
