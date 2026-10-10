# Production Cron Automation

## Why this uses GitHub Actions

The linked Vercel team is on the Hobby plan. Vercel Hobby cron jobs run at most once per day, which is not frequent enough for scheduled social publishing and WhatsApp campaigns. The repository workflow `.github/workflows/production-scheduler.yml` therefore triggers the production workers every five minutes from GitHub Actions.

The workflow calls these production endpoints, in order:

1. `GET /api/cron/publish` — processes due approved Facebook/Instagram posts and scheduled WhatsApp campaigns.
2. `GET /api/cron/crm-task-due` — evaluates overdue CRM tasks and fires matching task-due workflows.

The standalone `/api/cron/whatsapp-campaigns` endpoint is intentionally not called in the same scheduler tick because the publishing worker already processes scheduled WhatsApp campaigns. This avoids two workers racing the same campaign queue.

Both called handlers require `Authorization: Bearer <CRON_SECRET>`, and allow up to 60 seconds for a run. The workflow does not retry timed-out requests automatically because these workers can perform external side effects; the next scheduled tick can retry jobs using their persisted state.

## One-time required setup

GitHub Actions does not automatically receive Vercel environment variables. Add two secrets:

1. In the Vercel project dashboard, open **Settings → Deployment Protection → Protection Bypass for Automation** and create a dedicated bypass secret (note: `GitHub Actions production cron scheduler`). Keep SSO/deployment protection enabled; do not make the production site public just to accommodate the scheduler.
2. Open the repository: https://github.com/24caresurat-gif/md-hygiene-social-manager
3. Go to **Settings → Secrets and variables → Actions → New repository secret**.
4. Add `CRON_SECRET` with the exact production value from Vercel Project Settings → Environment Variables.
5. Add `VERCEL_AUTOMATION_BYPASS_SECRET` with the dedicated value created in Vercel → Deployment Protection → Protection Bypass for Automation.
6. In the repository's **Settings → Secrets and variables → Actions → Variables** tab, create the repository variable `ENABLE_PRODUCTION_SCHEDULER` with value `true`. The scheduled workflow stays inactive while this variable is absent or not `true`, avoiding a stream of failed runs before setup is complete.

Keep both values only in encrypted secret fields; never commit or paste them into a chat, issue, or log. The current app's Vercel deployment has SSO protection enabled, so the workflow sends the bypass secret in the `x-vercel-protection-bypass` header as well as the application-level bearer secret. The available Vercel connection returned a permission error when attempting to create the bypass through the API, so this one-time protection setting must be created in the Vercel dashboard by an authorized project member.

## Verify the scheduler

1. Open the repository's **Actions** tab.
2. Select **Production Scheduler** and choose **Run workflow**.
3. Wait for both endpoint steps to return a successful HTTP status. A missing or mismatched secret returns HTTP 401 and the workflow fails.
4. Check Vercel runtime logs for `/api/cron/publish` and `/api/cron/crm-task-due` after the run.

A successful HTTP response proves the worker endpoint ran, not that a provider post was published. Real Facebook/Instagram connections, WhatsApp onboarding, and provider-level end-to-end tests remain intentionally pending until the final integration phase.

## Scheduling expectations

GitHub Actions uses the default branch's latest commit for scheduled workflows and allows a five-minute minimum interval. Schedule execution can still be delayed during GitHub load; it is not a hard real-time guarantee. The workflow can also be started manually via `workflow_dispatch`.

Use the production publishing history and campaign recipient statuses to verify the outcome. The build should not mark provider publishing successful unless the provider accepted the request and the database recorded the result.
