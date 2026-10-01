'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import { getSupabase } from '../../../lib/supabase-browser';

type Conversation = {
  id:string; phone:string; contact_name:string|null; status:string; unread_count:number;
  last_message_preview:string|null; last_message_at:string|null; customer_window_expires_at:string|null;
  service_window_open:boolean;
};
type Message = { id:string; direction:string; type:string; body:string|null; provider_status:string; error_message:string|null; created_at:string };
type Template = { id:string; name:string; language:string; status:string };

const styles = '.wa-inbox{min-height:100%;padding:22px;background:#f7fafb;color:#17202b}.head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:14px}.eyebrow{font-size:10px;letter-spacing:.14em;color:#087f7b;font-weight:950}.head h1{margin:5px 0;font-size:29px}.sub{margin:0;color:#72808a;font-size:11px}.actions{display:flex;gap:7px}.btn{border:1px solid #dce6ea;background:#fff;border-radius:10px;padding:10px 12px;font-size:10px;font-weight:900;cursor:pointer}.primary{background:#17202b;color:#fff}.notice{margin-bottom:12px;padding:10px 12px;border:1px solid #dce6ea;background:#fff;border-radius:10px;font-size:11px;color:#56646f}.layout{display:grid;grid-template-columns:330px minmax(0,1fr);min-height:640px;background:#fff;border:1px solid #e0e8eb;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.04)}.list{border-right:1px solid #edf1f2}.search{padding:12px;border-bottom:1px solid #edf1f2}.search input{width:100%;padding:10px;border:1px solid #dce6ea;border-radius:10px;font-size:11px}.conv{width:100%;display:flex;align-items:center;gap:10px;padding:12px;border:0;border-bottom:1px solid #f0f2f3;background:#fff;text-align:left;cursor:pointer}.conv.active{background:#eefaf9}.avatar{width:38px;height:38px;border-radius:12px;background:#e7f7f5;color:#087f7b;display:grid;place-items:center;font-size:10px;font-weight:950;flex:none}.copy{min-width:0;flex:1}.top{display:flex;justify-content:space-between;gap:8px}.top strong{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.top time{font-size:8px;color:#8a969e}.copy p{margin:4px 0 0;color:#7a8790;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.badge{min-width:18px;height:18px;border-radius:999px;background:#087f7b;color:#fff;display:grid;place-items:center;font-size:8px;font-weight:950}.empty{display:grid;place-items:center;text-align:center;padding:44px 20px;color:#7b8791;font-size:11px;gap:4px}.empty strong{color:#34404a;font-size:14px}.chat{display:grid;grid-template-rows:auto 1fr auto;min-width:0}.chat-head{padding:15px 17px;border-bottom:1px solid #edf1f2;display:flex;justify-content:space-between;gap:12px}.person strong{display:block;font-size:13px}.person span{font-size:10px;color:#7b8790}.pill{padding:5px 8px;border-radius:999px;background:#edf9f1;color:#087443;font-size:9px;font-weight:900}.pill.off{background:#f7f1e7;color:#8b6323}.messages{padding:18px;overflow:auto;background:#fbfcfd;display:grid;align-content:start;gap:8px}.bubble{max-width:72%;padding:10px 12px;border-radius:14px;border:1px solid #e2e8ea;background:#fff;font-size:11px;line-height:1.5}.bubble.out{margin-left:auto;background:#edf9f1;border-color:#d6ebda}.meta{margin-top:4px;font-size:8px;color:#89949c}.composer{border-top:1px solid #edf1f2;padding:12px;display:grid;gap:8px}.mode{display:flex;gap:6px}.mode button{border:1px solid #dce6ea;background:#fff;border-radius:9px;padding:7px 10px;font-size:9px;font-weight:900;cursor:pointer}.mode button.active{background:#17202b;color:#fff}.compose-row{display:flex;gap:8px}.textarea,.select,.param{width:100%;padding:10px 11px;border:1px solid #dce6ea;border-radius:10px;font-size:11px;background:#fff}.send{border:0;background:#087f7b;color:#fff;border-radius:10px;padding:0 16px;font-size:10px;font-weight:950;cursor:pointer}.send:disabled{opacity:.5}.helper{font-size:9px;color:#7b8792}@media(max-width:900px){.layout{grid-template-columns:1fr}.list{border-right:0;border-bottom:1px solid #edf1f2;max-height:320px;overflow:auto}.bubble{max-width:86%}}';

