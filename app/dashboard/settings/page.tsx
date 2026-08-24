'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';

type Member = { id: string; user_id: string; employee_id: string; role: string; active: boolean; profiles?: { full_name?: string } | null };

export default function SettingsPage() {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [logo, setLogo] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [teamMsg, setTeamMsg] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ employee_id: '', full_name: '', password: '', role: 'member' });

  async function sessionToken() {
    const session = (await getSupabase().auth.getSession()).data.session;
    if (!session) throw new Error('Session expired');
    return session.access_token;
  }

  async function loadMembers(workspaceId: string) {
    try {
      const token = await sessionToken();
      const r = await fetch(`/api/workspace-employees?workspace_id=${encodeURIComponent(workspaceId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Unable to load employees.');
      setMembers(d.members || []);
    } catch (e) { setTeamMsg(e instanceof Error ? e.message : 'Unable to load employees.'); }
  }

  useEffect(() => {
    const run = async () => {
      const saved = localStorage.getItem('mdsm:selectedWorkspaceId') || '';
      if (!saved) { location.href = '/dashboard'; return; }
      setId(saved);
      const s = await getSupabase().auth.getUser();
      setEmail(s.data.user?.email || '');
      const token = (await getSupabase().auth.getSession()).data.session?.access_token;
      if (token) {
        const r = await fetch('/api/brands', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const d = await r.json();
        const b = (d.brands || []).find((x: any) => x.id === saved);
        if (b) { setName(b.name || ''); setLogo(b.logo_url || ''); }
      }
      await loadMembers(saved);
    };
    void run();
  }, []);

  async function save() {
    setMsg('Saving…');
    try {
      const token = await sessionToken();
      const r = await fetch('/api/brands', { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: name.trim(), logo_url: logo.trim() || null }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Unable to save');
      setMsg('Workspace settings saved.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Unable to save settings.'); }
  }

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault(); setTeamMsg(''); setCreating(true);
    try {
      const token = await sessionToken();
      const r = await fetch('/api/workspace-employees', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: id, ...form }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Unable to create employee.');
      setForm({ employee_id: '', full_name: '', password: '', role: 'member' });
      setTeamMsg(`Employee ${d.member.employee_id} created successfully.`); await loadMembers(id);
    } catch (e) { setTeamMsg(e instanceof Error ? e.message : 'Unable to create employee.'); }
    finally { setCreating(false); }
  }

  async function updateMember(member: Member, patch: { active?: boolean; role?: string }) {
    try {
      const token = await sessionToken();
      const r = await fetch('/api/admin/memberships', { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: id, member_id: member.id, ...patch }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Unable to update employee.');
      setMembers(current => current.map(m => m.id === member.id ? { ...m, ...d.membership } : m));
      setTeamMsg(`${member.employee_id} updated successfully.`);
    } catch (e) { setTeamMsg(e instanceof Error ? e.message : 'Unable to update employee.'); }
  }

  async function removeMember(member: Member) {
    if (!window.confirm(`Remove ${member.employee_id} from this workspace?`)) return;
    try {
      const token = await sessionToken();
      const r = await fetch('/api/admin/memberships', { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: id, member_id: member.id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Unable to remove employee.');
      setMembers(current => current.filter(m => m.id !== member.id)); setTeamMsg(`${member.employee_id} removed from this workspace.`);
    } catch (e) { setTeamMsg(e instanceof Error ? e.message : 'Unable to remove employee.'); }
  }

  return <main className="workspace-settings-shell">
    <style jsx>{`
      .workspace-settings-shell{min-height:100vh;background:#f7fafb;color:#17202b;padding:28px 32px 48px}
      .settings-inner{max-width:1180px;margin:0 auto}
      .settings-top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:24px}
      .eyebrow{font-size:10px;letter-spacing:.14em;color:#078b87;font-weight:950;text-transform:uppercase}
      .settings-top h1{margin:6px 0 7px;font-size:32px;letter-spacing:-.04em}
      .settings-top p{margin:0;color:#71808a;font-size:12px;line-height:1.6}
      .back-btn{border:1px solid #dce6ea;background:#fff;color:#35424c;border-radius:10px;padding:10px 13px;font-size:10px;font-weight:900;cursor:pointer}
      .grid{display:grid;gap:18px;max-width:920px}
      .panel{background:#fff;border:1px solid #e0e8eb;border-radius:18px;padding:22px;box-shadow:0 10px 30px rgba(15,23,42,.04)}
      .panel h2{margin:0 0 5px;font-size:18px}.muted{color:#76838d;font-size:11px}
      .fields{display:grid;gap:14px;margin-top:18px}.field{display:grid;gap:6px;font-size:11px;font-weight:850}
      .input{display:block;width:100%;padding:12px;border:1px solid #dce6ea;border-radius:10px;background:#fff;font-size:12px;outline:none}.input:focus{border-color:#86c9c5;box-shadow:0 0 0 3px rgba(7,139,135,.08)}
      .actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:18px}.btn{border:1px solid #dce6ea;background:#fff;color:#35424c;border-radius:10px;padding:10px 12px;font-size:10px;font-weight:900;cursor:pointer}.btn-primary{background:#17202b;color:#fff;border-color:#17202b}.btn-danger{color:#b42318;border-color:#f0caca;background:#fff7f6}.btn:disabled{opacity:.55;cursor:wait}
      .team-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.team-grid .full{grid-column:1/-1}
      .member-list{display:grid;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid #edf1f2}.member-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 14px;border:1px solid #e7edf0;border-radius:12px}.member-copy strong{display:block;font-size:12px}.member-copy span{display:block;color:#7d8992;font-size:10px;margin-top:3px}.member-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}.role-select{padding:9px 10px;border:1px solid #dce6ea;border-radius:10px;background:#fff;font-weight:800;font-size:10px}
      .notice{margin-top:12px;padding:10px 12px;border:1px solid #d7ebe8;background:#f3fbfa;color:#1e5e59;border-radius:10px;font-size:11px;font-weight:750}
      .account-row{display:flex;align-items:center;justify-content:space-between;gap:14px}.account-email{font-size:12px;font-weight:850}
      @media(max-width:780px){.workspace-settings-shell{padding:20px 15px 36px}.settings-top{flex-direction:column}.team-grid{grid-template-columns:1fr}.team-grid .full{grid-column:auto}.member-row,.account-row{align-items:flex-start;flex-direction:column}.member-actions{justify-content:flex-start}}
    `}</style>
    <div className="settings-inner">
      <header className="settings-top"><div><span className="eyebrow">WORKSPACE SETTINGS</span><h1>Workspace Settings</h1><p>Manage only this workspace. Dashboard navigation stays outside this focused settings area.</p></div><button className="back-btn" onClick={() => location.href = '/dashboard'}>← Back to Workspace</button></header>
      <div className="grid">
        <section className="panel"><h2>Workspace</h2><p className="muted">Changes apply only to the selected workspace.</p><div className="fields"><label className="field">Workspace Name<input className="input" value={name} onChange={e => setName(e.target.value)} /></label><label className="field">Logo URL<input className="input" value={logo} onChange={e => setLogo(e.target.value)} placeholder="https://…" /></label></div><div className="actions"><button className="btn btn-primary" onClick={save}>Save Workspace</button>{msg && <div className="notice">{msg}</div>}</div></section>
        <section className="panel"><span className="eyebrow">TEAM ACCESS</span><h2 style={{ marginTop: 6 }}>Employees &amp; Permissions</h2><p className="muted">Create employees, change roles, activate or remove them, and open the full permission matrix.</p><div className="actions"><button className="btn" onClick={() => location.href = '/dashboard/settings/access'}>Manage Employee Access →</button></div><form onSubmit={createEmployee} className="team-grid"><label className="field">Employee ID<input required className="input" value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} placeholder="EMP001" /></label><label className="field">Employee Name<input required className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Employee name" /></label><label className="field">Password<input required minLength={8} type="password" className="input" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Minimum 8 characters" /></label><label className="field">Role<select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="member">Member</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label><button className="btn btn-primary full" disabled={creating}>{creating ? 'Creating…' : '+ Create Employee Login'}</button></form>{teamMsg && <div className="notice">{teamMsg}</div>}
        <div className="member-list">{members.length===0 ? <div className="muted">No employees assigned to this workspace yet.</div> : members.map(member => <div key={member.id} className="member-row"><div className="member-copy"><strong>{member.profiles?.full_name || 'Employee'}</strong><span>{member.employee_id} · {member.role} · {member.active ? 'Active' : 'Inactive'}</span></div><div className="member-actions">{member.role !== 'owner' && <select className="role-select" value={member.role} onChange={e => updateMember(member,{role:e.target.value})}><option value="member">Member</option><option value="manager">Manager</option><option value="admin">Admin</option></select>}{member.role !== 'owner' && <button className="btn" onClick={() => updateMember(member,{active:!member.active})}>{member.active?'Deactivate':'Activate'}</button>}{member.role !== 'owner' && <button className="btn btn-danger" onClick={() => removeMember(member)}>Remove</button>}</div></div>)}</div></section>
        <section className="panel"><h2>Account</h2><div className="account-row"><div><div className="account-email">{email || '—'}</div><div className="muted" style={{ marginTop: 3 }}>Signed-in account</div></div><button className="btn" onClick={() => location.href = '/dashboard/accounts'}>Manage Connected Channels →</button></div></section>
      </div>
    </div>
  </main>;
}
