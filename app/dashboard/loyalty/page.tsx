'use client';

import {useEffect,useMemo,useState} from 'react';
import AppShell from '../components/AppShell';
import {getSupabase} from '../../../lib/supabase-browser';

type Program={id:string;name:string;description:string|null;stamps_required:number;reward_description:string;is_active:boolean;created_at:string};
type Member={id:string;program_id:string;customer_name:string;phone:string;stamps:number;rewards_available:number;rewards_redeemed:number;created_at:string};
type Transaction={id:string;member_id:string;transaction_type:string;stamps_delta:number;rewards_delta:number;note:string|null;created_at:string};
type Data={programs:Program[];members:Member[];transactions:Transaction[];canManage:boolean};

export default function LoyaltyPage(){
 const[workspace,setWorkspace]=useState(''),[data,setData]=useState<Data>({programs:[],members:[],transactions:[],canManage:false}),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 const[programName,setProgramName]=useState(''),[description,setDescription]=useState(''),[stampsRequired,setStampsRequired]=useState('7'),[rewardDescription,setRewardDescription]=useState('');
 const[memberName,setMemberName]=useState(''),[phone,setPhone]=useState(''),[programId,setProgramId]=useState(''),[selectedProgram,setSelectedProgram]=useState('all');

 async function request(path:string,body?:Record<string,unknown>){
  const session=(await getSupabase().auth.getSession()).data.session;if(!session)throw Error('Session expired. Sign in again.');
  const response=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||'Unable to complete loyalty action.');return result;
 }
 async function load(id:string){
  if(!id){setLoading(false);setError('Select a workspace first.');return}
  setLoading(true);setError('');
  try{const result=await request('/api/loyalty?workspaceId='+encodeURIComponent(id));setData(result as Data);setProgramId(current=>current||String((result.programs||[]).find((p:Program)=>p.is_active)?.id||''));}
  catch(e){setError(e instanceof Error?e.message:'Unable to load Loyalty.')}finally{setLoading(false)}
 }
 useEffect(()=>{let current='';try{current=localStorage.getItem('mdsm:selectedWorkspaceId')||''}catch{}setWorkspace(current);if(current)void load(current);else setLoading(false);
  const changed=(event:Event)=>{const next=(event as CustomEvent<{workspaceId?:string}>).detail?.workspaceId||'';if(next&&next!==current){current=next;setWorkspace(next);setProgramId('');setSelectedProgram('all');void load(next)}};
  window.addEventListener('mdsm:workspace-changed',changed);return()=>window.removeEventListener('mdsm:workspace-changed',changed);
 },[]);
 async function action(key:string,body:Record<string,unknown>,success:string){
  setBusy(key);setError('');setMessage('');
  try{await request('/api/loyalty',{...body,workspaceId:workspace});setMessage(success);await load(workspace);}
  catch(e){setError(e instanceof Error?e.message:'Unable to complete loyalty action.')}finally{setBusy('')}
 }
 async function createProgram(){
  if(!programName.trim()||!rewardDescription.trim()){setError('Enter the programme name and reward.');return}
  await action('program',{action:'create_program',name:programName,description,rewardDescription,stampsRequired:Number(stampsRequired)},'Loyalty programme created.');
  setProgramName('');setDescription('');setRewardDescription('');
 }
 async function addMember(){
  if(!memberName.trim()||!phone.trim()||!programId){setError('Choose a programme and enter the customer name and phone.');return}
  await action('member',{action:'add_member',programId,customerName:memberName,phone},'Customer enrolled in the loyalty programme.');
  setMemberName('');setPhone('');
 }
 const visibleMembers=useMemo(()=>data.members.filter(member=>selectedProgram==='all'||member.program_id===selectedProgram),[data.members,selectedProgram]);
 const activePrograms=data.programs.filter(program=>program.is_active).length;
 const rewardsAvailable=data.members.reduce((total,member)=>total+member.rewards_available,0);
 const stampsInProgress=data.members.reduce((total,member)=>total+member.stamps,0);
 const selectedProgramData=data.programs.find(program=>program.id===programId&&program.is_active);
 return <AppShell title="Loyalty">
  <style>{`
   .loyalty{display:grid;gap:16px}.loyalty .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.loyalty .metric{padding:16px}.loyalty .metric span{font-size:9px;color:var(--ui-muted);text-transform:uppercase;letter-spacing:.07em;font-weight:850}.loyalty .metric strong{display:block;font-size:25px;margin-top:7px}.loyalty .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.loyalty .form-panel{padding:18px;display:grid;gap:12px}.loyalty .field{display:grid;gap:6px;font-size:10px;font-weight:800;color:var(--ui-text-2)}.loyalty input,.loyalty select,.loyalty textarea{width:100%;border:1px solid var(--ui-border-strong);border-radius:10px;padding:10px 12px;background:#fff;color:var(--ui-text);min-height:40px}.loyalty .member{display:grid;grid-template-columns:minmax(0,1.2fr) 1fr 100px 145px;align-items:center;gap:12px;padding:14px 16px;border-top:1px solid var(--ui-border)}.loyalty .muted{color:var(--ui-muted);font-size:10px}.loyalty .progress{height:7px;border-radius:999px;background:var(--ui-border);overflow:hidden;margin-top:7px}.loyalty .progress i{display:block;height:100%;background:var(--ui-primary);border-radius:999px}.loyalty .member-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.loyalty .program-chip{padding:7px 9px;border:1px solid var(--ui-border);border-radius:10px;font-size:10px;background:#fff}.loyalty .empty{padding:28px;text-align:center;color:var(--ui-muted);font-size:11px}.loyalty .tx-row{display:grid;grid-template-columns:1fr 100px 110px;gap:10px;padding:11px 16px;border-top:1px solid var(--ui-border);font-size:10px}.loyalty .status{font-size:9px;border-radius:999px;padding:5px 8px;background:var(--ui-success-soft);color:var(--ui-success);font-weight:800;width:max-content}
   @media(max-width:1050px){.loyalty .metrics{grid-template-columns:repeat(2,1fr)}.loyalty .member{grid-template-columns:1fr 1fr}.loyalty .member-actions{justify-content:flex-start}}
   @media(max-width:700px){.loyalty .grid{grid-template-columns:1fr}.loyalty .member{grid-template-columns:1fr}.loyalty .metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `}</style>
  <div className="loyalty">
   <div className="page-head"><div><div className="eyebrow">LOYALTY PROGRAM</div><h1>Loyalty</h1><p>Digital stamp cards, repeat-visit rewards and customer loyalty management.</p></div></div>
   {error&&<div className="alert alert-error">{error}</div>}{message&&<div className="alert alert-success">{message}</div>}
   <div className="metrics">
    <article className="panel metric"><span>Active programmes</span><strong>{data.programs.length?activePrograms:'—'}</strong></article>
    <article className="panel metric"><span>Loyalty customers</span><strong>{data.members.length.toLocaleString()}</strong></article>
    <article className="panel metric"><span>Stamps in progress</span><strong>{stampsInProgress.toLocaleString()}</strong></article>
    <article className="panel metric"><span>Rewards available</span><strong>{rewardsAvailable.toLocaleString()}</strong></article>
   </div>
   {data.canManage&&<div className="grid">
    <section className="panel form-panel"><div><div className="eyebrow">PROGRAMME SETUP</div><h2 style={{margin:'4px 0'}}>Create a reward</h2><p className="muted">Example: buy 7 coffees, get 1 free. Set the visit count and reward customers earn.</p></div>
     <label className="field">Programme name<input value={programName} onChange={e=>setProgramName(e.target.value)} placeholder="Coffee rewards"/></label>
     <label className="field">Stamps required<input type="number" min="1" max="50" value={stampsRequired} onChange={e=>setStampsRequired(e.target.value)}/></label>
     <label className="field">Reward description<input value={rewardDescription} onChange={e=>setRewardDescription(e.target.value)} placeholder="One free coffee"/></label>
     <label className="field">Description (optional)<textarea value={description} onChange={e=>setDescription(e.target.value)} rows={2}/></label>
     <button className="btn btn-primary" disabled={busy==='program'} onClick={()=>void createProgram()}>{busy==='program'?'Saving…':'＋ Create Programme'}</button>
    </section>
    <section className="panel form-panel"><div><div className="eyebrow">CUSTOMER ENROLMENT</div><h2 style={{margin:'4px 0'}}>Add a regular customer</h2><p className="muted">Enrol the customer in one active programme. A customer can have a separate card for each programme.</p></div>
     <label className="field">Programme<select value={programId} onChange={e=>setProgramId(e.target.value)}><option value="">Select programme</option>{data.programs.filter(p=>p.is_active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
     <label className="field">Customer name<input value={memberName} onChange={e=>setMemberName(e.target.value)} placeholder="Customer name"/></label>
     <label className="field">Phone number<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+91 98765 43210"/></label>
     <button className="btn btn-primary" disabled={busy==='member'||!data.programs.some(p=>p.id===programId&&p.is_active)} onClick={()=>void addMember()}>{busy==='member'?'Saving…':'＋ Add Customer'}</button>
    </section>
   </div>}
   <section className="panel">
    <div className="panel-head"><div><div className="eyebrow">PROGRAMMES</div><h2>Rewards and stamp rules</h2></div><span className="count-badge">{data.programs.length} programmes</span></div>
    {loading?<div className="empty">Loading loyalty programmes…</div>:!data.programs.length?<div className="empty">No loyalty programme yet. Create a reward programme to start enrolling regular customers.</div>:data.programs.map(p=><div key={p.id} style={{padding:'14px 16px',borderTop:'1px solid var(--ui-border)',display:'flex',gap:12,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}><div><strong>{p.name}</strong><div className="muted">{p.stamps_required} stamps · Reward: {p.reward_description}</div>{p.description&&<div className="muted">{p.description}</div>}</div><div style={{display:'flex',gap:8,alignItems:'center'}}><span className="status">{p.is_active?'Active':'Paused'}</span>{data.canManage&&<button className="btn btn-soft" disabled={busy==='toggle:'+p.id} onClick={()=>void action('toggle:'+p.id,{action:'set_program_active',programId:p.id,isActive:!p.is_active},p.is_active?'Programme paused.':'Programme activated.')}>{p.is_active?'Pause':'Activate'}</button>}</div></div>)}
   </section>
   <section className="panel">
    <div className="panel-head" style={{flexWrap:'wrap'}}><div><div className="eyebrow">CUSTOMER LOYALTY</div><h2>Members and digital stamp cards</h2></div><select aria-label="Filter loyalty programme" value={selectedProgram} onChange={e=>setSelectedProgram(e.target.value)} style={{minWidth:180,border:'1px solid var(--ui-border-strong)',borderRadius:9,padding:'8px 10px'}}><option value="all">All programmes</option>{data.programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
    {loading?<div className="empty">Loading customers…</div>:!visibleMembers.length?<div className="empty">No loyalty customers found for this programme.</div>:visibleMembers.map(m=>{const p=data.programs.find(x=>x.id===m.program_id);const progress=p?Math.min(100,Math.round((m.stamps/p.stamps_required)*100)):0;return <div className="member" key={m.id}><div><strong>{m.customer_name}</strong><div className="muted">{m.phone} · {p?.name||'Programme'}</div></div><div><div className="muted">{m.stamps} / {p?.stamps_required||0} stamps</div><div className="progress"><i style={{width:progress+'%'}}/></div></div><div><strong>{m.rewards_available}</strong><div className="muted">Rewards available</div></div><div className="member-actions">{data.canManage&&<><button className="btn btn-soft" disabled={!!busy} onClick={()=>void action('stamp:'+m.id,{action:'stamp',memberId:m.id},'Stamp added to '+m.customer_name+'.')}>＋ Stamp</button><button className="btn btn-soft" disabled={!!busy||m.rewards_available<1} onClick={()=>void action('redeem:'+m.id,{action:'redeem',memberId:m.id},'Reward redeemed for '+m.customer_name+'.')}>Redeem</button></>}</div></div>})}
   </section>
   <section className="panel">
    <div className="panel-head"><div><div className="eyebrow">ACTIVITY</div><h2>Recent stamp and reward history</h2></div><span className="count-badge">{data.transactions.length} events</span></div>
    {!data.transactions.length?<div className="empty">Stamp and redemption activity will appear here.</div>:data.transactions.map(tx=>{const member=data.members.find(m=>m.id===tx.member_id);return <div className="tx-row" key={tx.id}><span><strong>{member?.customer_name||'Customer'}</strong><div className="muted">{tx.note||tx.transaction_type}</div></span><span>{tx.transaction_type==='stamp'?'Stamp added':'Reward redeemed'}</span><span>{new Date(tx.created_at).toLocaleDateString()}</span></div>})}
   </section>
  </div>
 </AppShell>;
}
