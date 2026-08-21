'use client';
import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../../lib/supabase-browser';

type Profile={full_name:string;role:string;active:boolean};
type Member={id:string;user_id:string;workplace_id:string;active:boolean;profiles?:Profile|null};
type Brand={id:string;name:string;slug:string};
type Permission={id?:string;user_id:string;workplace_id:string;platform:string;can_view:boolean;can_create:boolean;can_edit:boolean;can_publish:boolean};
const platforms=['facebook','instagram','google_business'] as const;
const labels:Record<string,string>={facebook:'Facebook',instagram:'Instagram',google_business:'Google Business'};
function normalizeProfile(value:Profile|Profile[]|null|undefined):Profile|null{return Array.isArray(value)?value[0]??null:value??null;}
function emptyPermission(user_id:string,workplace_id:string,platform:string):Permission{return{user_id,workplace_id,platform,can_view:false,can_create:false,can_edit:false,can_publish:false};}

export default function AdminPage(){
 const sb=getSupabase();
 const[brands,setBrands]=useState<Brand[]>([]),[members,setMembers]=useState<Member[]>([]),[permissions,setPermissions]=useState<Permission[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const[selectedUser,setSelectedUser]=useState(''),[selectedWorkspace,setSelectedWorkspace]=useState('');
 const selectedMember=useMemo(()=>members.find(m=>m.user_id===selectedUser)??null,[members,selectedUser]);
 const selectedProfile=selectedMember?.profiles??null;
 async function load(){setLoading(true);setError('');try{const s=(await sb.auth.getSession()).data.session;if(!s)throw new Error('Login required.');
  const[b,m,p]=await Promise.all([
   sb.from('brands').select('id,name,slug').order('name'),
   sb.from('workplace_members').select('id,user_id,workplace_id,active,profiles(full_name,role,active)').order('created_at'),
   sb.from('workplace_permissions').select('id,user_id,workplace_id,platform,can_view,can_create,can_edit,can_publish')
  ]);if(b.error)throw b.error;if(m.error)throw m.error;if(p.error)throw p.error;
  const nextMembers=(m.data||[]).map((row:any)=>({...row,profiles:normalizeProfile(row.profiles)})) as Member[];setBrands(b.data||[]);setMembers(nextMembers);setPermissions((p.data||[]) as Permission[]);
  if(!selectedUser&&nextMembers[0])setSelectedUser(nextMembers[0].user_id);if(!selectedWorkspace&&nextMembers[0])setSelectedWorkspace(nextMembers[0].workplace_id);
 }catch(e){setError(e instanceof Error?e.message:'Unable to load admin data.')}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 const selectedWorkspaceName=brands.find(b=>b.id===selectedWorkspace)?.name||'';
 function getPerm(platform:string){return permissions.find(p=>p.user_id===selectedUser&&p.workplace_id===selectedWorkspace&&p.platform===platform)||emptyPermission(selectedUser,selectedWorkspace,platform);}
 function setPerm(platform:string,key:'can_view'|'can_create'|'can_edit'|'can_publish',value:boolean){setPermissions(prev=>{const idx=prev.findIndex(p=>p.user_id===selectedUser&&p.workplace_id===selectedWorkspace&&p.platform===platform);if(idx<0)return[...prev,{...emptyPermission(selectedUser,selectedWorkspace,platform),[key]:value}];const next=[...prev];next[idx]={...next[idx],[key]:value};return next;});}
 async function saveAccess(){setSaving(true);setError('');setNotice('');try{const s=(await sb.auth.getSession()).data.session;if(!s)throw new Error('Login required.');if(!selectedUser||!selectedWorkspace)throw new Error('Select staff and workplace.');const token=s.access_token;
  const mr=await fetch('/api/admin/memberships',{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({user_id:selectedUser,workplace_id:selectedWorkspace})});const mj=await mr.json();if(!mr.ok)throw new Error(mj.error||'Unable to assign workplace.');
  for(const platform of platforms){const pr=getPerm(platform);const r=await fetch('/api/admin/permissions',{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({user_id:selectedUser,workplace_id:selectedWorkspace,platform,can_view:pr.can_view,can_create:pr.can_create,can_edit:pr.can_edit,can_publish:pr.can_publish})});const j=await r.json();if(!r.ok)throw new Error(j.error||`Unable to save ${platform} permission.`)}
  setNotice('Access saved successfully.');await load();
 }catch(e){setError(e instanceof Error?e.message:'Unable to save access.')}finally{setSaving(false)}}
 if(loading)return <main className="auth-page"><div className="muted">Loading admin…</div></main>;
 const uniqueStaff=[...new Map(members.map(m=>[m.user_id,m])).values()];
 return <main className="app-shell"><section className="main-shell" style={{width:'100%'}}><header className="main-header"><strong>Admin Control Center</strong><button onClick={()=>void load()}>↻ Refresh</button></header><div className="dashboard-content"><h1>Staff & Workplace Access</h1><p className="muted">Assign staff to a workplace and control exactly which platforms and actions they can use.</p>{error?<div className="data-warning">{error}</div>:null}{notice?<div className="data-success">{notice}</div>:null}
 <div className="stat-grid"><article className="stat-card"><div><span>Workplaces</span><strong>{brands.length}</strong><small>Available workspaces</small></div></article><article className="stat-card"><div><span>Staff assignments</span><strong>{members.length}</strong><small>Current memberships</small></div></article></div>
 <section className="recent-card" style={{marginTop:24}}><div className="section-head"><div><span>ACCESS CONTROL</span><h2>Assign Staff</h2></div></div><div className="dashboard-grid" style={{gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:16}}><label className="field"><span>Staff</span><select value={selectedUser} onChange={e=>setSelectedUser(e.target.value)}><option value="">Select staff</option>{uniqueStaff.map(m=><option key={m.user_id} value={m.user_id}>{m.profiles?.full_name||m.user_id} · {m.profiles?.role||'staff'}</option>)}</select></label><label className="field"><span>Workplace</span><select value={selectedWorkspace} onChange={e=>setSelectedWorkspace(e.target.value)}><option value="">Select workplace</option>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
 <div style={{marginTop:20,overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th style={{textAlign:'left',padding:10}}>Platform</th><th>View</th><th>Create</th><th>Edit</th><th>Publish</th></tr></thead><tbody>{platforms.map(platform=>{const p=getPerm(platform);return <tr key={platform}><td style={{padding:10,fontWeight:600}}>{labels[platform]}</td>{(['can_view','can_create','can_edit','can_publish'] as const).map(k=><td key={k} style={{textAlign:'center',padding:10}}><input type="checkbox" checked={Boolean(p[k])} onChange={e=>setPerm(platform,k,e.target.checked)} /></td>)}</tr>})}</tbody></table></div><div style={{display:'flex',justifyContent:'flex-end',marginTop:18}}><button className="primary-button" disabled={saving||!selectedUser||!selectedWorkspace} onClick={()=>void saveAccess()}>{saving?'Saving…':'Save Access'}</button></div></section>
 <section className="recent-card" style={{marginTop:24}}><div className="section-head"><div><span>WORKPLACES</span><h2>Staff by Workplace</h2></div></div>{brands.map(b=><div className="post-row" key={b.id}><div className="post-title"><strong>{b.name}</strong><small>{b.slug}</small></div><span>{members.filter(m=>m.workplace_id===b.id).length} staff</span><em>Active</em></div>)}</section>
 <section className="recent-card" style={{marginTop:24}}><div className="section-head"><div><span>CURRENT ASSIGNMENT</span><h2>{selectedWorkspaceName||'Select a workplace'}</h2></div></div><p className="muted">Choose a staff member and workplace above, set the matrix, then save. Publishing remains approval-controlled.</p></section>
 </div></section></main>}
