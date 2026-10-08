'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import { getSupabase } from '../../../lib/supabase-browser';

type Location = {
  id: string;
  business_name: string;
  location_id: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  review_url: string | null;
  status: string;
};

type Review = {
  id: string;
  reviewer_name: string | null;
  rating: number | null;
  comment: string | null;
  review_time: string | null;
  reply_text: string | null;
  reply_status: string;
  business_name: string | null;
};

type ReviewSettings = {
  ai_enabled: boolean;
  negative_protection_enabled: boolean;
  negative_protection_threshold: number;
};

const css = `
.gmb-shell{display:grid;gap:14px}
.gmb-topbar{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:end}
.title-wrap h1{margin:4px 0 5px;font-size:29px;letter-spacing:-.035em}.title-wrap p{margin:0;color:#718096;font-size:11px}
.selector{display:grid;gap:5px;min-width:210px}.selector span{font-size:8px;letter-spacing:.1em;text-transform:uppercase;font-weight:950;color:#7b8794}
.selector select{height:45px;border:1px solid #dce5ea;border-radius:10px;padding:0 12px;background:#fff;font-size:11px;font-weight:800;color:#24313b}
.notice{padding:13px 15px;border:1px solid #e3d4ff;background:#fbf7ff;border-radius:12px;color:#43345e;font-size:10px;display:flex;justify-content:space-between;align-items:center;gap:12px}
.notice strong{font-size:12px}.notice span{display:block;color:#6f6580;margin-top:3px;line-height:1.45}
.tabs{display:flex;gap:4px;overflow:auto;background:#fff;border:1px solid #e1e8ec;border-radius:12px;padding:4px}
.tab{white-space:nowrap;padding:10px 13px;border-radius:9px;background:transparent;color:#667085;font-size:10px;font-weight:900;cursor:pointer}.tab.active{background:#eef5ff;color:#2166d1}
.profile-card{display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:16px;padding:18px}
.profile-main{display:grid;grid-template-columns:56px minmax(0,1fr);gap:13px;align-items:start}
.google-mark{width:56px;height:56px;border-radius:16px;background:#fff;border:1px solid #e1e8ec;display:grid;place-items:center;font-size:30px;font-weight:950;color:#4285f4}
.profile-title{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.profile-title h2{margin:0;font-size:17px}.connected{padding:5px 8px;border-radius:999px;background:#edf9f1;color:#087443;font-size:8px;font-weight:950}
.profile-sub{margin:4px 0 0;color:#7b8792;font-size:10px}.detail-list{display:grid;gap:5px;margin-top:14px;padding-top:12px;border-top:1px solid #edf0f3}.detail{display:flex;gap:9px;color:#667085;font-size:10px}.detail b{width:18px;color:#087f7b}.detail span{color:#3a4650;overflow-wrap:anywhere}
.qr-box{display:grid;place-items:center;align-content:center;gap:8px;border-left:1px solid #edf0f3;padding-left:16px}.qr{width:100px;height:100px;border:1px solid #e3e8ec;border-radius:11px;display:grid;place-items:center;background:repeating-linear-gradient(45deg,#111 0 2px,#fff 2px 5px);color:#fff;font-weight:950;text-shadow:0 0 2px #000}.qr-label{font-size:8px;text-align:center;color:#7b8792}
.action-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.btn{border:1px solid #dce5e9;border-radius:10px;padding:9px 11px;background:#fff;color:#34424b;font-size:9px;font-weight:900;cursor:pointer}.btn-primary{background:#2168c9;color:#fff;border-color:#2168c9}.btn-soft{background:#eef5ff;color:#2166d1}.btn-green{background:#edf9f4;color:#087f5c;border-color:#d0efe1}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:11px}.metric{padding:15px}.metric span{display:block;font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:950;color:#667085}.metric strong{display:block;font-size:25px;margin-top:7px}.metric small{display:block;font-size:9px;color:#88939c;margin-top:3px}.metric.blue{background:#f6f9ff;border-color:#d9e5fb}.metric.green{background:#f5fcf7;border-color:#d7efdc}.metric.purple{background:#fbf7ff;border-color:#eadcff}.metric.orange{background:#fff9f1;border-color:#f3dfc0}
.section{overflow:hidden}.section-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:17px 18px}.section-head h2{margin:4px 0 0;font-size:16px}.section-head p{margin:4px 0 0;color:#7d8992;font-size:10px}
.ai-list{border-top:1px solid #edf0f3}.ai-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 17px;border-top:1px solid #edf0f3}.ai-row:first-child{border-top:0}.ai-copy{display:flex;gap:11px;align-items:center;min-width:0}.ai-icon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:#eef5ff;color:#2869cf;font-weight:950}.ai-copy strong{display:block;font-size:11px}.ai-copy small{display:block;color:#84909a;font-size:9px;margin-top:3px}.toggle{width:40px;height:24px;border:0;border-radius:999px;background:#d6dce2;padding:3px;cursor:pointer}.toggle.on{background:#10b981}.toggle i{display:block;width:18px;height:18px;background:#fff;border-radius:50%;transition:transform .15s}.toggle.on i{transform:translateX(16px)}
.grid2{display:grid;grid-template-columns:1.25fr .75fr;gap:14px}.recent-list{padding:0 17px 12px}.recent{display:grid;grid-template-columns:100px 54px minmax(0,1fr) auto;gap:10px;padding:12px 0;border-top:1px solid #edf0f3;align-items:center}.recent:first-child{border-top:0}.recent strong{font-size:10px}.recent small{display:block;color:#88939c;font-size:9px;margin-top:3px}.stars{font-size:10px;font-weight:950}.review-status{font-size:8px;font-weight:950;padding:5px 8px;border-radius:999px}.review-status.replied{color:#087443;background:#edf9f1}.review-status.pending{color:#a15f05;background:#fff8e9}.empty{padding:36px 20px;text-align:center;color:#687681;font-size:10px}.empty strong{display:block;color:#35424c;font-size:12px;margin-bottom:4px}
.module-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}.module{padding:15px}.module h3{margin:5px 0;font-size:13px}.module p{margin:0;color:#7b8792;font-size:9px;line-height:1.5}.module .btn{margin-top:11px}
.error{padding:12px 14px;border-radius:11px;background:#fff1f2;border:1px solid #f5c8cf;color:#9f1239;font-size:10px;font-weight:800}
@media(max-width:1050px){.gmb-topbar{grid-template-columns:1fr 1fr}.title-wrap{grid-column:1/-1}.profile-card{grid-template-columns:1fr}.qr-box{border-left:0;border-top:1px solid #edf0f3;padding:14px 0 0}.metrics{grid-template-columns:repeat(2,1fr)}.grid2,.module-grid{grid-template-columns:1fr}}
@media(max-width:650px){.gmb-topbar{grid-template-columns:1fr}.selector{min-width:0}.metrics{grid-template-columns:1fr 1fr}.profile-main{grid-template-columns:46px minmax(0,1fr)}.google-mark{width:46px;height:46px}.recent{grid-template-columns:1fr 48px}.recent .stars{display:none}}
`;

