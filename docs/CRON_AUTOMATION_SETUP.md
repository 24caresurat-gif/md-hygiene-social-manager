# Production Cron Automation

## Why this uses GitHub Actions

The linked Vercel team is on the Hobby plan. Vercel Hobby cron jobs run at most once per day, which is not frequent enough for scheduled social publishing and WhatsApp campaigns. The repository workflow `.github/workflows/production-scheduler.yml` therefore triggers the production workers every five minutes from GitHub Actions.

The workflow calls these production endpoints, in order:

1. `GET /api/cron/publish` — processes due approved Facebook/Instagram posts and scheduled WhatsApp campaigns.
2. `GET /api/cron/crm-task-due` — evaluates overdue CRM tasks and fires matching task-due workflows.

The standalone `/api/cron/whatsapp-campaigns` endpoint is intentionally not called in the same scheduler tick because the publishing worker already processes scheduled WhatsApp campaigns. This avoids two workers racing the same campaign queue.

Both called handlers require `Authorization: Bearer <CRON_SECRET>`, and allow up to 60 seconds for a run. The workflow does not retry timed-out requests automatically because these workers can perform external side effects; the next scheduled tick can retry jobs using their persisted state.

## One-time required setup

GitHub Actions does not automatically receive Vercel environment variables. Add the same production cron secret to GitHub:

1. Open the repository: https://github.com/24caresurat-gif/md-hygiene-social-manager
2. Go to **Settings → Secrets and variables → Actions → New repository secret**.
3. Set the name to `CRON_SECRET`.
4. Set its value to exactly the production `CRON_SECRET` configured in Vercel for this project. Keep it in the secret field only; do not commit it or paste it into a chat, issue, or log.

The secret is currently configured as a production-only Vercel environment variable. The GitHub secret must be added separately; this cannot be inferred from the variable's presence in Vercel.

## Verify the scheduler

1. Open the repository's **Actions** tab.
2. Select **Production Scheduler** and choose **Run workflow**.
3. Wait for both endpoint steps to return a successful HTTP status. A missing or mismatched secret returns HTTP 401 and the workflow fails.
4. Check Vercel runtime logs for `/api/cron/publish` and `/api/cron/crm-task-due` after the run.

A successful HTTP response proves the worker endpoint ran, not that a provider post was published. Real Facebook/Instagram connections, WhatsApp onboarding, and provider-level end-to-end tests remain intentionally pending until the final integration phase.

## Scheduling expectations

GitHub Actions uses the default branch's latest commit for scheduled workflows and allows a five-minute minimum interval. Schedule execution can still be delayed during GitHub load; it is not a hard real-time guarantee. The workflow can also be started manually via `workflow_dispatch`.

Use the production publishing history and campaign recipient statuses to verify the outcome. The build should not mark provider publishing successful unless the provider accepted the request and the database recorded the result.
