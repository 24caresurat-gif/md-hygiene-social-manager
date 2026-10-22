# MD Hygiene Social Manager — Project Master Guide

**Repository:** `24caresurat-gif/md-hygiene-social-manager`  
**Production URL:** https://md-hygiene-social-manager.vercel.app  
**Stack:** Next.js App Router, TypeScript, Supabase Auth/Postgres/Storage, Vercel  
**Guide intent:** one reliable overview of what the system contains, what each module does, its main routes/APIs, and what must still be tested before final sign-off.

## Current verified deployment snapshot

- Current application-runtime deployment: READY (`dpl_9fAjpdx9iY3YyHF4GcFWWmswGdHB`), code commit `d672d6d9896113eccd74d28a3af423047e742e2d`.
- Provider-token direct client reads/writes are revoked and verified in live Supabase privileges; Facebook/Instagram OAuth writes and disconnect operations use authorized server-side access.
- Accounts and Settings both list workspace-wide connection metadata without sending provider tokens to the browser; Meta token health/reconnect state is saved server-side.
- Sidebar navigation is grouped into collapsible sections while preserving role-filtered navigation and independent scrolling.
- Dependency security/reproducibility: `package-lock.json` is committed; Next.js is locked to `15.5.28` and Sharp to patched `0.35.5`. The latest main quality run passed `npm ci`, `npm audit --audit-level=high`, TypeScript and the production build.
- Google Business location/review imports use server-only database writes after workspace management authorization; live OAuth/import/reply checks remain pending for the final provider phase.
- Workspace RLS helper functions now live in the non-exposed `private` schema with empty `search_path`; the helper-related SECURITY DEFINER warnings cleared from Supabase Security Advisor.
- The latest RLS policy migration split 13 overlapping `FOR ALL` policies into 39 INSERT/UPDATE/DELETE policies while preserving predicates and existing SELECT policies. Supabase Performance Advisor no longer reports the multiple-permissive-policy warning; 98 unused-index entries remain informational and should not be dropped blindly.
- The production GitHub Actions scheduler is configured and recent scheduled runs returned HTTP 200 from both the publishing and CRM task-due workers. The inspected run had zero due jobs; verify actual posts/tasks once real scheduled work exists. The duplicate legacy publisher has been made manual-only.
- Tracked SQL migration inventory is documented in [SUPABASE_MIGRATION_RECONCILIATION.md](SUPABASE_MIGRATION_RECONCILIATION.md); the latest audit found 78 applied migration records and 33 tracked SQL files. Preserve production migration history; do not replay tracked files blindly.
- This is not the same as end-to-end certification. Real-account OAuth/publishing, workspace-isolation tests, cron invocation, and full user flows remain in the finalization checklist. Vercel deployment protection blocked the available route smoke-test fetch, so do not treat route HTTP behavior as verified.

## Product modules and what they do

### 1. Login, workspaces, team and permissions
**Purpose:** users work inside a selected workspace; module visibility and management permissions depend on the member's role/permission matrix.

- Pages: `/login`, `/dashboard`, `/dashboard/brands`, `/dashboard/settings`, `/dashboard/settings/access`
- API families: `/api/auth/session`, `/api/brands`, `/api/workspaces/me`, `/api/workspace-access`, `/api/workspace-employees`, `/api/admin/memberships`, `/api/admin/permissions`, `/api/admin/staff`, `/api/admin/workspaces`
- Main behavior: choose a workspace, load the signed-in user's workspace access, show only permitted navigation/modules, manage employees and roles.
- Final checks: owner/admin/member permission boundaries, direct URL access, and data isolation between two real workspaces.

### 2. Social content creation and publishing
**Purpose:** create, save, submit, approve, schedule and track social posts.

