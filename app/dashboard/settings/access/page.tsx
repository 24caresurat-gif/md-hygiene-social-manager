'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { getSupabase } from '../../../../lib/supabase-browser';

type Member={id:string;user_id:string;employee_id:string;role:string;active:boolean;profiles?:{full_name?:string}|null};
type Permission={module:string;can_view:boolean;can_create:boolean;can_edit:boolean;can_submit:boolean;can_approve:boolean;can_publish:boolean;can_manage:boolean};
type Access={role:string;is_owner_or_admin:boolean};

const modules=[
 ['dashboard','Dashboard'],['content','Content / Create Post'],['creative','Creative Intelligence'],['drafts','Drafts'],['calendar','Calendar'],['approval','Approvals'],['publishing','Publishing History'],['analytics','Analytics'],['social_accounts','Social Accounts'],['team','Team Management']
] as const;
const actions=['can_view','can_create','can_edit','can_submit','can_approve','can_publish','can_manage'] as const;
const actionLabels:Record<string,string>={can_view:'View',can_create:'Create',can_edit:'Edit',can_submit:'Submit',can_approve:'Approve',can_publish:'Publish',can_manage:'Manage'};

export default function EmployeeAccessPage(){
 const[id,setId]=useState(''),[members,setMembers]=useState<Member[]>([]),[selected,setSelected]=useState(''),[access,setAccess]=useState<Access|null>(null),[permissions,setPermissions]=useState<Record<string,Permission>>({}),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 const selectedMember=useMemo(()=>members.find(m=>m.user_id===selected)||null,[members,selected]);
 async function token(){const s=(await getSupabase().auth.getSession()).data.session;if(!s)throw new Error('Session expired');return s.access_token}
 async function load(){
  setLoading(true);setMessage('');
  try{
   const saved=localStorage.getItem('mdsm:selectedWorkspaceId')||''; if(!saved){location.href='/dashboard';return}
   setId(saved);const t=await token();
   const accessRes=await fetch(`/api/workspace-access?workspace_id=${encodeURIComponent(saved)}`,{headers:{Authorization:`Bearer ${t}`},cache:'no-store'});const ad=await accessRes.json();
   if(!accessRes.ok||!ad.is_owner_or_admin){location.href='/dashboard';return} setAccess(ad);
   const mRes=await fetch(`/api/workspace-employees?workspace_id=${encodeURIComponent(saved)}`,{headers:{Authorization:`Bearer ${t}`},cache:'no-store'});const md=await mRes.json();
   if(!mRes.ok)throw new Error(md?.error||'Unable to load employees.');setMembers(md.members||[]);
  }catch(e){setMessage(e instanceof Error?e.message:'Unable to load employee access.');}finally{setLoading(false)}
 }
 async function loadPermissions(userId:string){
  setSelected(userId);setMessage('');try{const t=await token();const r=await fetch(`/api/admin/permissions?workspace_id=${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${t}`},cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d?.error||'Unable to load permissions.');const next:Record<string,Permission>={};(d.permissions||[]).filter((p:Permission)=>p.user_id===userId).forEach((p:Permission)=>{next[p.module]=p});setPermissions(next);}catch(e){setMessage(e instanceof Error?e.message:'Unable to load permissions.');}}
 function toggle(module:string,action:string){setPermissions(cur=>{const base:Permission=cur[module]||{module,can_view:false,can_create:false,can_edit:false,can_submit:false,can_approve:false,can_publish:false,can_manage:false};return {...cur,[module]:{...base,[action]:!base[action as keyof Permission]}}})}
 async function saveAll(){if(!selectedMember)return;setSaving(true);setMessage('');try{const t=await token();for(const [module,label] of modules){const p=permissions[module]||{module,can_view:false,can_create:false,can_edit:false,can_submit:false,can_approve:false,can_publish:false,can_manage:false};const r=await fetch('/api/admin/permissions',{method:'PUT',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify({workspace_id:id,user_id:selectedMember.user_id,module,...p})});const d=await r.json();if(!r.ok)throw new Error(d?.error||`Unable to save ${label}.`)}setMessage('Employee access saved successfully.')}catch(e){setMessage(e instanceof Error?e.message:'Unable to save employee access.')}finally{setSaving(false)}}
 useEffect(()=>{void load()},[]);
 if(loading)return <AppShell title="Settings"><div className="muted">Loading employee access…</div></AppShell>;
 return <AppShell title="Settings"><div className="page-head"><div><span className="eyebrow">TEAM ACCESS</span><h1>Employee Access</h1><p>Choose an employee and control exactly what they can view, create, edit, submit, approve, publish or manage.</p></div></div>
  {message&&<div className="data-warning" style={{maxWidth:1100,marginBottom:16}}>{message}</div>}
  <div style={{display:'grid',gridTemplateColumns:'280px 1fr',gap:18,alignItems:'start'}}>
   <section className="panel" style={{padding:18}}><h2 style={{marginTop:0}}>Team Members</h2><div style={{display:'grid',gap:8}}>{members.filter(m=>m.role!=='owner'&&m.active).map(m=><button key={m.user_id} onClick={()=>void loadPermissions(m.user_id)} style={{padding:'12px 14px',textAlign:'left',border:'1px solid #e1e8ec',borderRadius:12,background:selected===m.user_id?'#eefaf9':'#fff',cursor:'pointer'}}><strong>{m.profiles?.full_name||m.employee_id}</strong><span style={{display:'block',fontSize:11,color:'#687580',marginTop:4}}>{m.employee_id} · {m.role}</span></button>)}{members.filter(m=>m.role!=='owner'&&m.active).length===0&&<p className="muted">No active employees.</p>}</div></section>
   <section className="panel" style={{padding:18,overflowX:'auto'}}>{!selectedMember?<><h2 style={{marginTop:0}}>Select an employee</h2><p className="muted">Select a team member on the left to configure their access.</p></>:<><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:16}}><div><h2 style={{margin:'0 0 4px'}}>{selectedMember.profiles?.full_name||selectedMember.employee_id}</h2><p className="muted" style={{margin:0}}>{selectedMember.employee_id} · {selectedMember.role}</p></div><button className="btn btn-primary" onClick={()=>void saveAll()} disabled={saving}>{saving?'Saving…':'Save Access'}</button></div><table style={{width:'100%',borderCollapse:'collapse',minWidth:760}}><thead><tr><th style={th}>Module</th>{actions.map(a=><th key={a} style={th}>{actionLabels[a]}</th>)}</tr></thead><tbody>{modules.map(([module,label])=><tr key={module}><td style={td}><strong>{label}</strong></td>{actions.map(a=><td key={a} style={{...td,textAlign:'center'}}><input type="checkbox" checked={Boolean(permissions[module]?.[a])} onChange={()=>toggle(module,a)} aria-label={`${label} ${actionLabels[a]}`} /></td>)}</tr>)}</tbody></table><div style={{marginTop:12,fontSize:11,color:'#6b7782'}}>Workspace Settings is intentionally excluded here; it remains Owner/Admin-only.</div></>}</section>
  </div>
 </AppShell>;
}
const th:React.CSSProperties={padding:'10px 12px',borderBottom:'1px solid #dfe6ea',textAlign:'left',fontSize:11,color:'#66727d',whiteSpace:'nowrap'};
const td:React.CSSProperties={padding:'11px 12px',borderBottom:'1px solid #edf1f3',fontSize:12};
