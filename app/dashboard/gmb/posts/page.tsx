'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { getSupabase } from '../../../../lib/supabase-browser';

type Profile={id:string;business_name:string;review_url:string|null;status:string};
type Post={id:string;message:string;link:string|null;media_url:string|null;status:string;approval_status:string;created_at:string;updated_at:string;platform_response:any};

const css=`
.page{display:grid;gap:16px}.hero{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;flex-wrap:wrap}.hero h1{margin:5px 0}.hero p{margin:5px 0;max-width:760px}.actions{display:flex;gap:8px;flex-wrap:wrap}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{display:grid;gap:6px}.field.full{grid-column:1/-1}.field label{font-size:9px;font-weight:900;color:#667085;text-transform:uppercase;letter-spacing:.08em}.input,.select,.textarea{width:100%;border:1px solid #dbe4e8;border-radius:10px;background:#fff;padding:10px 11px;font-size:11px}.textarea{min-height:120px;resize:vertical}.count{font-size:9px;color:#8a95a3;text-align:right;margin-top:-2px}.check{display:flex;gap:7px;align-items:center;font-size:10px;color:#667085}.check input{accent-color:#087f7b}
.list{overflow:hidden}.row{padding:16px 18px;border-top:1px solid #edf0f3}.row:first-child{border-top:0}.top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.title{font-size:12px;font-weight:900;color:#25323b}.sub{font-size:9px;color:#8a95a3;margin-top:4px}.pill{padding:5px 8px;border-radius:999px;font-size:8px;font-weight:900;background:#f1f5f7}.green{background:#edf8f1;color:#14804a}.yellow{background:#fff7e8;color:#b54708}.gray{background:#f1f5f7;color:#667085}.message{margin-top:10px;font-size:11px;line-height:1.6;color:#475467;white-space:pre-wrap}.meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.buttons{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.note{font-size:10px;color:#667085;line-height:1.55}.empty{padding:42px 20px;text-align:center;color:#667085;font-size:11px}
@media(max-width:760px){.form-grid{grid-template-columns:1fr}.field.full{grid-column:auto}.hero{align-items:flex-start;flex-direction:column}}
`;

const topics=[['UPDATE','Update'],['EVENT','Event'],['OFFER','Offer']];
const ctas=[['','No CTA'],['BOOK','Book'],['ORDER','Order'],['SHOP','Shop'],['LEARN_MORE','Learn More'],['SIGN_UP','Sign Up'],['CALL','Call']];

const fmt=(v:string)=>{const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})};

