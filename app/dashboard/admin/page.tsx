'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';

type Profile={full_name:string;role:string;active:boolean};
type Member={id:string;user_id:string;active:boolean;profiles?:Profile|null};
type Brand={id:string;name:string;slug:string};

function normalizeProfile(value: Profile|Profile[]|null|undefined): Profile|null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default function AdminPage(){
 const [brands,setBrands]=useState<Brand[]>([]),[members,setMembers]=useState<Member[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 async function load(){setLoading(true);setError('');try{const s=(await getSupabase().auth.getSession()).data.session;if(!s)throw new Error('Login required.');
  const [b,m]=await Promise.all([
   getSupabase().from('brands').select('id,name,slug').order('name'),
   getSupabase().from('workplace_members').select('id,user_id,active,profiles(full_name,role,active)').order('created_at')
  ]);if(b.error)throw b.error;if(m.error)throw m.error;setBrands(b.data||[]);setMembers((m.data||[]).map((row:any)=>({...row,profiles:normalizeProfile(row.profiles)})) as Member[]);
 }catch(e){setError(e instanceof Error?e.message:'Unable to load admin data.')}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 if(loading)return <main className="auth-page"><div className="muted">Loading admin…</div></main>;
 return <main className="app-shell"><section className="main-shell" style={{width:'100%'}}><header className="main-header"><strong>Admin Control Center</strong><button onClick={()=>void load()}>↻ Refresh</button></header><div className="dashboard-content"><h1>Workplaces & Staff</h1><p className="muted">Manage workplace access, staff assignments and publishing permissions.</p>{error?<div className="data-warning">{error}</div>:null}<div className="stat-grid"><article className="stat-card"><div><span>Workplaces</span><strong>{brands.length}</strong><small>Active workspaces</small></div></article><article className="stat-card"><div><span>Staff assignments</span><strong>{members.length}</strong><small>Current memberships</small></div></article></div><section className="recent-card" style={{marginTop:24}}><div className="section-head"><div><span>WORKPLACES</span><h2>Assigned Workspaces</h2></div></div>{brands.map(b=><div className="post-row" key={b.id}><div className="post-title"><strong>{b.name}</strong><small>{b.slug}</small></div><span>{members.filter(m=>m.id===b.id).length} staff</span><em>Active</em></div>)}</section><section className="recent-card" style={{marginTop:24}}><div className="section-head"><div><span>STAFF</span><h2>Workplace Members</h2></div></div>{members.length?members.map(m=><div className="post-row" key={m.id}><div className="post-title"><strong>{m.profiles?.full_name||m.user_id}</strong><small>{m.profiles?.role||'staff'}</small></div><span>{m.active?'Enabled':'Disabled'}</span><em>{m.profiles?.active?'Active':'Inactive'}</em></div>):<div className="empty-state"><strong>No staff assignments yet.</strong><span>Create staff users in Supabase Auth, then assign them to a workplace.</span></div>}</section></div></section></main>}
