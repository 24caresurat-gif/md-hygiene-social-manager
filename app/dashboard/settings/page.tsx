'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
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

  return <AppShell title="Settings">
    <div className="page-head"><div><span className="eyebrow">WORKSPACE</span><h1>Workspace Settings</h1><p>Manage the selected workspace, team access and account preferences.</p></div></div>
    <section className="panel" style={{ padding: 24, maxWidth: 820 }}>
      <h2>Workspace</h2><p className="muted">Changes apply only to the selected workspace.</p>
      <div style={{ display: 'grid', gap: 14, marginTop: 20 }}>
        <label>Workspace Name<input value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></label>
        <label>Logo URL<input value={logo} onChange={e => setLogo(e.target.value)} placeholder="https://…" style={inputStyle} /></label>
        <button className="btn btn-primary" onClick={save}>Save Workspace</button>{msg && <div className="data-warning">{msg}</div>}
      </div>
    </section>
    <section className="panel" style={{ padding: 24, maxWidth: 820, marginTop: 20 }}>
      <span className="eyebrow">TEAM ACCESS</span><h2 style={{ marginTop: 6 }}>Employees &amp; Permissions</h2>
      <p className="muted">Create, assign, change roles, deactivate or remove employees from this workspace.</p>
      <button className="btn" onClick={() => location.href = '/dashboard/settings/access'} style={{ marginTop: 12 }}>Manage Employee Access →</button>
      <form onSubmit={createEmployee} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 20 }}>
        <label>Employee ID<input required value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} placeholder="EMP001" style={inputStyle} /></label>
        <label>Employee Name<input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Employee name" style={inputStyle} /></label>
        <label>Password<input required minLength={8} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Minimum 8 characters" style={inputStyle} /></label>
        <label>Role<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={inputStyle}><option value="member">Member</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label>
        <button className="btn btn-primary" disabled={creating} style={{ gridColumn: '1 / -1' }}>{creating ? 'Creating…' : '+ Create Employee Login'}</button>
      </form>
      {teamMsg && <div className="data-warning" style={{ marginTop: 14 }}>{teamMsg}</div>}
      <div style={{ marginTop: 24, borderTop: '1px solid #e7edf0', paddingTop: 18 }}>
        {members.length === 0 ? <p className="muted">No employees assigned to this workspace yet.</p> : <div style={{ display: 'grid', gap: 10 }}>{members.map(member => <div key={member.id} style={rowStyle}>
          <div><strong>{member.profiles?.full_name || 'Employee'}</strong><div className="muted" style={{ fontSize: 11 }}>{member.employee_id} · {member.role}</div></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {member.role !== 'owner' && <select value={member.role} onChange={e => updateMember(member, { role: e.target.value })} style={smallSelect}><option value="member">Member</option><option value="manager">Manager</option><option value="admin">Admin</option></select>}
            {member.role !== 'owner' && <button className="btn" onClick={() => updateMember(member, { active: !member.active })}>{member.active ? 'Deactivate' : 'Activate'}</button>}
            {member.role !== 'owner' && <button className="btn" onClick={() => removeMember(member)} style={{ color: '#b42318' }}>Remove</button>}
          </div>
        </div>)}</div>}
      </div>
    </section>
    <section className="panel" style={{ padding: 24, maxWidth: 820, marginTop: 20 }}><h2>Account</h2><p className="muted">Signed in as <strong>{email || '—'}</strong></p><button className="btn" onClick={() => location.href = '/dashboard/accounts'}>Manage Connected Channels →</button></section>
  </AppShell>;
}

const inputStyle: React.CSSProperties = { display: 'block', width: '100%', padding: 12, border: '1px solid #dce6ea', borderRadius: 10, marginTop: 6, background: '#fff' };
const smallSelect: React.CSSProperties = { padding: '9px 10px', border: '1px solid #dce6ea', borderRadius: 10, background: '#fff', fontWeight: 800 };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 14px', border: '1px solid #e7edf0', borderRadius: 12 };
