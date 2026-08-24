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
    const response = await fetch('/api/auth/session', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'Your session could not be validated.');
    return data;
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true); setMessage('');
    try {
      const value = identifier.trim();
      if (!value) throw new Error(loginType === 'admin' ? 'Enter your admin email address.' : 'Enter your Employee ID.');
      if (loginType === 'admin' && !value.includes('@')) throw new Error('Admin login requires an email address.');
      const authEmail = loginType === 'team' ? `${value.toLowerCase()}${EMPLOYEE_DOMAIN}` : value;
      const { data, error } = await getSupabase().auth.signInWithPassword({ email: authEmail, password });
      if (error) throw error;
      const token = data.session?.access_token;
      if (!token) throw new Error('Login succeeded but no session was created.');
      await validateSession(token);
      window.location.assign('/dashboard');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally { setLoading(false); }
  }

  async function forgot() {
    if (loginType === 'team') { setMessage('Employee ID password reset must be handled by the workspace owner or admin.'); return; }
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

  return <>
    <style jsx global>{`
      .login-page{min-height:100vh;display:grid;place-items:center;padding:28px;background:linear-gradient(135deg,#f7fafc 0%,#eef7f5 100%);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17202b}
      .login-shell{width:min(100%,1060px);min-height:640px;display:grid;grid-template-columns:1fr 1fr;background:#fff;border:1px solid #e4e9ef;border-radius:24px;overflow:hidden;box-shadow:0 28px 80px rgba(16,24,40,.12)}
      .login-side{padding:46px 44px;background:linear-gradient(150deg,#087f7b,#0b6968);color:#fff;display:flex;flex-direction:column;justify-content:space-between}
      .login-brand{display:flex;align-items:center;gap:12px}.login-logo{width:46px;height:46px;border-radius:13px;display:grid;place-items:center;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.22);font-weight:900;letter-spacing:-.04em}.login-brand b{display:block;font-size:16px;letter-spacing:.02em}.login-brand small{display:block;margin-top:4px;font-size:8px;letter-spacing:.14em;opacity:.72}
      .login-side-copy{max-width:360px}.login-side-copy>span{font-size:9px;letter-spacing:.16em;font-weight:800;opacity:.72}.login-side-copy h2{margin:10px 0 12px;font-size:34px;line-height:1.08;letter-spacing:-.035em}.login-side-copy p{margin:0;color:rgba(255,255,255,.8);font-size:13px;line-height:1.65}.login-side-copy>div{display:grid;gap:10px;margin-top:28px}.login-side-copy>div b{font-size:11px;font-weight:700;color:#fff}
      .login-card{padding:48px 52px;display:flex;flex-direction:column;justify-content:center}.mobile-brand{display:none}.login-heading>span{font-size:9px;letter-spacing:.15em;font-weight:800;color:#087f7b}.login-heading h1{margin:8px 0 8px;font-size:31px;line-height:1.15;letter-spacing:-.035em;color:#17202b}.login-heading p{margin:0 0 22px;color:#667085;font-size:12px;line-height:1.55}
      .login-switch{display:grid!important;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px}.login-switch button{height:40px;border:1px solid #dfe6ec;border-radius:10px;background:#fff;color:#475467;font-size:11px;font-weight:800}.login-switch button:hover{background:#f7fafb}.login-switch button.active{background:#edf8f7;border-color:#78bdb9;color:#087f7b;box-shadow:0 0 0 2px rgba(8,127,123,.05)}
      .login-card form{display:grid;gap:15px}.login-card label{display:grid;gap:7px;font-size:11px;font-weight:750;color:#344054}.field{height:46px;display:flex;align-items:center;gap:9px;border:1px solid #d9e1e8;border-radius:10px;background:#fff;padding:0 12px;transition:.16s ease}.field:focus-within{border-color:#4fa7a3;box-shadow:0 0 0 3px rgba(8,127,123,.09)}.field>span{width:20px;color:#8290a0;font-size:11px;font-weight:800;text-align:center}.field input{width:100%;border:0;outline:0;background:transparent;color:#17202b;font-size:12px;min-width:0}.field input::placeholder{color:#a2acb8}.show-btn{border:0;background:transparent;color:#087f7b;font-size:10px;font-weight:800;padding:5px}.forgot{justify-self:end;background:none;color:#087f7b;font-size:10px;font-weight:800;padding:0}.forgot:disabled{opacity:.5}.signin{height:46px;border-radius:10px;background:#087f7b;color:#fff;font-size:12px;font-weight:800;box-shadow:0 7px 18px rgba(8,127,123,.16)}.signin:hover:not(:disabled){background:#066e6b;transform:translateY(-1px)}.signin:disabled{opacity:.55;cursor:not-allowed}.login-message{margin-top:14px;padding:10px 12px;border-radius:10px;background:#fff1f0;color:#b42318;font-size:10px;font-weight:700;line-height:1.45}.login-message.ok{background:#edf8f1;color:#14804a}.login-footer{margin-top:22px;padding-top:16px;border-top:1px solid #edf1f4;color:#8a95a3;font-size:9px;line-height:1.5;text-align:center}
      @media(max-width:860px){.login-shell{grid-template-columns:1fr;min-height:auto;max-width:560px}.login-side{display:none}.mobile-brand{display:flex;align-items:center;gap:10px;margin-bottom:24px}.mobile-brand b{font-size:14px}.mobile-brand small{display:block;margin-top:3px;font-size:7px;letter-spacing:.13em;color:#8b95a2}.mobile-brand .login-logo{width:40px;height:40px;background:#087f7b;color:#fff;border:0}.login-card{padding:34px}.login-heading h1{font-size:28px}}
      @media(max-width:480px){.login-page{padding:12px}.login-shell{border-radius:18px}.login-card{padding:26px 20px}.login-heading h1{font-size:24px}.login-switch button{font-size:10px}.field{height:44px}.signin{height:44px}}
    `}</style>
    <main className="login-page">
      <div className="login-shell">
        <aside className="login-side">
          <div className="login-brand"><div className="login-logo">MD</div><div><b>MD HYGIENE</b><small>SOCIAL MEDIA MANAGER</small></div></div>
          <div className="login-side-copy"><span>WORKSPACE HUB</span><h2>Manage every brand from one place.</h2><p>Connect accounts, create content and publish across your workspaces.</p><div><b>✓ Workspace-based access</b><b>✓ Facebook &amp; Instagram</b><b>✓ Secure authentication</b></div></div>
        </aside>
        <section className="login-card">
          <div className="mobile-brand"><div className="login-logo">MD</div><b>MD HYGIENE<small>SOCIAL MEDIA MANAGER</small></b></div>
          <div className="login-heading"><span>{loginType === 'admin' ? 'ADMIN / OWNER LOGIN' : 'TEAM MEMBER LOGIN'}</span><h1>Sign in to your account</h1><p>{loginType === 'admin' ? 'Use your workspace admin or owner email.' : 'Use the Employee ID provided by your workspace admin.'}</p></div>
          <div className="login-switch"><button type="button" className={loginType === 'admin' ? 'active' : ''} onClick={() => { setLoginType('admin'); setIdentifier(''); setPassword(''); setMessage(''); }}>Admin / Owner</button><button type="button" className={loginType === 'team' ? 'active' : ''} onClick={() => { setLoginType('team'); setIdentifier(''); setPassword(''); setMessage(''); }}>Team Member</button></div>
          <form onSubmit={submit}>
            <label>{loginType === 'admin' ? 'Admin email address' : 'Employee ID'}<div className="field"><span>{loginType === 'admin' ? '✉' : 'ID'}</span><input type={loginType === 'admin' ? 'email' : 'text'} value={identifier} onChange={e => setIdentifier(e.target.value)} autoComplete="username" required placeholder={loginType === 'admin' ? 'you@company.com' : 'EMP001'} /></div></label>
            <label>Password<div className="field"><span>●</span><input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required minLength={8} placeholder="Minimum 8 characters" /><button type="button" className="show-btn" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></div></label>
            <button type="button" className="forgot" onClick={forgot} disabled={loading}>{loginType === 'admin' ? 'Forgot password?' : 'Need a password reset?'}</button>
            <button className="signin" disabled={loading}>{loading ? 'Please wait…' : 'Sign in'}</button>
          </form>
          {message && <div className={`login-message ${message.includes('sent') ? 'ok' : ''}`}>{message}</div>}
          <div className="login-footer">Accounts are created by the workspace administrator. Protected by Supabase authentication.</div>
        </section>
      </div>
    </main>
  </>;
}
