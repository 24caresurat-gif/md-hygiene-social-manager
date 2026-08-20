'use client';
import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { getSupabase } from '../../../lib/supabase-browser';

type Brand={id:string;name:string;slug:string;logo_url?:string|null};
type Account={id:string;platform:string;name:string;handle:string|null;brand_id:string|null};

export default function BrandsPage(){
 const[brands,setBrands]=useState<Brand[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[name,setName]=useState(''),[logo,setLogo]=useState<File|null>(null),[preview,setPreview]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');

 async function load(){
  const s=(await getSupabase().auth.getSession()).data.session;
  if(!s){location.href='/login';return}
  const h={Authorization:`Bearer ${s.access_token}`};
  const [br,ac]=await Promise.all([fetch('/api/brands',{headers:h,cache:'no-store'}),getSupabase().from('social_accounts').select('id,platform,name,handle,brand_id').order('created_at',{ascending:false})]);
  const bd=await br.json();
  if(!br.ok)throw Error(bd.error||'Unable to load workspaces');
  if(ac.error)throw ac.error;
  setBrands(bd.brands||[]);setAccounts((ac.data||[]) as Account[]);setLoading(false);
 }
 useEffect(()=>{load().catch(e=>{setError(e.message);setLoading(false)})},[]);

 function chooseLogo(file:File|null){
  setError('');
  if(!file){setLogo(null);setPreview('');return}
  if(!file.type.startsWith('image/')){setError('Please select an image file.');return}
  if(file.size>5*1024*1024){setError('Logo must be 5 MB or smaller.');return}
  setLogo(file);
  setPreview(URL.createObjectURL(file));
 }

 async function createBrand(){
  if(!name.trim())return;
  setBusy(true);setError('');setSuccess('');
  try{
   const supabase=getSupabase();
   const session=(await supabase.auth.getSession()).data.session;
   if(!session)throw Error('Your session has expired. Please sign in again.');
   let logo_url:string|null=null;
   if(logo){
    const ext=(logo.name.split('.').pop()||'png').toLowerCase().replace(/[^a-z0-9]/g,'')||'png';
    const path=`${session.user.id}/${crypto.randomUUID()}.${ext}`;
    const upload=await supabase.storage.from('workspace-logos').upload(path,logo,{contentType:logo.type,upsert:false,cacheControl:'31536000'});
    if(upload.error)throw upload.error;
    logo_url=supabase.storage.from('workspace-logos').getPublicUrl(path).data.publicUrl;
   }
   const r=await fetch('/api/brands',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({name,logo_url})});
   const d=await r.json();
   if(!r.ok)throw Error(d.error||'Unable to create workspace');
   setName('');setLogo(null);setPreview('');setSuccess(`${d.brand.name} workspace created successfully.`);await load();
  }catch(e){setError(e instanceof Error?e.message:'Unable to create workspace')}finally{setBusy(false)}
 }

 async function assign(accountId:string,brandId:string){const{error:e}=await getSupabase().from('social_accounts').update({brand_id:brandId||null}).eq('id',accountId);if(e)setError(e.message);else{setSuccess('Account assignment updated.');await load()}}

 return <AppShell title="Workspaces"><style jsx>{`
 .create-workspace{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:22px;align-items:end}
 .field{display:grid;gap:8px}.field label{font-size:11px;font-weight:900;color:#52606d;letter-spacing:.08em;text-transform:uppercase}.field input[type=text]{width:100%;min-height:48px;border:1px solid #d7e3e7;border-radius:12px;padding:0 14px;font-size:14px;font-weight:700;outline:none}.field input[type=text]:focus{border-color:#078b87;box-shadow:0 0 0 3px rgba(7,139,135,.1)}
 .logo-upload{border:1px dashed #bfd1d6;border-radius:16px;padding:12px;display:flex;align-items:center;gap:12px;cursor:pointer;background:#fbfdfd}.logo-upload:hover{border-color:#078b87;background:#f3fbfa}.logo-preview{width:54px;height:54px;border-radius:14px;overflow:hidden;display:grid;place-items:center;background:#e8f8f7;color:#078b87;font-size:16px;font-weight:900;flex:0 0 54px}.logo-preview img{width:100%;height:100%;object-fit:cover}.upload-copy strong{display:block;font-size:12px;color:#17202b}.upload-copy span{display:block;margin-top:3px;font-size:10px;color:#82909a}.hidden-file{display:none}
 .create-actions{display:flex;gap:10px;align-items:center;margin-top:18px}.create-actions .btn{min-height:46px}.clear-logo{border:0;background:none;color:#a14d4d;font-size:11px;font-weight:800;cursor:pointer}
 @media(max-width:760px){.create-workspace{grid-template-columns:1fr}.create-actions{flex-wrap:wrap}}
 `}</style><div className="page-head"><div><span className="eyebrow">WORKSPACES</span><h1>Your Workspaces</h1><p>Each workspace keeps its dashboard, Facebook, Instagram, Google Business accounts and publishing separate.</p></div><button className="btn btn-soft" onClick={()=>location.href='/dashboard'}>← Dashboard</button></div>{error&&<div className="alert alert-error">⚠ {error}</div>}{success&&<div className="alert alert-success">✓ {success}</div>}
 <section className="panel connect-panel"><div><span className="eyebrow">CREATE WORKSPACE</span><h2>Create your workspace</h2><p>Enter a workspace name and optionally upload your brand logo.</p></div><div className="create-workspace"><div className="field"><label>Workspace Name</label><input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. MD Hygiene" onKeyDown={e=>{if(e.key==='Enter')void createBrand()}}/><div><label className="logo-upload"><span className="logo-preview">{preview?<img src={preview} alt="Logo preview"/>:name.trim()?name.trim().slice(0,2).toUpperCase():'＋'}</span><span className="upload-copy"><strong>{preview?'Change workspace logo':'Upload workspace logo'}</strong><span>PNG, JPG, WEBP · Max 5 MB</span></span><input className="hidden-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>chooseLogo(e.target.files?.[0]||null)}/></label>{logo?<button type="button" className="clear-logo" onClick={()=>chooseLogo(null)}>Remove logo</button>:null}</div></div><div className="create-actions"><button className="btn btn-primary" disabled={busy||!name.trim()} onClick={()=>void createBrand()}>{busy?'Creating…':'Create Workspace'}</button></div></div></section>
 <section className="brand-card-grid">{loading?<div className="empty-state">Loading workspaces…</div>:brands.map(b=><article className="panel" key={b.id}><div className="panel-head"><div style={{display:'flex',alignItems:'center',gap:12}}><div className="logo-preview">{b.logo_url?<img src={b.logo_url} alt=""/>:b.name.slice(0,2).toUpperCase()}</div><div><span className="eyebrow">WORKSPACE</span><h2>{b.name}</h2></div></div><button className="btn btn-soft" onClick={()=>{try{localStorage.setItem('mdsm:selectedWorkspaceId',b.id)}catch{}location.href='/dashboard'}}>Open Workspace →</button></div><div className="account-list">{accounts.filter(a=>a.brand_id===b.id).map(a=><div className="account-row" key={a.id}><div className={`account-avatar ${a.platform}`}>{a.platform==='facebook'?'f':a.platform==='instagram'?'◎':'G'}</div><div className="account-info"><strong>{a.name}</strong><span>{a.handle?`@${a.handle}`:a.platform.replace('_',' ')}</span></div><span className="connected-pill">● Connected</span></div>)}{!accounts.some(a=>a.brand_id===b.id)&&<div className="empty-state">No accounts assigned yet.</div>}</div><label className="eyebrow">ASSIGN ACCOUNT</label><select defaultValue="" onChange={e=>e.target.value&&assign(e.target.value,b.id)}><option value="">Select an unassigned account…</option>{accounts.filter(a=>!a.brand_id).map(a=><option key={a.id} value={a.id}>{a.platform} — {a.name}</option>)}</select></article>)}</section></AppShell>}
