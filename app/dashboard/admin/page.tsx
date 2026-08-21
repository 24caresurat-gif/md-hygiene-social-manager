'use client';
import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';

type Profile={full_name:string;role:string;active:boolean};
type Member={id:string;user_id:string;workplace_id:string;active:boolean;profiles?:Profile|null};
type Brand={id:string;name:string;slug:string};
type Staff=Profile&{id:string};
type Permission={id:string;user_id:string;workplace_id:string;platform:string;can_view:boolean;can_create:boolean;can_edit:boolean;can_publish:boolean};
type Platform='facebook'|'instagram'|'google_business';

function normalizeProfile(value:Profile|Profile[]|null|undefined):Profile|null{return Array.isArray(value)?value[0]??null:value??null}
const platforms:Platform[]=['facebook','instagram','google_business'];
const platformLabels:Record<Platform,string>={facebook:'Facebook',instagram:'Instagram',google_business:'Google Business'};

export default function AdminPage(){
 const [brands,setBrands]=useState<Brand[]>([]),[members,setMembers]=useState<Member[]>([]),[staff,setStaff]=useState<Staff[]>([]),[permissions,setPermissions]=useState<Permission[]>([]);
 const [selectedStaff,setSelectedStaff]=useState(''),[selectedBrand,setSelectedBrand]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [draftPermissions,setDraftPermissions]=useState<Record<Platform,{can_view:boolean;can_create:boolean;can_edit:boolean;can_publish:boolean}>>({
  facebook:{can_view:false,can_create:false,can_edit:false,can_publish:false},instagram:{can_view:false,can_create:false,can_edit:false,can_publish:false},google_business:{can_view:false,can_create:false,can_edit:false,can_publish:false}
 });
 async function load(){setLoading(true);setError('');setNotice('');try{const s=(await getSupabase().auth.getSession()).data.session;if(!s)throw new Error('Login required.');
  const headers={Authorization:`Bearer ${s.access_token}`};
  const [b,m,st,p]=await Promise.all([
   getSupabase().from('brands').select('id,name,slug').order('name'),
   getSupabase().from('workplace_members').select('id,user_id,workplace_id,active,profiles(full_name,role,active)').order('created_at'),
   fetch('/api/admin/staff',{headers}).then(async r=>({ok:r.ok,data:await r.json()})),
   fetch('/api/admin/permissions',{headers}).then(async r=>({ok:r.ok,data:await r.json()}))
  ]);
  if(b.error)throw b.error;if(m.error)throw m.error;if(!st.ok)throw new Error(st.data?.error||'Unable to load staff.');if(!p.ok)throw new Error(p.data?.error||'Unable to load permissions.');
  setBrands(b.data||[]);setMembers((m.data||[]).map((row:any)=>({...row,profiles:normalizeProfile(row.profiles)})) as Member[]);setStaff((st.data.staff||[]) as Staff[]);setPermissions((p.data.permissions||[]) as Permission[]);
 }catch(e){setError(e instanceof Error?e.message:'Unable to load admin data.')}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 const assignedMembers=useMemo(()=>members.filter(m=>m.user_id===selectedStaff),[members,selectedStaff]);
 function loadSelection(userId:string,brandId:string){setSelectedStaff(userId);setSelectedBrand(brandId);const next:any={facebook:{can_view:false,can_create:false,can_edit:false,can_publish:false},instagram:{can_view:false,can_create:false,can_edit:false,can_publish:false},google_business:{can_view:false,can_create:false,can_edit:false,can_publish:false}};permissions.filter(p=>p.user_id===userId&&p.workplace_id===brandId).forEach(p=>{if(platforms.includes(p.platform as Platform))next[p.platform]={can_view:p.can_view,can_create:p.can_create,can_edit:p.can_edit,can_publish:p.can_publish}});setDraftPermissions(next)}
 async function assign(){if(!selectedStaff||!selectedBrand)return;setSaving(true);setError('');setNotice('');try{const s=(await getSupabase().auth.getSession()).data.session;if(!s)throw new Error('Login required.');const headers={'Content-Type':'application/json',Authorization:`Bearer ${s.access_token}`};const r=await fetch('/api/admin/memberships',{method:'PUT',headers,body:JSON.stringify({user_id:selectedStaff,workplace_id:selectedBrand})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to assign workplace.');for(const platform of platforms){const pr=await fetch('/api/admin/permissions',{method:'PUT',headers,body:JSON.stringify({user_id:selectedStaff,workplace_id:selectedBrand,platform,...draftPermissions[platform]})});const pd=await pr.json();if(!pr.ok)throw new Error(pd.error||`Unable to save ${platform} permission.`)}setNotice('Workplace and platform permissions saved.');await load()}catch(e){setError(e instanceof Error?e.message:'Unable to save access.')}finally{setSaving(false)}}
 if(loading)return <main className="auth-page"><div className="muted">Loading admin…</div></main>;
 return <main className="app-shell"><section className="main-shell" style={{width:'100%'}}><header className="main-header"><strong>Admin Control Center</strong><button onClick={()=>void load()}>↻ Refresh</button></header><div className="dashboard-content"><h1>Workplaces & Staff</h1><p className="muted">Assign each staff member to a workplace and control exactly which platforms and actions they can use.</p>{error?<div className="data-warning">{error}</div>:null}{notice?<div className="data-success">{notice}</div>:null}
 <div className="stat-grid"><article className="stat-card"><div><span>Workplaces</span><strong>{brands.length}</strong><small>Available workspaces</small></div></article><article className="stat-card"><div><span>Staff</span><strong>{staff.length}</strong><small>Admin-managed accounts</small></div></article><article className="stat-card"><div><span>Assignments</span><strong>{members.length}</strong><small>Active workplace memberships</small></div></article></div>
 <section className="recent-card" style={{marginTop:24,padding:24}}><div className="section-head"><div><span>ACCESS MANAGER</span><h2>Assign Workplace & Permissions</h2></div></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:14,marginTop:16}}><label className="field"><span>Staff member</span><select value={selectedStaff} onChange={e=>{const u=e.target.value;const first=members.find(m=>m.user_id===u)?.workplace_id||'';loadSelection(u,first)}}><option value="">Select staff</option>{staff.map(s=><option key={s.id} value={s.id}>{s.full_name||s.id} ({s.role})</option>)}</select></label><label className="field"><span>Workplace</span><select value={selectedBrand} onChange={e=>loadSelection(selectedStaff,e.target.value)} disabled={!selectedStaff}><option value="">Select workplace</option>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
  {selectedStaff&&selectedBrand?<div style={{marginTop:22,display:'grid',gap:14}}>{platforms.map(platform=><div key={platform} style={{border:'1px solid #e4eaee',borderRadius:14,padding:16}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><div><strong>{platformLabels[platform]}</strong><div className="muted">Controls for this workplace</div></div><label style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={draftPermissions[platform].can_view} onChange={e=>setDraftPermissions(v=>({...v,[platform]:{...v[platform],can_view:e.target.checked}}))}/> View</label></div><div style={{display:'flex',gap:18,flexWrap:'wrap',marginTop:14}}>{(['can_create','can_edit','can_publish'] as const).map(key=><label key={key} style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={draftPermissions[platform][key]} onChange={e=>setDraftPermissions(v=>({...v,[platform]:{...v[platform],[key]:e.target.checked}}))}/>{key.replace('can_','').replace('_',' ')}</label>)}</div></div>)}<button className="primary-btn" disabled={saving} onClick={()=>void assign()}>{saving?'Saving…':'Save Access & Permissions'}</button></div>:<div className="empty-state" style={{marginTop:18}}><strong>Select a staff member and workplace.</strong><span>Then set Facebook, Instagram and Google Business permissions.</span></div>}
 </section>
 <section className="recent-card" style={{marginTop:24}}><div className="section-head"><div><span>WORKPLACES</span><h2>Assigned Workspaces</h2></div></div>{brands.map(b=><div className="post-row" key={b.id}><div className="post-title"><strong>{b.name}</strong><small>{b.slug}</small></div><span>{members.filter(m=>m.workplace_id===b.id).length} staff</span><em>Active</em></div>)}</section>
 <section className="recent-card" style={{marginTop:24}}><div className="section-head"><div><span>STAFF</span><h2>Workplace Members</h2></div></div>{members.length?members.map(m=><div className="post-row" key={m.id}><div className="post-title"><strong>{m.profiles?.full_name||m.user_id}</strong><small>{brands.find(b=>b.id===m.workplace_id)?.name||m.workplace_id}</small></div><span>{m.active?'Enabled':'Disabled'}</span><em>{m.profiles?.active?'Active':'Inactive'}</em></div>):<div className="empty-state"><strong>No staff assignments yet.</strong><span>Assign staff to a workplace above.</span></div>}</section>
 </div></section></main>}