const tabs = [
  ['Overview','/dashboard/gmb'],
  ['Reviews','/dashboard/gmb/reviews'],
  ['Posts','/dashboard/gmb/posts'],
  ['GMB Settings','/dashboard/gmb/management'],
  ['Insights','/dashboard/gmb/analytics'],
  ['Keywords','/dashboard/gmb/keywords'],
  ['Roadmap','/dashboard/gmb/features'],
] as const;

export default function GmbPage(){
  const [workspaceId,setWorkspaceId]=useState('');
  const [locations,setLocations]=useState<Location[]>([]);
  const [reviews,setReviews]=useState<Review[]>([]);
  const [settings,setSettings]=useState<ReviewSettings|null>(null);
  const [selectedLocation,setSelectedLocation]=useState('all');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  async function token(){
    const session=(await getSupabase().auth.getSession()).data.session;
    if(!session){location.href='/login';throw new Error('Your session has expired.')}
    return session.access_token;
  }

  async function load(id:string){
    setLoading(true);setError('');
    try{
      const t=await token();
      const response=await fetch('/api/google/business/reviews?'+new URLSearchParams({workspaceId:id,replyStatus:'all',rating:'0',profileId:'all'}).toString(),{headers:{Authorization:'Bearer '+t},cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data?.error||'Unable to load Google Business data.');
      setLocations((data.profiles||[]) as Location[]);
      setReviews((data.reviews||[]) as Review[]);
      try{
        const s=await fetch('/api/workspace-review-settings?workspace_id='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+t},cache:'no-store'});
        const d=await s.json().catch(()=>({}));
        if(s.ok&&d.settings)setSettings(d.settings as ReviewSettings);
      }catch{}
    }catch(e){setError(e instanceof Error?e.message:'Unable to load Google Business data.')}
    finally{setLoading(false)}
  }

  useEffect(()=>{
    let id='';
    try{id=localStorage.getItem('mdsm:selectedWorkspaceId')||''}catch{}
    setWorkspaceId(id);
    const onWorkspace=(event:Event)=>{
      const next=(event as CustomEvent<{workspaceId?:string}>).detail?.workspaceId||'';
      if(next&&next!==id){id=next;setWorkspaceId(next);setSelectedLocation('all');void load(next);}
    };
    window.addEventListener('mdsm:workspace-changed',onWorkspace);
    const params=new URLSearchParams(location.search);
    if(params.get('google')==='connected')setMessage('Google Business connected successfully.');
    if(params.get('google_error'))setError(params.get('google_error')||'Google connection failed.');
    if(id)void load(id);else setLoading(false);
    return()=>window.removeEventListener('mdsm:workspace-changed',onWorkspace);
  },[]);

  const currentLocation=useMemo(()=>selectedLocation==='all'?locations[0]||null:locations.find(x=>x.id===selectedLocation)||locations[0]||null,[locations,selectedLocation]);
  const filteredReviews=useMemo(()=>selectedLocation==='all'?reviews:reviews.filter(x=>(x as any).profile_id===selectedLocation),[reviews,selectedLocation]);
  const ratings=filteredReviews.map(x=>Number(x.rating||0)).filter(x=>x>=1&&x<=5);
  const avg=ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:null;
  const recent=filteredReviews.slice().sort((a,b)=>new Date(b.review_time||0).getTime()-new Date(a.review_time||0).getTime()).slice(0,6);
  const pending=filteredReviews.filter(x=>x.reply_status!=='replied').length;
  const aiEnabled=settings?.ai_enabled!==false;
  const connected=locations.length>0;

  function open(path:string){location.href=path}

  return <AppShell title='Google Business & Reviews'>
    <style>{css}</style>
    <div className='gmb-shell'>
      <div className='gmb-topbar'>
        <div className='title-wrap'>
          <div className='eyebrow'>GOOGLE MY BUSINESS MANAGEMENT</div>
          <h1>Google Business Profile</h1>
          <p>Manage workspace-scoped business locations, reviews, posts and reputation tools from one place.</p>
        </div>
        <label className='selector'><span>Business Account</span><select value={currentLocation?.id||''} onChange={e=>setSelectedLocation(e.target.value)} disabled={!locations.length}><option value=''>{locations.length?'Select business':'Not connected'}</option>{locations.map(x=><option key={x.id} value={x.id}>{x.business_name}</option>)}</select></label>
        <label className='selector'><span>Business Location</span><select value={selectedLocation} onChange={e=>setSelectedLocation(e.target.value)} disabled={!locations.length}><option value='all'>All locations</option>{locations.map(x=><option key={x.id} value={x.id}>{x.business_name}</option>)}</select></label>
      </div>

      {error&&<div className='error'>{error}</div>}
      {message&&<div className='notice'><div><strong>Google connection status</strong><span>{message}</span></div><button className='btn btn-soft' onClick={()=>setMessage('')}>Dismiss</button></div>}

      <div className='tabs'>{tabs.map(([label,href])=><button key={label} className={'tab '+(label==='Overview'?'active':'')} onClick={()=>open(href)}>{label}</button>)}</div>

      <section className='panel profile-card'>
        {currentLocation?<><div><div className='profile-main'><div className='google-mark'>G</div><div><div className='profile-title'><h2>{currentLocation.business_name}</h2><span className='connected'>✓ {currentLocation.status||'Connected'}</span></div><p className='profile-sub'>{currentLocation.category||'Google Business Profile location'}</p><div className='detail-list'><div className='detail'><b>⌖</b><span>{currentLocation.address||'Address unavailable'}</span></div><div className='detail'><b>☎</b><span>{currentLocation.phone||'Phone unavailable'}</span></div>{currentLocation.website&&<div className='detail'><b>◎</b><span>{currentLocation.website}</span></div>}</div><div className='action-row'><button className='btn' onClick={()=>open('/dashboard/gmb/management')}>Edit Business Profile</button>{currentLocation.review_url&&<a className='btn btn-soft' href={currentLocation.review_url} target='_blank' rel='noreferrer'>Share Review Link</a>}<button className='btn btn-green' onClick={()=>open('/dashboard/gmb/requests')}>Create Review Request</button></div></div></div></div><div className='qr-box'>{currentLocation.review_url?<><div className='qr' aria-hidden='true'>QR</div><div className='qr-label'>Public review link ready</div></>:<div className='qr-label'>Review QR appears after Google location sync.</div>}</div></>:<><div className='empty' style={{gridColumn:'1/-1'}}><strong>Google Business Profile is not connected yet.</strong>Connect Google from Settings when you are ready. No placeholder locations or reviews are shown.</div></>}
      </section>

      <div className='metrics'>
        <article className='panel metric blue'><span>Total Reviews</span><strong>{loading?'—':filteredReviews.length}</strong><small>Imported into this workspace</small></article>
        <article className='panel metric green'><span>Average Rating</span><strong>{loading?'—':avg==null?'—':avg.toFixed(2)+'/5'}</strong><small>Across imported ratings</small></article>
        <article className='panel metric purple'><span>Recent Reviews</span><strong>{loading?'—':recent.length}</strong><small>Latest available review set</small></article>
        <article className='panel metric orange'><span>Pending Replies</span><strong>{loading?'—':pending}</strong><small>Need a response</small></article>
      </div>

      <section className='panel section'>
        <div className='section-head'><div><div className='eyebrow'>AI REVIEW SUGGESTIONS</div><h2>Reputation AI</h2><p>Business-specific reply drafts use your workspace AI settings. Publishing stays permission and connection gated.</p></div><button className={'toggle '+(aiEnabled?'on':'')} aria-label='AI enabled state' onClick={()=>open('/dashboard/settings#review-ai')}><i/></button></div>
        <div className='ai-list'>
          <div className='ai-row'><div className='ai-copy'><div className='ai-icon'>✦</div><div><strong>AI Auto Review Replies</strong><small>{pending?pending+' review(s) need a reply':'No pending replies right now'}</small></div></div><button className='btn btn-soft' onClick={()=>open('/dashboard/gmb/ai')}>Open AI</button></div>
          <div className='ai-row'><div className='ai-copy'><div className='ai-icon'>▣</div><div><strong>AI Feedback Form</strong><small>Collect customer feedback before public review follow-up.</small></div></div><button className='btn' onClick={()=>open('/dashboard/gmb/forms')}>Open Form</button></div>
          <div className='ai-row'><div className='ai-copy'><div className='ai-icon'>≡</div><div><strong>Keywords &amp; Response Guidance</strong><small>Workspace keywords are injected when they fit naturally.</small></div></div><button className='btn' onClick={()=>open('/dashboard/gmb/keywords')}>Manage Keywords</button></div>
        </div>
      </section>

      <div className='grid2'>
        <section className='panel section'>
          <div className='section-head'><div><div className='eyebrow'>LATEST REVIEWS</div><h2>Review Inbox</h2><p>Workspace-scoped imported reviews and reply status.</p></div><button className='btn btn-soft' onClick={()=>open('/dashboard/gmb/reviews')}>View All</button></div>
          <div className='recent-list'>
            {loading?<div className='empty'>Loading reviews…</div>:recent.length===0?<div className='empty'><strong>No reviews imported yet</strong>Google connection and location sync will populate this section.</div>:recent.map(item=><div className='recent' key={item.id}><div><strong>{item.reviewer_name||'Google reviewer'}</strong><small>{item.comment||'Rating-only review'}</small></div><div className='stars'>{item.rating?'★'.repeat(item.rating)+'☆'.repeat(Math.max(0,5-item.rating)):'—'}</div><small>{item.business_name||'Business Profile'}</small><span className={'review-status '+(item.reply_status==='replied'?'replied':'pending')}>{item.reply_status==='replied'?'Replied':'Pending'}</span></div>)}
          </div>
        </section>
        <section className='panel section'>
          <div className='section-head'><div><div className='eyebrow'>PROFILE TOOLS</div><h2>Google Business Tools</h2><p>Keep connection and operational tools in one workspace.</p></div></div>
          <div className='recent-list'>
            <div className='recent' style={{gridTemplateColumns:'1fr auto'}}><div><strong>Business Profile Management</strong><small>Location details, connection and token state.</small></div><button className='btn' onClick={()=>open('/dashboard/gmb/management')}>Open</button></div>
            <div className='recent' style={{gridTemplateColumns:'1fr auto'}}><div><strong>Google Business Posts</strong><small>Draft, approve and prepare workspace posts.</small></div><button className='btn' onClick={()=>open('/dashboard/gmb/posts')}>Open</button></div>
            <div className='recent' style={{gridTemplateColumns:'1fr auto'}}><div><strong>Review Requests</strong><small>Create links and track customer activity.</small></div><button className='btn' onClick={()=>open('/dashboard/gmb/requests')}>Open</button></div>
            <div className='recent' style={{gridTemplateColumns:'1fr auto'}}><div><strong>Review Analytics</strong><small>Volume, rating and response trends.</small></div><button className='btn' onClick={()=>open('/dashboard/gmb/analytics')}>Open</button></div>
          </div>
        </section>
      </div>

      <section className='module-grid'>
        {[
          ['Negative Review Protection','Low-rating follow-up with a clear public Google review option.','/dashboard/gmb/negative-feedback'],
          ['Rating Improvement','Turn review patterns into operational suggestions without fake reviews or suppression.','/dashboard/gmb/rating-improvement'],
          ['Market Comparison','Compare performance against an editable benchmark without claiming live competitor data.','/dashboard/gmb/market'],
          ['AI Business Insights','Analyze imported review and feedback signals.','/dashboard/gmb/ai'],
          ['AI Review Image','Create shareable review quote cards from imported reviews.','/dashboard/gmb/images'],
          ['All Requested Features','Open the complete Reputation + AI feature center.','/dashboard/gmb/features'],
        ].map(([title,description,href])=><article className='panel module' key={title}><div className='eyebrow'>MODULE</div><h3>{title}</h3><p>{description}</p><button className='btn btn-soft' onClick={()=>open(href)}>Open Module →</button></article>)}
      </section>
    </div>
  </AppShell>;
}
