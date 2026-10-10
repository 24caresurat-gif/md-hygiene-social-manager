# MD Hygiene Social Manager

A multi-workspace social media and business engagement platform built with Next.js, TypeScript, Supabase and Vercel.

## Start here

- [Project Master Guide](docs/PROJECT_MASTER_GUIDE.md) — module descriptions, page routes, API families, data/security approach and external setup areas.
- [Project Finalization Checklist](docs/PROJECT_FINALIZATION_CHECKLIST.md) — prioritized work, acceptance tests and release sign-off.
- [Google Business Profile OAuth Setup](GOOGLE_BUSINESS_OAUTH_SETUP.md) — Google Cloud/OAuth prerequisites.
- [WhatsApp Business Setup](WHATSAPP_SETUP.md) — Meta Embedded Signup, webhook and contacts sync prerequisites.
- [Final Production Audit](FINAL_PRODUCTION_AUDIT.md) — deployment and operational baseline.
- [Code Complete / E2E Pending](docs/CODE_COMPLETE_PENDING_E2E.md) — live-account tests not yet verified.

## Major features

- Workspace dashboard, team roles and permissions
- Social content drafts, approvals, calendar, scheduling, publishing history and analytics
- AI caption/content and creative assistance
- Product Catalogue with public storefront and orders
- Digital Card with public profile and lead capture
- CRM contacts, leads, qualification, tasks, reports and workflows
- WhatsApp inbox, contacts, templates, campaigns, button replies, bot flows and event logs
- Google Business Profile review management, requests, feedback and AI-assisted response tools
- Settings-based central connection controls

## Development

Requires a compatible Node.js version and environment variables for the Supabase project. Provider secrets must stay server-side.

```bash
npm install
npm run dev
```

Check the production bundle before release:

```bash
npm run build
```

## Data and security basics

- Respect workspace isolation for every workspace-owned row.
- Use Supabase RLS and server-side workspace authorization helpers; never trust only a workspace ID supplied by the browser.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, Meta/Google app secrets, OAuth client secrets or provider access tokens in `NEXT_PUBLIC_*` variables.
- Publish only when the configured approval and permission checks permit it.
- Keep external social OAuth setup at the end of the current project finalization sequence as agreed.

## Current release status

The production deployment containing the compact, scrollable sidebar is marked READY in Vercel. The application is not considered fully final until the acceptance tests in [the finalization checklist](docs/PROJECT_FINALIZATION_CHECKLIST.md) are completed; building successfully alone is not live integration verification.
