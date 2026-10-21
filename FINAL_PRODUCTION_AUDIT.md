# Final Production Audit

## Current status (2026-10-21)
- Latest production deployment is READY: `dpl_J4BA85NuLsi8sd9XWRqtFYTJu6Uf`, commit `b360815ef36659db90218e7d9d68317a90b74dcd`.
- Provider-token client reads/writes are restricted; server-side connection operations validate workspace authorization.
- Accounts and Settings expose workspace-wide connection metadata without returning provider tokens.
- Latest sidebar uses independently scrollable grouped navigation.
- Supabase snapshot: 58 public tables, all 58 with RLS enabled; 73 remote applied migration records and 28 SQL files tracked in GitHub.
- Catalogue order calculations, CRM link triggers and Digital Card CRM link triggers have rollback-only database tests; no temporary test records remain.

## Not yet 100% live-certified
- Real browser tests for Owner/Admin/Staff and Workspace A/B isolation.
- Public Catalogue checkout, Digital Card forms and CRM task/workflow flows with controlled data.
- Supabase Auth leaked-password protection must be enabled from the Supabase Auth dashboard.
- AI caption/image generation needs a real `OPENAI_API_KEY` set in Vercel Production; its absence currently causes the AI generate/edit endpoints to return 503.
- Real provider flows remain last: Facebook/Instagram OAuth and publishing; WhatsApp Embedded Signup, webhooks/templates/campaigns/bot; Google Business OAuth, location/review import and replies.
- Desktop/mobile visual pass and runtime error scan after the above E2E tests.

## Safety
- Do not replay/repair Supabase migration history blindly; see `docs/SUPABASE_MIGRATION_RECONCILIATION.md`.
- Do not paste secret values into chat or commits.
- A successful build/deployment proves code compilation/deploy, not provider-level publishing or authenticated cross-workspace behavior.