- Pages: `/dashboard/publish`, `/dashboard/drafts`, `/dashboard/calendar`, `/dashboard/admin/approvals`, `/dashboard/admin/approval-history`, `/dashboard/history`, `/dashboard/analytics`, `/dashboard/media`
- Creative pages: `/dashboard/creative-studio`, `/dashboard/creative-insights`
- API families: `/api/drafts`, `/api/drafts/submit`, `/api/approvals/submit`, `/api/admin/approvals`, `/api/admin/draft-approvals`, `/api/scheduled-posts`, `/api/cron/publish`, `/api/publishing-history`, `/api/dashboard/metrics`, `/api/media/upload`
- AI API family: `/api/ai/caption`, `/api/creative/generate`, `/api/creative/edit`, `/api/creative/save-draft`
- Typical flow: staff drafts content → optionally uses AI assistance → submits for approval → authorized reviewer approves/requests changes/rejects → approved content may be scheduled/published → history and analytics track the result.
- Safety principle: AI-generated content is a draft; publishing permissions and approval policy remain authoritative.
- Final checks: status transitions, media upload, timezone display, retry behavior, and real connected-account publish.

### 3. Connected social accounts
**Purpose:** centrally manage Facebook, Instagram and Google Business account connections. Connection buttons are intentionally in Settings, not distributed across feature pages.

- UI: `/dashboard/settings#connections`, `/dashboard/accounts`
- API families: `/api/meta/facebook/login`, `/api/meta/facebook/callback`, `/api/meta/facebook/connect`, `/api/meta/facebook/pages`, `/api/meta/facebook/publish`; `/api/meta/instagram/login`, `/api/meta/instagram/callback`, `/api/meta/instagram/sync`, `/api/meta/instagram/publish`; `/api/social-accounts/health`, `/api/social-accounts/disconnect`
- Token handling: use server-side handlers; never put app secrets or provider access tokens in public frontend variables.
- **Intentionally pending:** live OAuth and real-account tests for Facebook, Instagram and Google Business Profile. Do not mark these as connected just because the UI/API exists.

### 4. Product Catalogue and public storefront
**Purpose:** workspace-specific products/categories with a customer-facing catalogue and order path.

- Pages: `/dashboard/catalog`, `/dashboard/catalog/orders`, public `/catalog/[slug]`
- API: `/api/catalog`, `/api/catalog/orders`, `/api/catalog/suggestions`, `/api/public/catalog`, `/api/public/catalog/checkout`
- Capabilities implemented in the product scope: product/category management, featured products, offer/compare price, coupon discounts, public storefront, cart/wishlist support, and workspace separation.
- Final checks: coupon edge cases, minimum order/max use rules, stock handling, order creation and workspace isolation.

### 5. Digital Card and lead capture
**Purpose:** publish a workspace business card/profile and collect prospect leads.

- Pages: `/dashboard/digital-card`, `/dashboard/digital-card/leads`, public `/digital-card/[slug]`
- API: `/api/digital-card`, `/api/digital-card/leads`, `/api/public/digital-card`
- Intended card content: profile/cover images, business details, contact methods, social links, services, testimonials, forms, payment link and public profile URL.
- Final checks: public slug rendering, mobile display, form validation, lead persistence and permissions for editing/leads.

### 6. CRM
**Purpose:** maintain contacts, leads and follow-up tasks; qualify leads and report on pipeline.

