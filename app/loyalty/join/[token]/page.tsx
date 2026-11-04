'use client';

import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';

type Program={name:string;description:string|null;stampsRequired:number;rewardDescription:string};
export default function LoyaltyJoinPage(){
 const params=useParams<{token:string}>(),token=String(params?.token||'');
 const[program,setProgram]=useState<Program|null>(null),[name,setName]=useState(''),[phone,setPhone]=useState('');
 const[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;(async()=>{try{const r=await fetch('/api/public/loyalty/join/'+encodeURIComponent(token),{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'This loyalty programme is not available.');if(active)setProgram(d.program as Program)}catch(e){if(active)setError(e instanceof Error?e.message:'Unable to load the programme.')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[token]);
 async function join(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/public/loyalty/join/'+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerName:name,phone})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Unable to join this programme.');location.href=String(d.walletUrl)}catch(e){setError(e instanceof Error?e.message:'Unable to join.')}finally{setBusy(false)}}
 return <main className="loyalty-public">
  <style>{`
   .loyalty-public{min-height:100dvh;padding:22px 14px;background:#f6f8fb;color:#17202b;display:grid;place-items:center;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
   .loyalty-public .card{width:min(100%,470px);padding:24px;border:1px solid #e5eaf0;border-radius:20px;background:#fff;box-shadow:0 10px 30px rgba(16,24,40,.06);display:grid;gap:15px}
   .loyalty-public .eyebrow{font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:#087f7b;font-weight:900}
   .loyalty-public h1{font-size:25px;line-height:1.15;margin:5px 0}
   .loyalty-public p{font-size:12px;color:#667085;line-height:1.55;margin:0}
   .loyalty-public .reward{padding:13px;border-radius:12px;background:#edf8f7;color:#087f7b;font-size:12px;font-weight:800}
   .loyalty-public form{display:grid;gap:12px}
   .loyalty-public label{display:grid;gap:6px;font-size:10px;font-weight:800;color:#475467}
   .loyalty-public input{padding:11px 12px;border:1px solid #d7dee7;border-radius:10px;min-height:43px;color:#17202b;background:#fff}
   .loyalty-public button{border:0;border-radius:10px;padding:13px;background:#087f7b;color:#fff;font-size:11px;font-weight:900}
   .loyalty-public button:disabled{opacity:.55}
   .loyalty-public .error{background:#fff1f0;color:#b42318;padding:11px;border-radius:10px;font-size:11px}
   .loyalty-public .foot{font-size:9px;color:#98a2b3;text-align:center}
  `}</style>
  <section className="card">
   <div><div className="eyebrow">CUSTOMER LOYALTY</div><h1>{loading?'Loading your reward programme…':program?.name||'Join a loyalty programme'}</h1><p>{program?.description||'Join the programme, collect stamps when you visit and unlock rewards.'}</p></div>
   {program&&<div className="reward">{program.stampsRequired} stamps · Reward: {program.rewardDescription}</div>}
   {error&&<div className="error" role="alert">{error}</div>}
   {program&&<form onSubmit={join}>
    <label>Your name<input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="Enter your name"/></label>
    <label>Mobile number<input required type="tel" minLength={7} maxLength={20} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+91 98765 43210"/></label>
    <button disabled={busy}>{busy?'Joining programme…':'Join & Get My Digital Stamp Card'}</button>
   </form>}
   <div className="foot">Your loyalty card is private to you. Show it to the business team when collecting stamps or redeeming a reward.</div>
  </section>
 </main>;
}
