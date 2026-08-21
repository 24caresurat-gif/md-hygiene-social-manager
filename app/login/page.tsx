'use client';

import { FormEvent, useState } from 'react';
import { getSupabase } from '../../lib/supabase-browser';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const supabase = getSupabase();
      const result = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === 'signup') {
        setMessage('Account created. Check your email if confirmation is enabled.');
      } else {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('active')
          .eq('id', result.data.user?.id || '')
          .maybeSingle();
        if (profileError) throw profileError;
        if (profile?.active === false) {
          await supabase.auth.signOut();
          throw new Error('Your account is inactive. Please contact an administrator.');
        }
        window.location.assign('/dashboard');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function forgot() {
    if (!email.trim()) {
      setMessage('Enter your email address first.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setMessage('Password reset email sent. Check your inbox.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to send password reset email.');
    } finally {
      setLoading(false);
    }
  }

  const isLogin = mode === 'login';
  const switchMode = () => {
    setMode(isLogin ? 'signup' : 'login');
    setMessage('');
  };

  return (
    <main className="login-page">
      <div className="login-shell">
        <aside className="login-side">
          <div className="login-brand">
            <div className="login-logo">MD</div>
            <div><b>MD HYGIENE</b><small>SOCIAL MEDIA MANAGER</small></div>
          </div>
          <div className="login-side-copy">
            <span>WORKSPACE HUB</span>
            <h2>Manage every brand from one place.</h2>
            <p>Connect accounts, create content and publish across your workspaces.</p>
            <div>
              <b>✓ Workspace-based access</b>
              <b>✓ Facebook &amp; Instagram</b>
              <b>✓ Secure authentication</b>
            </div>
          </div>
        </aside>
        <section className="login-card">
          <div className="mobile-brand"><div className="login-logo">MD</div><b>MD HYGIENE<small>SOCIAL MEDIA MANAGER</small></b></div>
          <div className="login-heading">
            <span>{isLogin ? 'WELCOME BACK' : 'GET STARTED'}</span>
            <h1>{isLogin ? 'Sign in to your account' : 'Create your account'}</h1>
            <p>{isLogin ? 'Continue to your Workspace Hub.' : 'Create your account to start managing your brands.'}</p>
          </div>
          <form onSubmit={submit}>
            <label>Email address<div className="field"><span>✉</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="you@company.com" /></div></label>
            <label>Password<div className="field"><span>●</span><input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isLogin ? 'current-password' : 'new-password'} required minLength={6} placeholder="Enter your password" /><button type="button" className="show-btn" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></div></label>
            {isLogin && <button type="button" className="forgot" onClick={forgot} disabled={loading}>Forgot password?</button>}
            <button className="signin" disabled={loading}>{loading ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}</button>
          </form>
          {message && <div className={`login-message ${message.includes('sent') || message.includes('created') ? 'ok' : ''}`}>{message}</div>}
          <div className="login-switch">{isLogin ? <>Don&apos;t have an account? <button type="button" onClick={switchMode}>Create account</button></> : <>Already have an account? <button type="button" onClick={switchMode}>Sign in</button></>}</div>
          <div className="login-footer">Protected by Supabase authentication</div>
        </section>
      </div>
      <style jsx>{`*{box-sizing:border-box}.login-page{min-height:100vh;display:grid;place-items:center;padding:28px;background:radial-gradient(circle at 10% 10%,#e7f7f5 0,#f7fafc 38%,#eef2f6 100%);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.login-shell{width:min(980px,100%);min-height:610px;display:grid;grid-template-columns:1fr 1fr;background:#fff;border:1px solid #e3e9ee;border-radius:28px;overflow:hidden;box-shadow:0 28px 80px rgba(15,23,42,.13)}.login-side{background:linear-gradient(145deg,#0d3039,#087d79);color:#fff;padding:42px;display:flex;flex-direction:column}.login-brand{display:flex;align-items:center;gap:12px}.login-logo{width:46px;height:46px;border-radius:14px;background:rgba(255,255,255,.14);display:grid;place-items:center;font-weight:950}.login-brand b{display:block;font-size:14px}.login-brand small{display:block;font-size:8px;letter-spacing:.12em;color:#bce5e2;margin-top:4px}.login-side-copy{margin-top:auto}.login-side-copy>span,.login-heading>span{font-size:9px;letter-spacing:.16em;font-weight:900;color:#65d6d0}.login-side-copy h2{font-size:34px;line-height:1.08;letter-spacing:-.04em;margin:12px 0}.login-side-copy p{color:#c6dddf;line-height:1.6;font-size:13px;max-width:330px}.login-side-copy>div{display:grid;gap:10px;margin-top:28px}.login-side-copy b{font-size:11px;font-weight:750;color:#e4f7f5}.login-card{padding:52px 50px;display:flex;flex-direction:column;justify-content:center}.mobile-brand{display:none}.login-heading h1{font-size:31px;letter-spacing:-.04em;margin:8px 0 7px;color:#17202b}.login-heading p{font-size:12px;color:#7b8794;margin:0 0 28px}.login-card form{display:grid;gap:15px}.login-card label{display:grid;gap:7px;font-size:11px;font-weight:800;color:#3a4652}.field{height:48px;border:1px solid #dce3e9;border-radius:12px;display:flex;align-items:center;gap:9px;padding:0 12px;background:#fbfcfd}.field:focus-within{border-color:#078b87;box-shadow:0 0 0 3px #e3f5f3;background:#fff}.field>span{color:#8a96a2;font-size:12px}.field input{border:0;outline:0;background:transparent;flex:1;min-width:0;font-size:13px;color:#17202b}.show-btn{border:0;background:transparent;color:#078b87;font-size:10px;font-weight:900}.forgot{border:0;background:none;color:#078b87;text-align:right;font-size:10px;font-weight:850;margin-top:-5px}.signin{height:48px;border:0;border-radius:12px;background:#078b87;color:#fff;font-size:12px;font-weight:900;box-shadow:0 10px 22px rgba(7,139,135,.2)}.signin:disabled,.forgot:disabled{opacity:.6;cursor:not-allowed}.login-message{margin-top:16px;padding:11px 12px;border-radius:10px;background:#fff0f0;color:#b42318;font-size:11px;font-weight:700}.login-message.ok{background:#edf9f1;color:#087443}.login-switch{text-align:center;color:#7b8794;font-size:11px;margin-top:22px}.login-switch button{border:0;background:none;color:#078b87;font-weight:900}.login-footer{text-align:center;color:#a0aab5;font-size:9px;margin-top:25px}.mobile-brand{align-items:center;gap:10px;margin-bottom:30px}.mobile-brand b{font-size:13px}.mobile-brand small{display:block;color:#8a95a2;font-size:7px;letter-spacing:.12em;margin-top:3px}@media(max-width:720px){.login-page{padding:14px}.login-shell{display:block;min-height:auto;border-radius:22px}.login-side{display:none}.login-card{padding:32px 24px}.mobile-brand{display:flex}.login-heading h1{font-size:27px}}`}</style>
    </main>
  );
}
