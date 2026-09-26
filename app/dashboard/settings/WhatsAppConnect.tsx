'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    FB?: { init: (config: Record<string, unknown>) => void; login: (cb: (response: any) => void, options: Record<string, unknown>) => void };
    fbAsyncInit?: () => void;
  }
}

type Props = { workspaceId: string; onConnected?: () => void };

export default function WhatsAppConnect({ workspaceId, onConnected }: Props) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<'loading'|'connected'|'idle'>('loading');
  const [detail, setDetail] = useState('');
  const infoRef = useRef<{ wabaId: string; phoneNumberId?: string | null; businessId?: string | null }>({ wabaId: '' });
  const codeRef = useRef('');
  const sentRef = useRef(false);

  const appId = process.env.NEXT_PUBLIC_META_APP_ID || '1578165993688458';
  const configId = process.env.NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID || '';

  useEffect(() => {
    let mounted = true;
    const loadConnection = async () => {
      try {
        const token = (await import('../../../lib/supabase-browser')).getSupabase
          ? (await (await import('../../../lib/supabase-browser')).getSupabase().auth.getSession()).data.session?.access_token
          : '';
        const r = await fetch('/api/whatsapp/connection?workspaceId=' + encodeURIComponent(workspaceId), {
          headers: { Authorization: 'Bearer ' + (token || '') }, cache: 'no-store'
        });
        const d = await r.json().catch(() => ({}));
        if (mounted && d.connected) setStatus('connected');
      } catch {}
    };
    void loadConnection();

    if (!configId) { setStatus('idle'); setDetail('WhatsApp Embedded Signup Config ID is not configured yet.'); return; }

    if (window.FB) { setReady(true); setStatus('idle'); return; }
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: true, version: 'v25.0' });
      if (mounted) { setReady(true); setStatus('idle'); }
    };
    const script = document.createElement('script');
    script.async = true; script.defer = true; script.crossOrigin = 'anonymous';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    document.body.appendChild(script);

    const listener = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
      let data: any = event.data;
      try { if (typeof data === 'string') data = JSON.parse(data); } catch { return; }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
      const d = data.data || {};
      if (d.waba_id) infoRef.current = { wabaId: String(d.waba_id), phoneNumberId: d.phone_number_id ? String(d.phone_number_id) : null, businessId: d.business_id ? String(d.business_id) : null };
      const ev = String(data.event || '').toUpperCase();
      if (ev === 'CANCEL') setDetail('WhatsApp setup was cancelled.');
      if (ev === 'ERROR') setDetail(d.error_message || 'WhatsApp setup returned an error.');
      void maybeComplete();
    };
    window.addEventListener('message', listener);
    return () => { mounted = false; window.removeEventListener('message', listener); };
  }, [workspaceId, configId]);

  async function maybeComplete() {
    if (!codeRef.current || !infoRef.current.wabaId || sentRef.current) return;
    sentRef.current = true; setStatus('loading'); setDetail('Finishing WhatsApp connection…');
    try {
      const session = infoRef.current;
      const sb = await import('../../../lib/supabase-browser');
      const token = (await sb.getSupabase().auth.getSession()).data.session?.access_token || '';
      const r = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId, code: codeRef.current,
          wabaId: session.wabaId, phoneNumberId: session.phoneNumberId || null, businessId: session.businessId || null
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'WhatsApp connection failed.');
      setStatus('connected'); setDetail(d?.displayPhoneNumber ? 'Connected: ' + d.displayPhoneNumber : 'WhatsApp Business connected.');
      onConnected?.();
    } catch (e) {
      sentRef.current = false;
      setStatus('idle'); setDetail(e instanceof Error ? e.message : 'WhatsApp connection failed.');
    }
  }

  function launch() {
    if (!window.FB) { setDetail('Meta SDK is still loading.'); return; }
    if (!configId) { setDetail('Set NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID in Vercel first.'); return; }
    sentRef.current = false; infoRef.current = { wabaId: '' }; codeRef.current = '';
    window.FB.login((response) => {
      const code = response?.authResponse?.code;
      if (code) { codeRef.current = code; void maybeComplete(); }
      else { setStatus('idle'); setDetail('WhatsApp signup was not completed.'); }
    }, {
      config_id: configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding' }
    });
  }

  return <div style={{ marginTop: 14 }}>
    <button className="btn btn-primary" disabled={!ready || status === 'loading' || !configId} onClick={launch}>
      {status === 'loading' ? 'Connecting…' : status === 'connected' ? 'Reconnect WhatsApp Business' : 'Connect WhatsApp Business'}
    </button>
    {detail && <div className="notice" style={{ marginTop: 10 }}>{detail}</div>}
    {!configId && <div className="muted" style={{ marginTop: 8 }}>Meta Embedded Signup needs a WhatsApp-specific Login for Business configuration ID.</div>}
  </div>;
}
