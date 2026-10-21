# Final Production Audit

## Current status (2026-10-21)
- Latest production deployment is READY: `dpl_HQ6PimM8U4pGtbREmUc2uGAnAyw9`, commit `888a3d9229c9d42e4ad958a09baf2d4a1884ff30`.
- Supabase snapshot: 58 public tables, all 58 with RLS enabled; 75 remote applied migration records and 30 SQL files tracked in GitHub.
- Provider-token client reads/writes are restricted; connection OAuth/disconnect operations use server-side database access with workspace authorization.
- Accounts and Settings expose workspace-wide connection metadata without returning provider tokens; token status/reconnect state is saved server-side.
- RLS helper functions now reside in the non-exposed `private` schema with empty `search_path`; the related SECURITY DEFINER findings have cleared from Supabase Security Advisor. Its remaining security warning is Leaked Password Protection disabled.
- Vercel reported no grouped runtime errors in the last 24 hours at the time of this audit. Authenticated browser tests are still pending.
- Sidebar navigation uses independent scrolling and collapsible groups, preserving permission-filtered links.
- Catalogue order calculations, CRM link triggers and Digital Card CRM link triggers have rollback-only database tests; no temporary test records remain.

## Not yet 100% live-certified
- Real browser tests for Owner/Admin/Staff and Workspace A/B isolation.
- Public Catalogue checkout, Digital Card forms and CRM task/workflow flows with controlled data.
- Enable leaked-password protection in Supabase Auth.
- AI caption/image generation needs a real `OPENAI_API_KEY` set in Vercel Production; generate/edit endpoints currently return 503 without it.
- Google OAuth credentials `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are absent; configure them during the final Google Business integration stage.
- Real provider flows remain last: Facebook/Instagram OAuth and publishing; Meta App Review/scopes as needed; WhatsApp Embedded Signup, webhooks/templates/campaigns/bot; Google Business OAuth, location/review import and replies.
- Desktop/mobile visual pass and runtime error scan after the above E2E tests.

## Safety
- Do not replay/repair Supabase migration history blindly; see `docs/SUPABASE_MIGRATION_RECONCILIATION.md`.
- Do not paste secret values into chat or commits.
- A successful build/deployment proves code compilation/deploy, not provider-level publishing or authenticated cross-workspace behavior.