export default function GooglePostsPage(){
 const[workspaceId,setWorkspaceId]=useState(''),[profiles,setProfiles]=useState<Profile[]>([]),[posts,setPosts]=useState<Post[]>([]),[selectedProfile,setSelectedProfile]=useState(''),[message,setMessage]=useState(''),[link,setLink]=useState(''),[mediaUrl,setMediaUrl]=useState(''),[topic,setTopic]=useState('UPDATE'),[cta,setCta]=useState(''),[ctaUrl,setCtaUrl]=useState(''),[approved,setApproved]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[aiBusy,setAiBusy]=useState(false),[aiSeed,setAiSeed]=useState(''),[error,setError]=useState('');
 async function token(){const s=(await getSupabase().auth.getSession()).data.session;if(!s){location.href='/login';throw new Error('Your session has expired.')}return s.access_token}
 async function load(id:string){
  setLoading(true);setError('');
  try{const t=await token();const r=await fetch('/api/google/business/posts?workspaceId='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+t},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||'Unable to load Google Business posts.');setProfiles((d.profiles||[]) as Profile[]);setPosts((d.posts||[]) as Post[]);setSelectedProfile(v=>v||String(d.profiles?.[0]?.id||''))}
  catch(e){setError(e instanceof Error?e.message:'Unable to load Google Business posts.')}finally{setLoading(false)}
 }
 useEffect(()=>{let current='';try{current=localStorage.getItem('mdsm:selectedWorkspaceId')||''}catch{}setWorkspaceId(current);const onWorkspace=(event:Event)=>{const next=(event as CustomEvent<{workspaceId?:string}>).detail?.workspaceId||'';if(next&&next!==current){current=next;setWorkspaceId(next);setSelectedProfile('');void load(next)}};window.addEventListener('mdsm:workspace-changed',onWorkspace);if(current)void load(current);else setLoading(false);return()=>window.removeEventListener('mdsm:workspace-changed',onWorkspace)},[]);
 async function generateAI(){
  if(!workspaceId)return;
  if(!aiSeed.trim())return setError('Add a short direction for the AI writer.');
  setAiBusy(true);setError('');
  try{
   const t=await token();
   const r=await fetch('/api/google/business/post-ai',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({workspaceId,profileId:selectedProfile,topic,seed:aiSeed})});
   const d=await r.json();if(!r.ok)throw Error(d?.error||'Unable to generate Google post.');
   setMessage(String(d.content||'').slice(0,1500));
  }catch(e){setError(e instanceof Error?e.message:'Unable to generate Google post.')}finally{setAiBusy(false)}
 }
  async function create(){
  setBusy(true);setError('');
  try{if(!workspaceId||!selectedProfile)throw new Error('Select a Business Profile location.');if(!message.trim())throw new Error('Write the Google post text.');const t=await token();const r=await fetch('/api/google/business/posts',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({workspaceId,profileId:selectedProfile,message,link,mediaUrl,topic,ctaType:cta,ctaUrl,approvalStatus:approved?'approved':'pending'})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||'Unable to create Google post.');setMessage('');setLink('');setMediaUrl('');setCta('');setCtaUrl('');setApproved(false);await load(workspaceId)}
  catch(e){setError(e instanceof Error?e.message:'Unable to create Google post.')}finally{setBusy(false)}
 }
 async function remove(id:string){
  if(!confirm('Delete this Google Business draft?'))return;
  setBusy(true);setError('');
  try{const t=await token();const r=await fetch('/api/google/business/posts?postId='+encodeURIComponent(id),{method:'DELETE',headers:{Authorization:'Bearer '+t}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||'Unable to delete draft.');setPosts(v=>v.filter(x=>x.id!==id))}
  catch(e){setError(e instanceof Error?e.message:'Unable to delete draft.')}finally{setBusy(false)}
 }
 return <AppShell title='Google Business & Reviews'><style>{css}</style><div className='page'>
  <div className='hero'><div className='page-head'><div className='eyebrow'>GOOGLE POSTS</div><h1>Business Updates</h1><p>Create workspace-scoped Google Business Profile posts now. Publishing to Google remains disabled until the Google connection is configured in Settings.</p></div><div className='actions'><button className='btn' onClick={()=>location.href='/dashboard/gmb'}>← Google Business</button><button className='btn btn-soft' onClick={()=>location.href='/dashboard/settings#connections'}>Connection Settings</button></div></div>
  {error&&<div className='alert alert-error'>{error}</div>}
  <section className='panel' style={{padding:18}}><div className='panel-head'><div><div className='eyebrow'>CREATE POST</div><h2>New Google Business update</h2></div></div>
   <div className='form-grid'>
    <div className='field'><label>Business Profile</label><select className='select' value={selectedProfile} onChange={e=>setSelectedProfile(e.target.value)}><option value=''>Select location…</option>{profiles.map(x=><option value={x.id} key={x.id}>{x.business_name}</option>)}</select></div>
    <div className='field'><label>Topic</label><select className='select' value={topic} onChange={e=>setTopic(e.target.value)}>{topics.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
    <div className='field full'><label>Post text</label><textarea className='textarea' value={message} onChange={e=>setMessage(e.target.value.slice(0,1500))} placeholder='Share an update, announcement, service news or offer…'/><div className='count'>{message.length}/1500</div></div>
    <div className='field full'><label>AI Google Post Assistant</label><input className='input' value={aiSeed} onChange={e=>setAiSeed(e.target.value)} placeholder='Direction, service topic or announcement for AI'/><div className='actions'><button type='button' className='btn btn-soft' onClick={()=>void generateAI()} disabled={aiBusy||busy||loading}>{aiBusy?'Generating…':'✦ Generate with AI'}</button><span className='note'>AI drafts are editable. Saving still uses the normal workspace approval flow.</span></div></div>
    <div className='field'><label>Link</label><input className='input' value={link} onChange={e=>setLink(e.target.value)} placeholder='https://example.com/page'/></div>
    <div className='field'><label>Image URL</label><input className='input' value={mediaUrl} onChange={e=>setMediaUrl(e.target.value)} placeholder='https://…/image.jpg'/></div>
    <div className='field'><label>Call to action</label><select className='select' value={cta} onChange={e=>setCta(e.target.value)}>{ctas.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
    <div className='field'><label>CTA URL</label><input className='input' value={ctaUrl} onChange={e=>setCtaUrl(e.target.value)} placeholder='https://example.com/booking'/></div>
    <label className='check full'><input type='checkbox' checked={approved} onChange={e=>setApproved(e.target.checked)}/> Mark as approved for later publishing</label>
   </div>
   <div className='actions' style={{marginTop:12}}><button className='btn btn-primary' onClick={()=>void create()} disabled={busy||loading}>{busy?'Saving…':'Save Google Post'}</button><span className='note'>Saved posts are local workspace records; no external Google API call is made by this screen.</span></div>
  </section>
  <section className='panel list'><div className='panel-head' style={{padding:18}}><div><div className='eyebrow'>CONTENT QUEUE</div><h2>Google Business posts</h2><p>Drafts stay available even before the external connection is finished.</p></div></div>
   {loading?<div className='empty'>Loading posts…</div>:!posts.length?<div className='empty'>No Google Business posts yet.</div>:posts.map(post=>{const gmb=post.platform_response?.gmb||{};return <article className='row' key={post.id}><div className='top'><div><div className='title'>{gmb.topic||'UPDATE'} · {profiles.find(p=>p.id===gmb.profile_id)?.business_name||'Business Profile'}</div><div className='sub'>Created {fmt(post.created_at)}</div></div><span className={'pill '+(post.approval_status==='approved'?'green':'yellow')}>{post.approval_status==='approved'?'Approved':'Pending approval'}</span></div><div className='message'>{post.message}</div><div className='meta'><span className='pill gray'>Status: {post.status}</span>{post.link&&<span className='pill gray'>Link attached</span>}{post.media_url&&<span className='pill gray'>Image attached</span>}{gmb.cta_type&&<span className='pill gray'>CTA: {gmb.cta_type}</span>}</div><div className='buttons'><button className='btn btn-soft' onClick={()=>setMessage(post.message)}>Reuse text</button><button className='btn btn-danger' disabled={busy} onClick={()=>void remove(post.id)}>Delete Draft</button></div></article>})}
  </section>
  <div className='note'><strong>Publishing boundary:</strong> this module prepares and stores Google Business post content inside the selected workspace. Actual Google publishing will be wired later with the OAuth/API connection from Settings.</div>
 </div></AppShell>
}
