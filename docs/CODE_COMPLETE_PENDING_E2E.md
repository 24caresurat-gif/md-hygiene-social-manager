# Code Complete / Live E2E Pending

The current application source and database changes are deployed; latest production deployment `dpl_HQ6PimM8U4pGtbREmUc2uGAnAyw9` (commit `888a3d9229c9d42e4ad958a09baf2d4a1884ff30`) is READY, and GitHub/Vercel builds are passing. The project must **not** be described as 100% certified until the live acceptance checks below pass. The production database currently has no catalogue products/orders, no Digital Cards, no CRM tasks/workflows, no WhatsApp connection/templates/campaigns/bot flows, and no Google Business profiles/reviews, so those user journeys cannot yet be certified against real saved records.

## Owner/operator steps still required

- Add a valid `OPENAI_API_KEY` to Vercel Production to enable AI caption/image generation/edit endpoints. The variable is currently absent; these endpoints intentionally return HTTP 503 without it. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` when the final Google Business integration phase begins; those credentials are also absent from the current Vercel environment inventory.
- In Supabase Auth settings, enable leaked-password protection. The remaining Supabase Security Advisor warning is this setting; see [official Supabase password-security guidance](https://supabase.com/docs/guides/auth/password-security).
- Complete signed-in browser tests with separate Workspace A/Workspace B users for Owner/Admin/Staff permissions, workspace switching and cross-workspace isolation.
- Visually verify the new collapsible sidebar groups, active-page auto-expansion and scroll behavior on desktop/tablet/mobile.
- Create a catalogue product and perform a public storefront cart/wishlist/coupon/checkout test; verify the order is workspace-scoped and linked to a CRM contact, lead and follow-up.
- Publish a Digital Card, open it signed out, submit each public form once and verify CRM linking and authorized-only access.
- Create a controlled CRM task/workflow and verify qualification, actions, execution history and duplicate-claim protection.
- Complete the Google public review request flow with a real token and check that a public Google review option remains available.
- Run an authenticated browser pass on desktop/mobile and inspect runtime logs after the tests.
- Complete the external provider phase last: Facebook and Instagram OAuth + real post test; Meta App Review/scopes as needed; WhatsApp Embedded Signup, signed webhook, template send/receive, bot/campaign/CRM tests; Google Business OAuth, location/review import and permitted reply tests.

## Previously verified in code/database (not a substitute for the steps above)

- Production deployment is READY; latest commit is recorded in the project finalization checklist.
- Token credentials are not directly readable/writable by `anon`/`authenticated` roles; provider operations run through authorized server-side routes.
- Workspace authorization helpers are in the non-exposed `private` schema; empty search_path and RLS synthetic-user probes passed after migration.
- Catalogue checkout math, stock/coupon atomicity, add-to-cart quantity increments and catalogue/CRM + Digital Card/CRM triggers passed rollback-only database tests with no persistent probe records.
- Production cron endpoints returned authenticated HTTP 200 on a recent GitHub Actions run, but it processed zero jobs; provider publishing still needs a real queued test.
- All 58 public tables currently have RLS enabled; complete live workspace-level negative read/write testing remains pending.

Do not replay or repair Supabase migration history blindly. See `docs/SUPABASE_MIGRATION_RECONCILIATION.md`.
