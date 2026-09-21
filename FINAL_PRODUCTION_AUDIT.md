# Final Production Audit

This branch contains the production completion work for the Social Media Manager.

## Verification checklist
- Token expiry / reconnect architecture
- Centralized Facebook / Instagram / Google Business connection settings
- Publishing history
- Draft CRUD
- Scheduled publishing worker and retry/idempotent claim
- Vercel cron configuration
- RLS/security migrations
- Workspace-scoped analytics
- Responsive dashboard history/drafts UI
- TypeScript and production build CI

Production prerequisites remain external configuration only: confirm the Supabase migrations are applied, configure CRON_SECRET, then complete the Facebook, Instagram and Google Business OAuth connection setup from Dashboard → Settings → Channel Connections in Vercel/Meta/Google.
