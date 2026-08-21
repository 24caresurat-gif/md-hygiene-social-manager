'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '../../../../lib/supabase-browser';

export default function CreateWorkspacePage(){
  const[name,setName]=useState('');
  const[logo,setLogo]=useState<File|null>(null);
  const[preview,setPreview]=useState('');
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');

  useEffect(()=>{getSupabase().auth.getUser().then(({data})=>{if(!data.user)location.href='/login'}).catch(()=>{location.href='/login'})},[]);

  function chooseLogo(file:File|null){
    setError('');
    if(!file){setLogo(null);setPreview('');return}
    if(!file.type.startsWith('image/')){setError('Please select an image file.');return}
    if(file.size>5*1024*1024){setError('Logo must be 5 MB or smaller.');return}
    setLogo(file);setPreview(URL.createObjectURL(file));
  }

  async function submit(){
    if(!name.trim())return setError('Workspace name is required.');
    setBusy(true);setError('');
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
      const response=await fetch('/api/brands',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({name:name.trim(),logo_url})});
      const data=await response.json().catch(()=>null);
      if(!response.ok)throw Error(data?.error||'Unable to create workspace.');
      const id=data?.brand?.id;
      if(id){try{localStorage.setItem('mdsm:selectedWorkspaceId',id)}catch{}}
      location.href='/dashboard';
    }catch(e){setError(e instanceof Error?e.message:'Unable to create workspace.');setBusy(false)}
  }

  return <main className="create-page"><style jsx>{`
    .create-page{min-height:100vh;padding:34px 20px;background:radial-gradient(circle at 15% 0%,rgba(20,184,166,.12),transparent 30%),radial-gradient(circle at 90% 10%,rgba(59,130,246,.10),transparent 28%),#f7fafb;color:#17202b;display:flex;align-items:center;justify-content:center}
    .shell{width:min(760px,100%)}.back{border:0;background:transparent;color:#657381;font-weight:800;font-size:12px;cursor:pointer;margin-bottom:22px}.card{background:rgba(255,255,255,.96);border:1px solid #dfe8ec;border-radius:28px;padding:clamp(26px,5vw,46px);box-shadow:0 24px 70px rgba(15,23,42,.09)}
    .eyebrow{display:inline-flex;align-items:center;gap:7px;color:#078b87;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.eyebrow i{width:7px;height:7px;border-radius:50%;background:#14b8a6;box-shadow:0 0 0 5px rgba(20,184,166,.12)}h1{font-size:clamp(30px,5vw,44px);letter-spacing:-.045em;margin:10px 0 8px}.intro{margin:0 0 30px;color:#718096;font-size:14px;line-height:1.6}.logo-zone{display:flex;gap:18px;align-items:center;margin-bottom:30px}.logo{width:112px;height:112px;border-radius:28px;display:grid;place-items:center;overflow:hidden;background:#e7f8f6;border:1px solid #cfe5e6;color:#078b87;font-size:30px;font-weight:950;flex:0 0 112px}.logo img{width:100%;height:100%;object-fit:cover}.upload{display:inline-flex;align-items:center;gap:10px;border:1px solid #d7e4e7;border-radius:12px;background:#fff;padding:11px 14px;color:#17202b;font-size:12px;font-weight:900;cursor:pointer}.hint{display:block;margin-top:8px;color:#82909a;font-size:10px}.hidden{display:none}.field{display:grid;gap:9px}.field label{font-size:11px;font-weight:900;color:#52606d;letter-spacing:.08em;text-transform:uppercase}.field input{height:52px;border:1px solid #d7e3e7;border-radius:13px;padding:0 15px;font-size:15px;font-weight:700;outline:none}.field input:focus{border-color:#078b87;box-shadow:0 0 0 4px rgba(7,139,135,.1)}.error{margin:18px 0;padding:12px 14px;border-radius:12px;background:#fff1f2;color:#b42318;font-size:12px;font-weight:700}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:30px}.cancel,.submit{height:48px;padding:0 18px;border-radius:12px;font-weight:900;font-size:12px;cursor:pointer}.cancel{border:1px solid #d7e4e7;background:#fff;color:#53606c}.submit{border:0;background:#17202b;color:#fff;box-shadow:0 12px 24px rgba(23,32,43,.16)}.submit:disabled{opacity:.5;cursor:not-allowed}
  `}</style><div className="shell"><button className="back" onClick={()=>location.href='/dashboard'}>← Back to Workspaces</button><section className="card"><span className="eyebrow"><i/> Stage 3 · Workspace Setup</span><h1>Create New Workspace</h1><p className="intro">Give your workspace a name and logo. Social connections, brands, team permissions and publishing can be configured step by step after creation.</p><div className="logo-zone"><div className="logo">{preview?<img src={preview} alt="Workspace logo preview"/>:name.trim()?name.trim().slice(0,2).toUpperCase:'＋'}</div><div><label className="upload">＋ Upload Workspace Logo<input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>chooseLogo(e.target.files?.[0]||null)}/></label><span className="hint">PNG, JPG or WEBP · Maximum 5 MB</span>{logo&&<button className="back" style={{marginTop:8,marginBottom:0}} onClick={()=>chooseLogo(null)}>Remove logo</button>}</div></div><div className="field"><label>Workspace Name</label><input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. MD Hygiene" onKeyDown={e=>{if(e.key==='Enter')void submit()}}/></div>{error&&<div className="error">⚠ {error}</div>}<div className="actions"><button className="cancel" onClick={()=>location.href='/dashboard'}>Cancel</button><button className="submit" disabled={busy||!name.trim()} onClick={()=>void submit()}>{busy?'Creating…':'Create Workspace →'}</button></div></section></div>
}
