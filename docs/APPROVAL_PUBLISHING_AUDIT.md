# Approval and Publishing Authorization Audit

**Audit date:** 2026-10-10  
**Repository:** [24caresurat-gif/md-hygiene-social-manager](https://github.com/24caresurat-gif/md-hygiene-social-manager)  
**Scope:** alternate scheduling APIs, draft submission/review, workspace-scoped publish endpoints, and cron eligibility.

## Findings addressed

### 1. Alternate scheduled-post creation path

Before this change, `POST /api/scheduled-posts` used the service-role client, checked that the brand belonged to the authenticated user, and verified account ownership/workspace association—but did not require active `workplace_members` membership or Content create/submit permission. It did not write `approval_status`, so the database default `approved` could leave a newly scheduled row eligible for cron publishing.

It now:
- Requires a valid authenticated user and active profile.
- Requires active membership in the target workspace.
- Requires `content.can_create` for drafts and `content.can_submit` for scheduled submissions, except workspace owners/admins.
- Validates all selected accounts are connected and belong to the selected workspace, without requiring the submitter to own the connected account.
- Explicitly sets draft rows to `approval_status='draft'`.
- Marks scheduled rows `approved` only for workspace owners/admins; staff submissions remain `pending`.

The publishing cron continues to select only rows with status `scheduled` or `failed` **and** `approval_status='approved'`, and conditionally claims the row before processing it. The database negative RLS probes described in the reconciliation report remain separate from HTTP route-level authorization tests.

### 2. Invalid scheduling timestamp could be treated as an immediate submission

`POST /api/approvals/submit` previously computed `isScheduled=false` for a malformed/past timestamp. If the UI sent such a value, the code could continue down the immediate-submission path instead of returning a scheduling error.

It now rejects a supplied malformed or non-future `scheduledFor` with HTTP 400. The composer now keeps the optional Schedule Date empty by default (unless opened with a calendar date), so an immediate submit does not accidentally send today's default date/time. Immediate publishing/submission remains possible only when the caller leaves the schedule field empty. The endpoint also blocks missing/inactive profiles.

### 3. Approval action for inactive profiles

The workspace draft-review helper now checks the caller's profile and refuses review actions for missing or inactive profiles. Permission-table read errors are returned as errors rather than being silently interpreted as an absent permission.

### 4. Workspace-scoped publish authorization

The duplicate draft-publishing endpoints now require a valid active user and workspace-scoped publish authority:
- Active global admin/owner, or
- Workspace owner/admin, or
- Workspace manager with **both** `approval.can_approve` and `publishing.can_publish`.

The approved record is checked before provider calls. Account authorization now binds selected connected accounts to the approved workspace, rather than requiring the account creator to be the same user who submitted the draft; this supports shared workspace-owned social accounts. The primary approval publish endpoint also verifies that the approval row, workspace, submitter and associated draft match.

## Deliberate direct-publish permission model

`/api/meta/facebook/publish` and `/api/meta/instagram/publish` are separate “publish now” endpoints. They authorize an active workspace member with `publishing.can_publish` (owners/admins are allowed directly). These endpoints accept new content and an account ID rather than a pending draft ID; they do not serve as a way to publish a specific pending draft. Product policy should continue treating `can_publish` as an explicit direct-publishing entitlement. The primary composer routes through `/api/approvals/submit`.

## Verification status

**Code changes committed:** yes.  
**Production build:** must be recorded from the deployment that includes this report/code revision.  
**Live authenticated HTTP tests:** still required for:
- Member without `can_submit` → POST `/api/scheduled-posts` denied.
- Member with `can_submit` → scheduled post is `pending`, never immediately eligible for cron.
- Owner/admin → scheduled post is `approved`.
- Draft creation → `approval_status='draft'`.
- Invalid/past `scheduledFor` → HTTP 400 and no approval row created.
- Inactive profile → submit/review/publish denied.
- Manager with approve but without publish permission → publish denied.
- Authorized workspace manager with both permissions → allowed to publish an already-approved draft.
- Two concurrent publish requests and retry after provider success but database/log failure: no duplicate provider post is not yet proven.

## Release gate

Do not mark the complete approval workflow as end-to-end tested until those HTTP cases and a browser composer/calendar journey pass. Real Facebook/Instagram/Google provider publish remains intentionally postponed until the final connection phase.