- Pages: `/dashboard/crm`, `/dashboard/crm/reports`, `/dashboard/crm/automation`
- API: `/api/crm/qualify`, `/api/crm/whatsapp-sync`, `/api/crm/workflows`, `/api/crm/workflows/run`, `/api/crm/workflows/trigger`, `/api/cron/crm-task-due`
- Lead qualification: keyword rules add/remove score deltas according to configured rules; qualified stages and active workflows can be triggered by supported events.
- Workflow actions include task creation, lead stage changes, approved WhatsApp template sending, and product suggestions.
- Reports show pipeline/stage outcomes and task/follow-up health.
- Execution history: the Automation page includes recent workflow runs and result detail.
- Production scheduling: `.github/workflows/production-scheduler.yml` is the single automatic scheduler; the duplicate `Scheduled Publishing` workflow is manual-only. The scheduler was recently invoked successfully by GitHub Actions and both protected workers returned HTTP 200. The observed run processed zero posts/tasks because no due jobs existed, so a successful worker invocation is not proof of a real social post publish. If the repo/environment is recreated, follow [Cron Automation Setup](CRON_AUTOMATION_SETUP.md) to configure the matching `CRON_SECRET`, `VERCEL_AUTOMATION_BYPASS_SECRET`, Vercel Automation Bypass and `ENABLE_PRODUCTION_SCHEDULER=true`. `vercel.json` no longer registers a daily-only Vercel cron.
- `/api/cron/publish` processes due approved social posts and scheduled WhatsApp campaigns; it is also the campaign worker in this scheduler tick. The standalone `/api/cron/whatsapp-campaigns` endpoint is not invoked by the new workflow to avoid racing the same campaign queue.
- The publishing and CRM cron handlers declare a 60-second maximum duration. Each endpoint validates `Authorization: Bearer $CRON_SECRET` and fails closed when the secret is absent. Do not expose the secret in browser code, logs, or commits.
- Duplicate protection: production migration `20261010105454_crm_task_due_atomic_claim` adds unique partial index `crm_workflow_runs_task_due_once_idx` on `(workflow_id, entity_id)` for `entity_type='crm_task'`. The route inserts a `queued` execution claim before running workflow actions, then finalizes that row. A second concurrent claim for the same workflow/task pair is skipped instead of running actions twice.
- Recovery trade-off: if a worker crashes after recording the claim but before finalizing the run, the queued claim prevents automatic replay. Review/repair of stale queued entries needs an explicit recovery policy so automatic recovery cannot repeat already executed external actions.
- Current known behavior: the CRM worker scans open tasks with due times and linked leads; tasks without a lead are skipped. Production currently has zero CRM workflow definitions, so positive execution and concurrent HTTP tests remain pending. The available Vercel fetch path is blocked by deployment protection, but GitHub Actions will provide an authenticated bearer request once its secret is configured.

### 7. WhatsApp Business
**Purpose:** shared inbox and conversation/message management, approved templates, campaigns, interactive replies, product suggestions, bot flows, contacts sync and CRM integration.

- Pages: `/dashboard/whatsapp`, `/dashboard/whatsapp-contacts`, `/dashboard/whatsapp/templates`, `/dashboard/whatsapp/campaigns`, `/dashboard/whatsapp/buttons`, `/dashboard/whatsapp/product-suggestions`, `/dashboard/whatsapp/bot`, `/dashboard/whatsapp/bot-logs`
- API: `/api/whatsapp/connect`, `/api/whatsapp/connection`, `/api/whatsapp/contacts`, `/api/whatsapp/conversations`, `/api/whatsapp/messages`, `/api/whatsapp/templates`, `/api/whatsapp/campaigns`, `/api/whatsapp/campaigns/[id]/launch`, `/api/whatsapp/interactive`, `/api/whatsapp/bot-flows`, `/api/whatsapp/webhook`, `/api/cron/whatsapp-campaigns`
- Bot engine: supports localized flow responses, buttons, collect steps, product suggestions and handoff; it respects WhatsApp's 24-hour service window.
- After-hours path: when an approved fallback template is configured in the bot flow, the engine can send that template outside the 24-hour window; otherwise it logs that a template is required.
- CRM link: inbound WhatsApp can create/update CRM contact/lead, apply lead rules and trigger configured workflows.
- Final checks: actual Meta onboarding/webhook signature verification, approved-template delivery, inbound/outbound messages, opt-in rules, campaign retries and CRM sync. Code paths alone do not prove a live provider connection.

### 8. Google Business Profile / Review Suite
**Purpose:** review management, replies, requests, feedback forms, review suggestions/images, keywords, posts, analytics and business profile sync.

- Pages: `/dashboard/gmb` and subpages for reviews, management, responses, requests, request analytics, feedback forms, AI form suggestions, images, keywords, posts, approvals, analytics, rating improvement, leads and status.
- API families: `/api/google/business/login`, `/api/google/business/callback`, `/api/google/business/sync`, `/api/google/business/reviews`, `/api/google/business/reply`, `/api/google/business/suggestion`, `/api/google/business/feedback-suggestion`, `/api/google/business/review-image`, `/api/google/business/management`, `/api/google/business/posts`, `/api/google/business/post-ai`, `/api/google/business/post-approvals`, `/api/google/business/analytics`, `/api/google/business/insights`, `/api/google/business/request-analytics`, `/api/google/business/rating-improvement`
- Settings: actual Google connection entry is under `/dashboard/settings#connections`.
- Final checks: Google Cloud API approval/enabled APIs, OAuth redirect URL/env variables, live location/review import, reply publish/delete and provider access scopes. No fake Google data should be presented as live.

