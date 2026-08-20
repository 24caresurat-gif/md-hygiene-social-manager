'use client';
import { useEffect,useState } from 'react';
import AppShell from '../components/AppShell';
import { getSupabase } from '../../../lib/supabase-browser';

type Account={id:string;name:string;handle:string|null;platform:string;status:string}; type MediaType='none'|'image'|'video';
const ALL='all';
const platformName=(p:string)=>p==='google_business'?'Google Business':p.charAt(0).toUpperCase()+p.slice(1);

export default function PublishPage(){
 const[accounts,setAccounts]=useState<Account[]>([]),[accountId,setAccountId]=useState(ALL),[message,setMessage]=useState(''),[link,setLink]=useState(''),[mediaType,setMediaType]=useState<MediaType>('none'),[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[loading,setLoading]=useState(true),[publishing,setPublishing]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 useEffect(()=>{(async()=>{const c=getSupabase(),{data:{user}}=await c.auth.getUser();if(!user){location.href='/login';return}const{data,error}=await c.from('social_accounts').select('id,name,handle,platform,status').eq('user_id',user.id).eq('status','connected').order('platform');if(error)setError(error.message);else setAccounts((data||[]) as Account[]);setLoading(false)})()},[]);
 function choose(type:'image'|'video',f:File|null){setError('');if(!f){setFile(null);setMediaType('none');setPreview('');return}if(!f.type.startsWith(type+'/')){setError(`Please choose a valid ${type} file.`);return}setFile(f);setMediaType(type);setPreview(type==='image'?URL.createObjectURL(f):'')}
 const targets=accountId===ALL?accounts:accounts.filter(a=>a.id===accountId);
 const facebookTargets=targets.filter(a=>a.platform==='facebook');
 const unsupported=targets.filter(a=>a.platform!=='facebook');
 async function publish(){
  if(!targets.length) return setError('Select a connected account first.');
  if(unsupported.length) return setError('Instagram and Google Business publishing will be enabled after their platform connections are completed. For now select a Facebook Page.');
  setPublishing(true);setError('');setSuccess('');
  try{const c=getSupabase(),{data:{session}}=await c.auth.getSession();if(!session?.access_token)throw Error('Your session has expired.');
   const results:string[]=[];
   for(const account of facebookTargets){const form=new FormData();form.append('accountId',account.id);form.append('message',message);form.append('link',link);form.append('mediaType',mediaType);if(file)form.append('media',file);const r=await fetch('/api/meta/facebook/publish',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`},body:form}),d=await r.json();if(!r.ok)throw Error(`${account.name}: ${d.error||'Facebook publish failed'}`);results.push(d.page)}
   setSuccess(`Published successfully to ${results.join(', ')}.`);setMessage('');setLink('');setFile(null);setPreview('');setMediaType('none');
  }catch(e){setError(e instanceof Error?e.message:'Publish failed')}finally{setPublishing(false)}
 }
 return <AppShell title="Create Post"><div className="page-head"><div><span className="eyebrow">PUBLISH</span><h1>Create Post</h1><p>Compose once, choose one account or All Accounts, preview your content, then publish.</p></div><button className="btn btn-soft" onClick={()=>location.href='/dashboard/accounts'}>Manage Accounts →</button></div>{error&&<div className="alert alert-error">⚠ {error}</div>}{success&&<div className="alert alert-success">✓ {success}</div>}
 <div className="compose-grid"><section className="panel compose-card"><div className="panel-title"><div><span className="eyebrow">COMPOSE</span><h2>Post details</h2></div><span className="draft-pill">Draft</span></div>
 <label>Post To<select value={accountId} onChange={e=>setAccountId(e.target.value)} disabled={loading||publishing}><option value={ALL}>All Connected Accounts</option>{accounts.map(a=><option key={a.id} value={a.id}>{platformName(a.platform)} — {a.name}{a.handle?` (@${a.handle})`:''}</option>)}</select></label>
 <div className="selected-targets"><strong>Publishing target</strong>{targets.length?<div>{targets.map(a=><span key={a.id} className="connected-pill">✓ {platformName(a.platform)} · {a.name}</span>)}</div>:<small>No connected accounts</small>}</div>
 <label>Caption<textarea value={message} onChange={e=>setMessage(e.target.value)} rows={9} placeholder="Write your professional caption…" disabled={publishing}/><small>{message.length} characters</small></label>
 <div><label>Media</label><div className="media-actions"><label className="btn btn-soft">📷 Add Image<input hidden type="file" accept="image/*" onChange={e=>choose('image',e.target.files?.[0]||null)}/></label><label className="btn btn-soft">🎥 Add Video<input hidden type="file" accept="video/*" onChange={e=>choose('video',e.target.files?.[0]||null)}/></label>{file&&<button className="btn btn-danger-soft" onClick={()=>choose('image',null)}>Remove</button>}</div>{file&&<small className="file-name">{file.name}</small>}</div>
 <label>Optional Link<input value={link} onChange={e=>setLink(e.target.value)} placeholder="https://..." disabled={publishing}/></label><button className="btn btn-primary publish-btn" disabled={!targets.length||!message.trim()||publishing||loading} onClick={publish}>{publishing?'Publishing…':targets.length>1?'✓ Publish to Selected Accounts':'✓ Confirm & Publish'}</button></section>
 <section className="panel preview-panel"><div className="panel-title"><div><span className="eyebrow">LIVE PREVIEW</span><h2>Post Preview</h2></div><span className="preview-dot">● Live</span></div><div className="social-preview"><div className="preview-header"><div className="mini-logo">MD</div><div><strong>{targets[0]?.name||'Selected Account'}</strong><small>{targets[0]?platformName(targets[0].platform):'Choose an account'} · Just now</small></div><b>•••</b></div>{preview&&<img src={preview} alt="Preview"/>}{mediaType==='video'&&file&&<div className="video-placeholder">🎥<strong>Video selected</strong><span>{file.name}</span></div>}<div className="preview-caption">{message||<span className="muted">Your caption preview will appear here…</span>}</div>{link&&<div className="preview-link">{link}</div>}<div className="preview-actions"><span>♡ Like</span><span>◯ Comment</span><span>↗ Share</span></div></div></section></div></AppShell>}