export default function WhatsAppInboxPage(){
  const [workspaceId,setWorkspaceId]=useState('');
  const [conversations,setConversations]=useState<Conversation[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [messages,setMessages]=useState<Message[]>([]);
  const [templates,setTemplates]=useState<Template[]>([]);
  const [query,setQuery]=useState('');
  const [text,setText]=useState('');
  const [templateMode,setTemplateMode]=useState(false);
  const [selectedTemplate,setSelectedTemplate]=useState('');
  const [parameters,setParameters]=useState('');
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [notice,setNotice]=useState('');

  async function token(){const s=(await getSupabase().auth.getSession()).data.session;if(!s)throw new Error('Session expired');return s.access_token}

  async function loadConversations(id=workspaceId){
    if(!id)return;
    const t=await token();
    const suffix=query.trim() ? '&q='+encodeURIComponent(query.trim()) : '';
    const r=await fetch('/api/whatsapp/conversations?workspaceId='+encodeURIComponent(id)+suffix,{headers:{Authorization:'Bearer '+t},cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d?.error||'Unable to load conversations.');
    setConversations(d.conversations||[]);
  }

  async function loadTemplates(id=workspaceId){
    if(!id)return;
    const t=await token();
    const r=await fetch('/api/whatsapp/templates?workspaceId='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+t},cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    if(r.ok)setTemplates((d.templates||[]).filter((x:Template)=>x.status==='APPROVED'));
  }

  async function openConversation(id:string){
    setSelectedId(id);setNotice('');setTemplateMode(false);
    try{
      const t=await token();
      const r=await fetch('/api/whatsapp/messages?workspaceId='+encodeURIComponent(workspaceId)+'&conversationId='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+t},cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d?.error||'Unable to load messages.');
      setMessages(d.messages||[]);
      await fetch('/api/whatsapp/conversations',{method:'PATCH',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({workspaceId,conversationId:id,action:'read'})});
      setConversations(cur=>cur.map(c=>c.id===id?{...c,unread_count:0}:c));
    }catch(e){setNotice(e instanceof Error?e.message:'Unable to open conversation.')}
  }

  async function refresh(){
    setLoading(true);setNotice('');
    try{
      const id=localStorage.getItem('mdsm:selectedWorkspaceId')||'';
      if(!id){location.href='/dashboard';return}
      setWorkspaceId(id);
      await Promise.all([loadConversations(id),loadTemplates(id)]);
    }catch(e){setNotice(e instanceof Error?e.message:'Unable to load WhatsApp inbox.')}
    finally{setLoading(false)}
  }

  useEffect(()=>{void refresh()},[]);
  useEffect(()=>{
    const onWorkspace=(event:Event)=>{
      const next=(event as CustomEvent<{workspaceId?:string}>).detail?.workspaceId||'';
      if(!next||next===workspaceId)return;
      setWorkspaceId(next);setSelectedId('');setMessages([]);setNotice('');setLoading(true);
      void Promise.all([loadConversations(next),loadTemplates(next)])
        .catch(e=>setNotice(e instanceof Error?e.message:'Unable to switch WhatsApp workspace.'))
        .finally(()=>setLoading(false));
    };
    window.addEventListener('mdsm:workspace-changed',onWorkspace);
    return()=>window.removeEventListener('mdsm:workspace-changed',onWorkspace);
  },[workspaceId]);
  useEffect(()=>{if(!workspaceId)return;const timer=window.setInterval(()=>{void loadConversations(workspaceId).catch(()=>{})},10000);return()=>window.clearInterval(timer)},[workspaceId,query]);

  const selected=useMemo(()=>conversations.find(c=>c.id===selectedId)||null,[conversations,selectedId]);

  async function send(){
    if(!selected)return;
    setSending(true);setNotice('');
    try{
      const t=await token();
      const payload:any={workspaceId,conversationId:selected.id};
      if(templateMode){
        if(!selectedTemplate)throw new Error('Select an approved template.');
        payload.templateName=selectedTemplate;
        payload.templateParameters=parameters.split(',').map(x=>x.trim()).filter(Boolean);
      }else payload.text=text;
      const r=await fetch('/api/whatsapp/messages',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d?.error||'Unable to send message.');
      setText('');setParameters('');
      await openConversation(selected.id);
      await loadConversations(workspaceId);
    }catch(e){setNotice(e instanceof Error?e.message:'Unable to send message.')}
    finally{setSending(false)}
  }

  return <AppShell title="WhatsApp Inbox"><div className="wa-inbox"><style jsx>{styles}</style>
    <header className="head"><div><div className="eyebrow">WHATSAPP • SHARED INBOX</div><h1>WhatsApp Inbox</h1><p className="sub">Workspace conversations, message status and template replies in one place.</p></div><div className="actions"><button className="btn" onClick={()=>void refresh()}>↻ Refresh</button><button className="btn primary" onClick={()=>location.href='/dashboard/settings#connections'}>Connection Settings</button></div></header>
    {notice&&<div className="notice">{notice}</div>}
    {loading?<div className="empty"><strong>Loading WhatsApp Inbox…</strong></div>:<div className="layout">
      <aside className="list"><div className="search"><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void loadConversations(workspaceId)}} placeholder="Search contact or phone…" /></div>
      {conversations.length?conversations.map(c=><button key={c.id} className={'conv '+(c.id===selectedId?'active':'')} onClick={()=>void openConversation(c.id)}><span className="avatar">{(c.contact_name||c.phone).slice(0,2).toUpperCase()}</span><span className="copy"><span className="top"><strong>{c.contact_name||c.phone}</strong><time>{c.last_message_at?new Date(c.last_message_at).toLocaleDateString():''}</time></span><p>{c.last_message_preview||'No messages yet'}</p></span>{c.unread_count>0&&<span className="badge">{c.unread_count}</span>}</button>):<div className="empty"><strong>No WhatsApp conversations</strong><span>Incoming messages will appear here after the official connection and webhook are live.</span></div>}
      </aside>
      <section className="chat">{selected?<><header className="chat-head"><div className="person"><strong>{selected.contact_name||selected.phone}</strong><span>{selected.phone}</span></div><span className={'pill '+(selected.service_window_open?'':'off')}>{selected.service_window_open?'24h reply window open':'Template required'}</span></header>
      <div className="messages">{messages.length?messages.map(m=><div key={m.id} className={'bubble '+(m.direction==='outbound'?'out':'')}><div>{m.body||'['+m.type+']'}</div><div className="meta">{new Date(m.created_at).toLocaleString()} · {m.provider_status}{m.error_message?' · '+m.error_message:''}</div></div>):<div className="empty"><strong>No messages yet</strong><span>Messages received from this contact will appear here.</span></div>}</div>
      <div className="composer"><div className="mode"><button className={!templateMode?'active':''} disabled={!selected.service_window_open} onClick={()=>setTemplateMode(false)}>Free-form Reply</button><button className={templateMode?'active':''} onClick={()=>setTemplateMode(true)}>Template</button></div>
      {templateMode?<div className="compose-row"><select className="select" value={selectedTemplate} onChange={e=>setSelectedTemplate(e.target.value)}><option value="">Select approved template…</option>{templates.map(t=><option key={t.id} value={t.name}>{t.name} · {t.language}</option>)}</select><input className="param" value={parameters} onChange={e=>setParameters(e.target.value)} placeholder="Parameters, comma-separated" /><button className="send" disabled={sending||!selectedTemplate} onClick={()=>void send()}>{sending?'Sending…':'Send'}</button></div>:<div className="compose-row"><textarea className="textarea" rows={3} value={text} onChange={e=>setText(e.target.value)} disabled={!selected.service_window_open} placeholder={selected.service_window_open?'Type your reply…':'24-hour window is closed; use an approved template.'}/><button className="send" disabled={sending||!text.trim()||!selected.service_window_open} onClick={()=>void send()}>{sending?'Sending…':'Send'}</button></div>}
      <div className="helper">{templateMode?'Approved templates can be used to start or continue a conversation outside the open customer service window.':selected.service_window_open?'Free-form replies are available while the customer service window is open.':'The customer service window is closed. An approved template is required.'}</div></div></>:<div className="empty"><strong>Select a conversation</strong><span>Choose a contact to view and reply.</span></div>}</section>
    </div>}
  </div></AppShell>;
}