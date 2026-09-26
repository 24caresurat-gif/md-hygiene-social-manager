# WhatsApp Business + Contacts Setup

The WhatsApp module uses Meta Embedded Signup and the WhatsApp Business App coexistence flow. It does not scrape WhatsApp Web.

## Vercel environment variables

Set these in the Vercel project:

- `META_APP_ID` — existing Meta app ID.
- `META_APP_SECRET` — existing Meta app secret; server only.
- `NEXT_PUBLIC_META_APP_ID` — same public Meta app ID for the browser SDK.
- `NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` — WhatsApp-specific Login for Business Embedded Signup configuration ID.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only Supabase service role key.
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — a private random verification string.
- `WHATSAPP_GRAPH_VERSION` — optional; defaults to `v25.0`.

Never expose `META_APP_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` as `NEXT_PUBLIC_` variables.

## Meta setup

The Meta app needs Facebook Login for Business configured for WhatsApp Embedded Signup, with WhatsApp Business Platform access and the required permissions. Meta's current Embedded Signup documentation also requires the app's onboarding flow to complete the server-side WABA setup and webhook subscription. citeturn577945search0turn592468search6

The website needs HTTPS and the Vercel production domain must be allowed in the Meta app's JavaScript SDK / OAuth settings. citeturn592468search6

For coexistence with the WhatsApp Business App, the client launches Embedded Signup with `featureType: "whatsapp_business_app_onboarding"`. Meta returns an authorization code through the Login callback and the WABA / phone IDs through the `WA_EMBEDDED_SIGNUP` session message; the authorization code is exchanged only on the server. citeturn931999search0turn592468search0

## Webhook

Set the Meta callback URL to:

`https://<your-vercel-domain>/api/whatsapp/webhook`

The webhook handles `smb_app_state_sync` and stores only contact name, phone number, WhatsApp user ID, and sync timestamps. It does not store chat history. Meta's coexistence contact synchronization is delivered through the `smb_app_state_sync` webhook field. citeturn685041search0

After onboarding, the backend requests the one-time contact sync using `/<PHONE_NUMBER_ID>/smb_app_data` with `sync_type: "smb_app_state_sync"`; the resulting contacts arrive through the webhook. citeturn685041search0

## App flow

Settings → Connect WhatsApp Business → Meta Embedded Signup → WABA/number onboarding → server-side token exchange → WABA webhook subscription → contact sync → WhatsApp Contacts → Select → Export CSV.
