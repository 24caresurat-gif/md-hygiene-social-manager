'use client';
import {useEffect,useState} from 'react';
import AppShell from '../../components/AppShell';
import {getSupabase} from '../../../../lib/supabase-browser';

type Form={id:string;name:string;active:boolean};
type Profile={id:string;business_name:string};
type Standee={id:string;profile_id:string|null;form_id:string|null;label:string|null;scan_count:number;created_at:string};

const css=`.sd-page{display:grid;gap:16px}.sd-pad{padding:20px}.sd-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.sd-field{display:grid;gap:6px}.sd-field>label{font-size:10px;font-weight:850;color:#475467}.sd-field input,.sd-field select{border:1px solid #dbe4e8;border-radius:10px;padding:10px 12px;min-height:42px}.sd-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px}.sd-layout{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:16px;align-items:start}.sd-row{display:grid;grid-template-columns:minmax(0,1fr) 80px auto;gap:10px;padding:14px 18px;border-top:1px solid #edf0f3;align-items:center;cursor:pointer}.sd-row.on{background:#edf8f7}.sd-strong{font-size:11px;font-weight:850}.sd-muted{color:#667085;font-size:10px;line-height:1.5}.sd-empty{padding:38px;text-align:center;color:#667085;font-size:11px}.sd-sheet{background:#fff;border:2px solid #087f7b;border-radius:20px;padding:28px 22px;text-align:center}.sd-brand{font-size:13px;font-weight:900;letter-spacing:.12em;color:#087f7b;text-transform:uppercase}.sd-head{font-size:30px;margin:10px 0 6px;line-height:1.15}.sd-sub{font-size:13px;color:#475467;margin:0 0 16px;line-height:1.5}.sd-qr{width:260px;height:260px;max-width:100%;border:1px solid #e4ebee;border-radius:14px;background:#fff}.sd-foot{margin-top:14px;font-size:11px;font-weight:800;color:#087f7b}@media(max-width:1000px){.sd-layout,.sd-grid{grid-template-columns:1fr}}@media print{body *{visibility:hidden}.sd-sheet,.sd-sheet *{visibility:visible}.sd-sheet{position:fixed;left:0;top:0;width:100vw;min-height:100vh;border:0;border-radius:0;display:flex;flex-direction:column;align-items:center;justify-content:center}.sd-qr{width:70vmin;height:70vmin}.sd-head{font-size:44px}.sd-sub{font-size:20px}}`;

function fmt(v:string|null){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}

