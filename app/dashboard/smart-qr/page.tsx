'use client';

import {useEffect,useState} from 'react';
import AppShell from '../components/AppShell';
import QRCodeImage from '../components/QRCodeImage';
import {getSupabase} from '../../../lib/supabase-browser';

type Profile={id:string;business_name:string;review_url:string|null};
type Form={id:string;name:string;active:boolean};
type Standee={id:string;label:string|null;profile_id:string|null;form_id:string|null;scan_count:number;created_at:string};

export default function SmartQRPage(){
 const[workspace,setWorkspace]=useState(''),[profiles,setProfiles]=useState<Profile[]>([]),[forms,setForms]=useState<Form[]>([]),[rows,setRows]=useState<Standee[]>([]);
 const[profile,setProfile]=useState(''),[form,setForm]=useState(''),[label,setLabel]=useState('Google Review QR'),[canManage,setCanManage]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function load(id:string){
  if(!id){setLoading(false);setError('Select a workspace first.');return}
  setLoading(true);setError('');
  try{
   const sb=getSupabase(),session=(await sb.auth.getSession()).data.session;
   if(!session)throw Error('Session expired. Sign in again.');
   const [s,p,f,a]=await Promise.all([
    sb.from('qr_standees').select('id,label,profile_id,form_id,scan_count,created_at').eq('workspace_id',id).order('created_at',{ascending:false}),
    sb.from('google_business_profiles').select('id,business_name,review_url').eq('workspace_id',id).order('business_name'),
    sb.from('feedback_forms').select('id,name,active').eq('workspace_id',id).order('created_at',{ascending:false}),
    fetch('/api/workspace-access?workspace_id='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'})
   ]);
   if(s.error)throw s.error;if(p.error)throw p.error;if(f.error)throw f.error;
   const d=await a.json().catch(()=>({}));if(!a.ok)throw Error(d.error||'Unable to check workspace access.');
   const gp=(d.permissions||[]).find((x:any)=>x.module==='gmb'),role=String(d.role||d.effectiveRole||'').toLowerCase();
   setCanManage(Boolean(d.is_owner_or_admin||gp?.can_manage||['owner','admin','manager'].includes(role)));
   setRows((s.data||[]) as Standee[]);setProfiles((p.data||[]) as Profile[]);setForms((f.data||[]) as Form[]);
   setProfile(v=>v||String((p.data||[])[0]?.id||''));setForm(v=>v||String((f.data||[]).find((x:any)=>x.active)?.id||''));
  }catch(e){setError(e instanceof Error?e.message:'Unable to load Smart QR.')}finally{setLoading(false)}
 }
 useEffect(()=>{let current='';try{current=localStorage.getItem('mdsm:selectedWorkspaceId')||''}catch{}setWorkspace(current);if(current)void load(current);else setLoading(false);
  const changed=(event:Event)=>{const next=(event as CustomEvent<{workspaceId?:string}>).detail?.workspaceId||'';if(next&&next!==current){current=next;setWorkspace(next);setProfile('');setForm('');void load(next)}};
  window.addEventListener('mdsm:workspace-changed',changed);return()=>window.removeEventListener('mdsm:workspace-changed',changed);
 },[]);
 async function create(){
  setBusy(true);setError('');setMessage('');
  try{
   if(!canManage)throw Error('Workspace manager permission is required.');
   if(!workspace||!profile||!form||!forms.some(x=>x.id===form&&x.active))throw Error('Select a Google Business location and an active feedback form.');
   const {data,error}=await getSupabase().from('qr_standees').insert({workspace_id:workspace,profile_id:profile,form_id:form,label:label.trim()||'Google Review QR'}).select('id,label,profile_id,form_id,scan_count,created_at').single();
   if(error)throw error;setRows(v=>[data as Standee,...v]);setLabel('Google Review QR');setMessage('Smart QR created. Test the link before printing.');
  }catch(e){setError(e instanceof Error?e.message:'Unable to create QR.')}finally{setBusy(false)}
 }
 async function copy(item:Standee){const url=location.origin+'/standee/'+item.id;try{await navigator.clipboard.writeText(url);setMessage('QR link copied.')}catch{setMessage(url)}}
 const activeForms=forms.filter(x=>x.active);
 return <AppShell title="Smart QR"><div className="page">
  <div className="page-head"><div><div className="eyebrow">SMART QR</div><h1>Review QR Codes</h1><p>Create permanent QR codes for each Google Business location. Every scan starts a fresh customer feedback request.</p></div></div>
  {error&&<div className="alert alert-error">{error}</div>}{message&&<div className="alert alert-success">{message}</div>}
  <section className="panel" style={{padding:20,display:'grid',gap:13}}>
   <div><div className="eyebrow">CREATE QR</div><h2 style={{margin:'5px 0'}}>New review QR</h2><p style={{margin:0,fontSize:11}}>Choose the Google Business location and active feedback form.</p></div>
   {(!profiles.length||!activeForms.length)&&<div className="alert alert-error">Connect a Google Business location and create an active Feedback Form before creating a QR.</div>}
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
    <label style={{display:'grid',gap:6,fontSize:11,fontWeight:750}}>QR label<input value={label} onChange={e=>setLabel(e.target.value)} maxLength={120} style={{padding:10,border:'1px solid var(--ui-border-strong)',borderRadius:10}}/></label>
    <label style={{display:'grid',gap:6,fontSize:11,fontWeight:750}}>Business location<select value={profile} onChange={e=>setProfile(e.target.value)} style={{padding:10,border:'1px solid var(--ui-border-strong)',borderRadius:10}}><option value="">Select location</option>{profiles.map(x=><option key={x.id} value={x.id}>{x.business_name}</option>)}</select></label>
    <label style={{display:'grid',gap:6,fontSize:11,fontWeight:750}}>Feedback form<select value={form} onChange={e=>setForm(e.target.value)} style={{padding:10,border:'1px solid var(--ui-border-strong)',borderRadius:10}}><option value="">Select active form</option>{activeForms.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   </div>
   <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}><button className="btn btn-primary" disabled={!canManage||busy||!profiles.length||!activeForms.length} onClick={()=>void create()}>{busy?'Creating…':'＋ Create Smart QR'}</button><span style={{fontSize:10,color:'var(--ui-muted)'}}>{canManage?'Workspace managers can create QR codes.':'View-only access.'}</span></div>
  </section>
  <section><div className="page-head"><div><div className="eyebrow">YOUR QR CODES</div><h2 style={{margin:'4px 0'}}>Saved review QR codes</h2></div><span className="count-badge">{rows.length} total</span></div>
   {loading?<div className="panel empty-state">Loading QR codes…</div>:!rows.length?<div className="panel empty-state">No QR codes yet. Create one above.</div>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:14}}>{rows.map(x=>{const url=typeof window!=='undefined'?location.origin+'/standee/'+x.id:'';return <article className="panel" key={x.id} style={{padding:16,display:'grid',gap:10}}><div><strong>{x.label||'Review QR'}</strong><div style={{fontSize:10,color:'var(--ui-muted)',marginTop:4}}>{profiles.find(p=>p.id===x.profile_id)?.business_name||'Business location'} · {forms.find(f=>f.id===x.form_id)?.name||'Feedback form'}</div></div><div style={{display:'grid',placeItems:'center',border:'1px solid var(--ui-border)',borderRadius:12,padding:10}}>{url&&<QRCodeImage value={url} alt={'QR code for '+(x.label||'Google review')} size={190}/>}</div><div style={{fontSize:10,color:'var(--ui-muted)'}}>Recorded scans: <strong>{x.scan_count||0}</strong><br/>Created {new Date(x.created_at).toLocaleDateString()}</div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="btn btn-soft" onClick={()=>void copy(x)}>Copy Link</button><a className="btn btn-soft" href={url} target="_blank" rel="noreferrer">Test QR Link</a></div></article>})}</div>}
  </section><p style={{fontSize:10,color:'var(--ui-muted)'}}>Test each QR link before printing. Scan totals update when customers open the public QR route.</p>
 </div></AppShell>;
}