### 9. Review requests and negative feedback workflow
**Purpose:** public tokenized review request pages, feedback capture and tracking of Google-link clicks.

- Pages: `/review-request`, `/review-request/[token]`
- API: `/api/public/review-request`, `/api/review-request/[token]`, `/api/review-request/[token]/google-click`, `/api/workspace-review-settings`
- Settings cover low-rating private feedback guidance and business-specific AI response draft preferences.
- Compliance check: the customer must retain a clear public-review option; do not delete, hide or fabricate customer reviews.

### 10. Dashboard navigation and shared UI
**Purpose:** workspace switcher, role-filtered sidebar, mobile drawer and consistent subpage layout.

- Shared shell: `app/dashboard/components/AppShell.tsx`
- Styles: `app/globals.css`, `app/dashboard/ui.css`, design-system styles.
- Latest sidebar fix: compact width/spacing; navigation area has its own vertical scrollbar; logo and profile remain fixed. Current production deployment containing the fix is READY.
- UI follow-up: group navigation items into collapsible sections (Main, Business, CRM, Communication, Reviews, Settings) only after ensuring existing permission-based visibility is preserved.

## Core shared libraries

| File | Role |
|---|---|
| `lib/workspace-auth.ts` | Authenticated user, workspace membership and authorization helpers for server routes. |
| `lib/supabase-browser.ts` | Browser Supabase client for authenticated frontend workflows. |
| `lib/meta-token.ts` | Meta token/expiry-related helpers used by social connection flows. |
| `lib/google-business.ts`, `lib/google-business-sync.ts` | Google Business API helpers and import/sync logic. |
| `lib/whatsapp-server.ts` | Server-side WhatsApp connection, provider requests, and access helpers. |
| `lib/whatsapp-bot.ts` | Bot flow execution, localization, session/event handling and after-hours template fallback. |
| `lib/whatsapp-campaign-worker.ts` | Campaign send/worker logic. |
| `lib/crm-workflows.ts` | CRM workflow action executor and trigger helper. |
| `lib/account-selector.ts` | Shared connected-account selection helper. |

## Supabase data / security approach

- Migration directory: `supabase/migrations/`
- Relevant groups include scheduled posts/publishing history, token health and RLS hardening, WhatsApp messaging, workspace auth/role defaults, Google Business permissions and workspace review settings.
- Workspace-owned rows must stay isolated by workspace and policy/helper checks. A route that successfully compiles is not proof that its RLS policy is correct.
- The final audit must verify that all committed migrations are applied in Supabase and test unauthorized cross-workspace reads/writes with separate real users.
- Do not send service-role keys, app secrets, OAuth client secrets or access/refresh tokens to browser code, markdown documentation, or Git commits.

## External setup variables / provider items to review

Variable **names** belong in setup docs; secret values belong only in Vercel's encrypted environment settings.

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Facebook/Instagram: Meta app ID/secret, correct current permissions/scopes, callback URLs, App Review/Live Mode requirements, provider token refresh/reconnect.
- Google Business Profile: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, approved/enabled Business Profile APIs.
- WhatsApp: Meta app settings, Embedded Signup configuration ID, webhook verify token, webhook URL, app secret and live WABA/phone-number onboarding.
- AI: `OPENAI_API_KEY` and optional model setting where AI draft/suggestion routes require it.
- Scheduler: `CRON_SECRET`; confirm production target and next scheduled execution.

## Final sign-off rules

Only mark a feature **Verified** after:
1. production build is READY;
2. authorized user can complete the expected UI flow;
3. the persisted DB state is correct;
4. another workspace cannot access the same row;
5. expected API/provider behavior succeeds or a known provider prerequisite is explicitly documented;
6. logs show no new runtime error for the test.