export default function StandeePage(){
 const[workspaceId,setWorkspaceId]=useState(''),[forms,setForms]=useState<Form[]>([]),[profiles,setProfiles]=useState<Profile[]>([]),[items,setItems]=useState<Standee[]>([]),[canManage,setCanManage]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 const[label,setLabel]=useState(''),[profileId,setProfileId]=useState(''),[formId,setFormId]=useState(''),[selected,setSelected]=useState('');

 async function load(id:string){
  setLoading(true);setError('');
  try{
   const sb=getSupabase();
   const s=(await sb.auth.getSession()).data.session;
   const[f,p,q,a]=await Promise.all([
    sb.from('feedback_forms').select('id,name,active').eq('workspace_id',id).order('created_at',{ascending:false}),
    sb.from('google_business_profiles').select('id,business_name').eq('workspace_id',id).order('business_name'),
    sb.from('qr_standees').select('id,profile_id,form_id,label,scan_count,created_at').eq('workspace_id',id).order('created_at',{ascending:false}),
    fetch('/api/workspace-access?workspace_id='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+(s?.access_token||'')},cache:'no-store'})
   ]);
   if(f.error)throw f.error;if(p.error)throw p.error;if(q.error)throw q.error;
   const formList=(f.data||[]) as Form[];
   const list=(q.data||[]) as Standee[];
   setForms(formList);setProfiles((p.data||[]) as Profile[]);setItems(list);
   const d=await a.json().catch(()=>({}));
   setCanManage(Boolean(d?.is_owner_or_admin||['owner','admin','manager'].includes(String(d?.effectiveRole||'').toLowerCase())));
   setSelected(v=>v&&list.some(x=>x.id===v)?v:(list[0]?.id||''));
  }catch(e){setError(e instanceof Error?e.message:'Unable to load standees.')}finally{setLoading(false)}
 }

 useEffect(()=>{
  let id='';
  try{id=localStorage.getItem('mdsm:selectedWorkspaceId')||''}catch{}
  setWorkspaceId(id);
  const onWorkspace=(event:Event)=>{
   const next=(event as CustomEvent<{workspaceId?:string}>).detail?.workspaceId||'';
   if(next&&next!==id){id=next;setWorkspaceId(next);void load(next)}
  };
  window.addEventListener('mdsm:workspace-changed',onWorkspace);
  if(id)void load(id);else setLoading(false);
  return()=>window.removeEventListener('mdsm:workspace-changed',onWorkspace);
 },[]);

 async function create(){
  setBusy('create');setError('');setMessage('');
  try{
   if(!canManage)throw new Error('Only a workspace manager can create a standee.');
   if(!workspaceId)throw new Error('Select a workspace first.');
   if(!forms.some(x=>x.active))throw new Error('Create an active feedback form first.');
   const r=await getSupabase().from('qr_standees').insert({workspace_id:workspaceId,profile_id:profileId||null,form_id:formId||null,label:label.trim()||null}).select('id').single();
   if(r.error)throw r.error;
   const newId=String((r.data as any)?.id||'');
   setLabel('');
   await load(workspaceId);
   if(newId)setSelected(newId);
   setMessage('Standee created. Print it and place it at your counter.');
  }catch(e){setError(e instanceof Error?e.message:'Unable to create standee.')}finally{setBusy('')}
 }
 async function remove(x:Standee){
  if(!confirm('Delete this standee? Its printed QR code will stop working.'))return;
  setBusy(x.id);setError('');
  try{
   const r=await getSupabase().from('qr_standees').delete().eq('id',x.id).eq('workspace_id',workspaceId);
   if(r.error)throw r.error;
   await load(workspaceId);
  }catch(e){setError(e instanceof Error?e.message:'Unable to delete standee.')}finally{setBusy('')}
 }

 const activeForms=forms.filter(x=>x.active);
 const sel=items.find(x=>x.id===selected);
 const selProfile=profiles.find(x=>x.id===sel?.profile_id);
 const businessName=selProfile?.business_name||sel?.label||'Your Business';
 const url=sel&&typeof window!=='undefined'?window.location.origin+'/standee/'+sel.id:'';
 const qr=url?'https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=12&data='+encodeURIComponent(url):'';
 async function copy(){if(!url)return;try{await navigator.clipboard.writeText(url);setMessage('Standee link copied.')}catch{setMessage(url)}}

 return <AppShell title='Google Business & Reviews'><style>{css}</style>
 <div className='sd-page'>
  <div className='page-head'><div><div className='eyebrow'>QR STANDEE</div><h1>Review Standee</h1><p>One permanent QR code for your counter. Customers scan it, rate you, and happy customers are sent to Google.</p></div><button className='btn btn-soft' onClick={()=>{location.href='/dashboard/gmb/requests'}}>Review Requests</button></div>
  {error&&<div className='alert alert-error'>{error}</div>}{message&&<div className='alert alert-success'>{message}</div>}
  <section className='panel sd-pad'>
   <div className='eyebrow'>NEW STANDEE</div>
   <h2 style={{margin:'5px 0 14px'}}>Create a standee</h2>
   {!loading&&!activeForms.length&&<div className='alert alert-error'>Create an active <button className='text-btn' onClick={()=>{location.href='/dashboard/gmb/forms'}}>Feedback Form</button> first.</div>}
   <div className='sd-grid'>
    <div className='sd-field'><label>Label (optional)</label><input value={label} onChange={e=>setLabel(e.target.value)} placeholder='e.g. Front counter'/></div>
    <div className='sd-field'><label>Business location</label><select value={profileId} onChange={e=>setProfileId(e.target.value)}><option value=''>Workspace level</option>{profiles.map(x=><option key={x.id} value={x.id}>{x.business_name}</option>)}</select></div>
    <div className='sd-field'><label>Feedback form</label><select value={formId} onChange={e=>setFormId(e.target.value)}><option value=''>Auto (first active form)</option>{activeForms.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
   </div>
   <div className='sd-actions'><button className='btn btn-primary' disabled={!canManage||!activeForms.length||busy==='create'} onClick={()=>void create()}>{busy==='create'?'Creating…':'Create Standee'}</button><span className='sd-muted'>{canManage?'Managers can create and delete standees.':'View-only access.'}</span></div>
  </section>
  <div className='sd-layout'>
   <section className='panel'>
    <div className='panel-head'><div><div className='eyebrow'>YOUR STANDEES</div><h2>Created standees</h2></div></div>
    {loading?<div className='sd-empty'>Loading…</div>:!items.length?<div className='sd-empty'>No standees yet. Create your first one above.</div>:items.map(x=>{const p=profiles.find(y=>y.id===x.profile_id);return <div className={'sd-row'+(x.id===selected?' on':'')} key={x.id} onClick={()=>setSelected(x.id)}><div><div className='sd-strong'>{x.label||p?.business_name||'Standee'}</div><div className='sd-muted'>{p?.business_name||'Workspace level'} · Created {fmt(x.created_at)}</div></div><div className='sd-muted'><strong>{x.scan_count}</strong> scans</div><div>{canManage&&<button className='btn btn-soft' style={{color:'#b42318'}} disabled={busy===x.id} onClick={e=>{e.stopPropagation();void remove(x)}}>Delete</button>}</div></div>})}
   </section>
   <section className='panel sd-pad'>
    <div className='eyebrow'>PRINT PREVIEW</div>
    <h2 style={{margin:'5px 0 14px'}}>Standee card</h2>
    {sel?<>
     <div className='sd-sheet'>
      <div className='sd-brand'>{businessName}</div>
      <h2 className='sd-head'>Loved your visit?</h2>
      <p className='sd-sub'>Scan to share your feedback and rate us on Google</p>
      <img className='sd-qr' src={qr} alt='Review QR code'/>
      <div className='sd-foot'>Takes less than 30 seconds</div>
     </div>
     <div className='sd-actions'>
      <button className='btn btn-primary' onClick={()=>window.print()}>Print Standee</button>
      <button className='btn btn-soft' onClick={()=>void copy()}>Copy Link</button>
      <button className='btn btn-soft' onClick={()=>window.open(qr,'_blank','noopener')}>Open QR Image</button>
      <button className='btn btn-soft' onClick={()=>window.open(url,'_blank','noopener')}>Test Scan</button>
     </div>
    </>:<div className='sd-empty'>Create a standee to see the printable QR card here.</div>}
   </section>
  </div>
 </div>
 </AppShell>
}
