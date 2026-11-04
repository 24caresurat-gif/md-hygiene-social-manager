'use client';

import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';

type Wallet={customerName:string;stamps:number;rewardsAvailable:number;rewardsRedeemed:number;stampsRequired:number;rewardDescription:string;programmeName:string;programmeActive:boolean;createdAt:string};
export default function LoyaltyWalletPage(){
 const params=useParams<{token:string}>(),token=String(params?.token||'');
 const[wallet,setWallet]=useState<Wallet|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;(async()=>{try{const r=await fetch('/api/public/loyalty/wallet/'+encodeURIComponent(token),{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Unable to open your loyalty card.');if(active)setWallet(d.wallet as Wallet)}catch(e){if(active)setError(e instanceof Error?e.message:'Unable to load your card.')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[token]);
 const progress=wallet?Math.min(100,Math.round(wallet.stamps/wallet.stampsRequired*100)):0;
 return <main className="loyalty-wallet">
  <style>{`
   .loyalty-wallet{min-height:100dvh;padding:24px 14px;background:#f6f8fb;color:#17202b;display:grid;place-items:center;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
   .loyalty-wallet .card{width:min(100%,510px);border-radius:22px;background:#fff;border:1px solid #e5eaf0;box-shadow:0 12px 36px rgba(16,24,40,.07);overflow:hidden}
   .loyalty-wallet .head{padding:24px;background:linear-gradient(145deg,#087f7b,#0b6968);color:#fff}
   .loyalty-wallet .eyebrow{font-size:9px;letter-spacing:.14em;font-weight:900;opacity:.78}
   .loyalty-wallet h1{font-size:24px;margin:7px 0 4px}
   .loyalty-wallet .head p{font-size:11px;color:rgba(255,255,255,.8);margin:0}
   .loyalty-wallet .body{padding:20px;display:grid;gap:17px}
   .loyalty-wallet .bar{height:12px;border-radius:999px;background:#edf1f4;overflow:hidden}
   .loyalty-wallet .bar span{height:100%;display:block;background:#087f7b;border-radius:999px}
   .loyalty-wallet .stamps{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px}
   .loyalty-wallet .stamp{aspect-ratio:1;border-radius:50%;border:1px solid #dfe6ec;display:grid;place-items:center;font-size:10px;font-weight:900;color:#98a2b3;background:#fff}
   .loyalty-wallet .stamp.filled{background:#edf8f7;border-color:#b6dedb;color:#087f7b}
   .loyalty-wallet .stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
   .loyalty-wallet .stat{border:1px solid #e5eaf0;border-radius:12px;padding:12px}
   .loyalty-wallet .stat small{display:block;color:#667085;font-size:9px;font-weight:800;text-transform:uppercase}
   .loyalty-wallet .stat strong{display:block;font-size:23px;margin-top:4px}
   .loyalty-wallet .reward{padding:13px;border-radius:12px;background:#edf8f7;color:#087f7b;font-size:11px;font-weight:800}
   .loyalty-wallet .error{padding:14px;border-radius:11px;background:#fff1f0;color:#b42318;font-size:11px}
   .loyalty-wallet .foot{font-size:9px;color:#98a2b3;text-align:center}
  `}</style>
  <section className="card">
   <div className="head"><div className="eyebrow">DIGITAL STAMP CARD</div><h1>{wallet?.programmeName||'My Loyalty Card'}</h1><p>{wallet?.customerName||'Customer'} · {wallet?.programmeActive?'Active programme':'Programme paused'}</p></div>
   <div className="body">
    {loading?<div className="foot">Loading your digital card…</div>:error?<div className="error">{error}</div>:wallet&&<>
     <div><div style={{display:'flex',justifyContent:'space-between',gap:10,marginBottom:8,fontSize:11,fontWeight:850}}><span>Stamp progress</span><span>{wallet.stamps} / {wallet.stampsRequired}</span></div><div className="bar"><span style={{width:progress+'%'}}/></div></div>
     <div className="stamps">{Array.from({length:Math.min(wallet.stampsRequired,14)},(_,index)=><div className={'stamp '+(index<wallet.stamps?'filled':'')} key={index}>{index<wallet.stamps?'✓':index+1}</div>)}</div>
     <div className="stats"><div className="stat"><small>Rewards ready</small><strong>{wallet.rewardsAvailable}</strong></div><div className="stat"><small>Rewards redeemed</small><strong>{wallet.rewardsRedeemed}</strong></div></div>
     <div className="reward">Next reward: {wallet.rewardDescription}</div>
     <div className="foot">Show this digital card to the business team when collecting stamps or redeeming rewards. Stamps and rewards update after the team records a visit.</div>
    </>}
   </div>
  </section>
 </main>;
}
