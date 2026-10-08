'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { getSupabase } from '../../../../lib/supabase-browser';

type Connection = {
  id: string;
  social_account_id: string;
  account_name: string | null;
  token_expires_at: string | null;
  token_status: string | null;
  token_error: string | null;
  updated_at: string;
};

type Location = {
  id: string;
  business_name: string;
  location_id: string;
  account_id: string | null;
  social_account_id?: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  review_url: string | null;
  status: string;
  updated_at: string;
  connection: Connection | null;
};

const css = `
.page{display:grid;gap:14px}
.topbar{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}.topbar h1{margin:5px 0}.topbar p{margin:0;color:#718096;font-size:11px;max-width:760px}
.select-grid{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:10px}.selector{display:grid;gap:5px}.selector span{font-size:8px;letter-spacing:.1em;text-transform:uppercase;font-weight:950;color:#7b8794}.selector select{height:44px;border:1px solid #dce5ea;border-radius:10px;background:#fff;padding:0 11px;font-size:11px;font-weight:850;color:#24313b}
.tabs{display:flex;gap:4px;overflow:auto;background:#fff;border:1px solid #e1e8ec;border-radius:12px;padding:4px}.tab{white-space:nowrap;padding:10px 13px;border-radius:9px;background:transparent;color:#667085;font-size:10px;font-weight:900;cursor:pointer}.tab.active{background:#eef5ff;color:#2166d1}
.hero{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:16px;padding:18px}.profile-main{display:grid;grid-template-columns:58px 1fr;gap:13px}.google-mark{width:58px;height:58px;border:1px solid #e1e8ec;border-radius:16px;display:grid;place-items:center;background:#fff;font-size:31px;font-weight:950;color:#4285f4}.titleline{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.titleline h2{margin:0;font-size:18px}.connected{padding:5px 8px;border-radius:999px;background:#edf9f1;color:#087443;font-size:8px;font-weight:950}.sub{margin:4px 0 0;color:#7b8792;font-size:10px}.details{display:grid;gap:6px;margin-top:14px;padding-top:12px;border-top:1px solid #edf0f3}.detail{display:flex;gap:9px;color:#667085;font-size:10px}.detail b{width:18px;color:#087f7b}.detail span,.detail a{color:#3a4650;overflow-wrap:anywhere}.detail a{color:#087f7b;font-weight:850;text-decoration:none}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.btn{border:1px solid #dce5e9;border-radius:10px;padding:9px 11px;background:#fff;color:#34424b;font-size:9px;font-weight:900;cursor:pointer}.primary{background:#2168c9;color:#fff;border-color:#2168c9}.soft{background:#eef5ff;color:#2166d1}.green{background:#edf9f4;color:#087f5c;border-color:#d0efe1}
.strength{border:1px solid #e4eaee;border-radius:15px;padding:16px;background:#fbfcfd;display:grid;gap:9px}.strength-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.strength-head strong{font-size:15px}.strength-head span{font-size:9px;color:#2166d1;font-weight:900}.gauge{height:10px;background:#e8edf0;border-radius:99px;overflow:hidden}.gauge-fill{height:100%;background:linear-gradient(90deg,#ef4444,#f59e0b,#10b981);border-radius:99px}.score{display:flex;justify-content:center;align-items:baseline;gap:4px;margin:5px 0}.score strong{font-size:34px;letter-spacing:-.05em}.score span{font-size:12px;color:#7b8792}.strength small{color:#8a95a3;font-size:9px;line-height:1.45}.check{padding:9px 10px;border:1px solid #e5eaee;border-radius:10px;background:#fff;display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:9px}.done{color:#087443;font-weight:950}.todo{color:#a15f05;font-weight:950}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:11px}.stat{padding:15px}.stat span{display:block;font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:950;color:#667085}.stat strong{display:block;font-size:24px;margin-top:7px}.stat small{display:block;color:#88939c;font-size:9px;margin-top:3px}
.section{overflow:hidden}.section-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:17px 18px}.section-head h2{margin:4px 0 0;font-size:16px}.section-head p{margin:4px 0 0;color:#7d8992;font-size:10px}
.connections{display:grid;gap:9px;padding:0 18px 18px}.connection{padding:12px;border:1px solid #e4eaee;border-radius:11px;background:#fafcfd;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.connection strong{font-size:11px}.connection small{display:block;color:#7d8992;font-size:9px;margin-top:3px;line-height:1.45}.status{padding:5px 8px;border-radius:999px;font-size:8px;font-weight:950}.status.ok{background:#edf9f1;color:#087443}.status.bad{background:#fff1f2;color:#b42318}
.note{padding:13px 15px;border:1px dashed #ccd9df;background:#fbfdfd;border-radius:12px;color:#5f6d77;font-size:10px;line-height:1.55}.empty{padding:42px 20px;text-align:center;color:#667085;font-size:11px}.error{padding:12px 14px;border-radius:11px;background:#fff1f2;border:1px solid #f5c8cf;color:#9f1239;font-size:10px;font-weight:800}
@media(max-width:1000px){.hero{grid-template-columns:1fr}.summary{grid-template-columns:repeat(2,1fr)}}
@media(max-width:650px){.select-grid,.summary{grid-template-columns:1fr}.topbar{align-items:flex-start;flex-direction:column}.profile-main{grid-template-columns:46px 1fr}.google-mark{width:46px;height:46px}}
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

function completeness(location: Location | null) {
  if (!location) return { score: 0, done: [] as string[], missing: ['Google location connection'] };
  const checks = [
    ['Business name', Boolean(location.business_name)],
    ['Address', Boolean(location.address)],
    ['Phone', Boolean(location.phone)],
    ['Website', Boolean(location.website)],
    ['Category', Boolean(location.category)],
    ['Review link', Boolean(location.review_url)],
  ] as const;
  const done = checks.filter(([, value]) => value).map(([label]) => label);
  const missing = checks.filter(([, value]) => !value).map(([label]) => label);
  return { score: Math.round((done.length / checks.length) * 100), done, missing };
}

export default function BusinessManagementPage() {
  const [workspaceId,setWorkspaceId]=useState('');
  const [locations,setLocations]=useState<Location[]>([]);
  const [connections,setConnections]=useState<Connection[]>([]);
  const [selectedAccount,setSelectedAccount]=useState('all');
  const [selectedLocation,setSelectedLocation]=useState('all');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  async function load(id:string){
    setLoading(true);setError('');
    try{
      const session=(await getSupabase().auth.getSession()).data.session;
      if(!session){location.href='/login';return;}
      const response=await fetch('/api/google/business/management?workspaceId='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data?.error||'Unable to load Business Profile management.');
      setLocations((data.locations||[]) as Location[]);
      setConnections((data.connections||[]) as Connection[]);
      const firstConnection=(data.connections||[])[0]?.id||'all';
      const firstLocation=(data.locations||[])[0]?.id||'all';
      setSelectedAccount(firstConnection);
      setSelectedLocation(firstLocation);
    }catch(e){setError(e instanceof Error?e.message:'Unable to load Business Profile management.');}
    finally{setLoading(false);}
  }

  useEffect(()=>{
    let current='';
    try{current=localStorage.getItem('mdsm:selectedWorkspaceId')||''}catch{}
    setWorkspaceId(current);
    const onWorkspace=(event:Event)=>{
      const next=(event as CustomEvent<{workspaceId?:string}>).detail?.workspaceId||'';
      if(next&&next!==current){current=next;setWorkspaceId(next);void load(next);}
    };
    window.addEventListener('mdsm:workspace-changed',onWorkspace);
    if(current)void load(current);else setLoading(false);
    return()=>window.removeEventListener('mdsm:workspace-changed',onWorkspace);
  },[]);

  const accountLocations=useMemo(()=>{
    if(selectedAccount==='all')return locations;
    const connection=connections.find(x=>x.id===selectedAccount);
    return locations.filter(x=>connection&&x.social_account_id===connection.social_account_id);
  },[connections,locations,selectedAccount]);

  const current=useMemo(()=>{
    if(selectedLocation==='all')return accountLocations[0]||null;
    return accountLocations.find(x=>x.id===selectedLocation)||accountLocations[0]||null;
  },[accountLocations,selectedLocation]);

  const score=completeness(current);
  const tokenErrors=connections.filter(item=>item.token_error||String(item.token_status||'').toLowerCase()!=='active');
  const activeConnections=connections.filter(item=>String(item.token_status||'').toLowerCase()==='active').length;

  return <AppShell title='Google Business & Reviews'>
    <style>{css}</style>
    <div className='page'>
      <div className='topbar'><div className='page-head'><div className='eyebrow'>GOOGLE MY BUSINESS MANAGEMENT</div><h1>Business Profile Management</h1><p>Manage the connected Google Business account and workspace locations without mixing data between workspaces.</p></div><div className='actions'><button className='btn' onClick={()=>location.href='/dashboard/gmb'}>← Overview</button><button className='btn primary' onClick={()=>location.href='/dashboard/settings#connections'}>Connection Settings</button></div></div>

      {error&&<div className='error'>{error}</div>}

      <div className='select-grid'>
        <label className='selector'><span>Business Account</span><select value={selectedAccount} onChange={e=>{setSelectedAccount(e.target.value);setSelectedLocation('all')}}><option value='all'>{connections.length?'All connected accounts':'Not connected'}</option>{connections.map(x=><option key={x.id} value={x.id}>{x.account_name||'Google Business account'}</option>)}</select></label>
        <label className='selector'><span>Business Location</span><select value={selectedLocation} onChange={e=>setSelectedLocation(e.target.value)} disabled={!accountLocations.length}><option value='all'>{accountLocations.length?'Select location':'No location connected'}</option>{accountLocations.map(x=><option key={x.id} value={x.id}>{x.business_name}</option>)}</select></label>
      </div>

      <div className='tabs'>{tabs.map(([label,href])=><button key={label} className={'tab '+(label==='GMB Settings'?'active':'')} onClick={()=>location.href=href}>{label}</button>)}</div>

      {!current ? <section className='panel empty'><strong>No Google Business location imported yet.</strong><div style={{marginTop:6}}>Connect Google from Settings, then sync the workspace to populate real Business Profile data.</div></section> : <>
        <section className='panel hero'>
          <div>
            <div className='profile-main'><div className='google-mark'>G</div><div><div className='titleline'><h2>{current.business_name}</h2><span className='connected'>✓ {current.status||'Connected'}</span></div><p className='sub'>{current.category||'Google Business Profile location'}</p><div className='details'><div className='detail'><b>⌖</b><span>{current.address||'Address not provided'}</span></div><div className='detail'><b>☎</b><span>{current.phone||'Phone not provided'}</span></div>{current.website&&<div className='detail'><b>◎</b><a href={current.website} target='_blank' rel='noreferrer'>{current.website}</a></div>}</div><div className='actions'><a className='btn soft' href={current.review_url||'#'} target={current.review_url?'_blank':undefined} rel={current.review_url?'noreferrer':undefined}>Share Review Link</a><button className='btn green' onClick={()=>location.href='/dashboard/gmb/requests'}>Create Review Request</button></div></div></div>
          </div>
          <aside className='strength'><div className='strength-head'><strong>Profile Completeness</strong><span>Refresh</span></div><div className='score'><strong>{score.score}%</strong><span>complete</span></div><div className='gauge'><div className='gauge-fill' style={{width:score.score+'%'}}/></div><small>Calculated from real workspace fields available here. This is not a Google-provided strength score.</small>{score.done.slice(0,4).map(x=><div className='check' key={x}><span>{x}</span><span className='done'>✓</span></div>)}{score.missing.slice(0,2).map(x=><div className='check' key={x}><span>{x}</span><span className='todo'>Needs data</span></div>)}</aside>
        </section>

        <div className='summary'><article className='panel stat'><span>Locations</span><strong>{locations.length}</strong><small>Imported in this workspace</small></article><article className='panel stat'><span>Connections</span><strong>{connections.length}</strong><small>Google account connections</small></article><article className='panel stat'><span>Active Tokens</span><strong>{activeConnections}</strong><small>Current token state</small></article><article className='panel stat'><span>Token Alerts</span><strong>{tokenErrors.length}</strong><small>Requires connection review</small></article></div>

        <section className='panel section'><div className='section-head'><div><div className='eyebrow'>CONNECTED ACCOUNTS</div><h2>Google Business connections</h2><p>Connection records remain scoped to the selected workspace.</p></div></div><div className='connections'>{connections.length?connections.map(x=><article className='connection' key={x.id}><div><strong>{x.account_name||'Google Business account'}</strong><small>{x.token_expires_at?'Token expiry: '+new Date(x.token_expires_at).toLocaleString():'Token expiry unavailable'}{x.token_error?' · '+x.token_error:''}</small></div><span className={'status '+(x.token_error||String(x.token_status||'').toLowerCase()!=='active'?'bad':'ok')}>{x.token_error||String(x.token_status||'unknown')}</span></article>):<div className='empty'>No Google connection records yet.</div>}</div></section>
      </>}
      <div className='note'><strong>Important:</strong> This page shows only actual Google Business data imported into the selected workspace. No sample locations, ratings or Google strength scores are generated.</div>
    </div>
  </AppShell>;
}
