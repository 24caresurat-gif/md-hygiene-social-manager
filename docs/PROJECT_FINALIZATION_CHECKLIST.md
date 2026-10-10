# Project Finalization Checklist

This checklist is the operational source of truth for making the application tidy, documented and ready for a controlled final release.

**Rule:** do not mark something complete solely because a route exists or the deployment compiled. Mark it verified only after the acceptance test is recorded.

## Status key
- [x] Done / confirmed from current repository or deployment metadata
- [ ] Pending verification or implementation
- [~] Partly in place; final test/refinement remains

## A. Current baseline

- [x] Production deployment is READY at https://md-hygiene-social-manager.vercel.app (latest code deployment `dpl_J1Nh8FVbYg3g7a9vFiXQh22jgFjh`, commit `05f668fce69197f5355ce3906132a559865a6516`; Vercel build completed and deployment aliases are assigned). Vercel's available fetch tool still could not pass deployment protection for unauthenticated HTTP smoke tests.
- [x] Compact, independently scrollable sidebar is deployed and the latest production build is READY.
- [x] CRM execution history UI is present in main
- [x] WhatsApp bot logs page and navigation are present in main
- [x] CRM task-due API route exists and is authenticated with `CRON_SECRET`; the GitHub Actions scheduler is prepared for five-minute execution, pending the matching repository secret and live run.
- [x] Vercel runtime-error scan returned no runtime errors in the hour after deployment `dpl_J1Nh8FVbYg3g7a9vFiXQh22jgFjh` at audit time
- [ ] Run a real browser pass through key pages on desktop and mobile
- [ ] Capture final test date, tester, workspace used and observed result

## B. Priority 0 — Finalize core product safely

### B1. User, workspace and permissions
- [ ] Test owner/admin/staff access using separate test accounts.
- [ ] Verify changing the selected workspace reloads all workspace-owned lists and forms.
- [~] Read-only SQL-session RLS probe as an active staff user with no workspace membership returned zero rows for another workspace across `brands`, `catalog_products`, `catalog_orders`, `qr_standees`, and `social_posts`. A `catalog_products` insert was rejected by RLS and no row persisted. Full two-browser-session PostgREST/API tests against Workspace A/B IDs remain pending.
- [ ] Verify staff cannot reach owner/admin-only Settings or management endpoints.
- [~] Migration reconciliation report updated: production history has 68 applied records vs 23 tracked SQL files; 17 exact-name matches (10 with exact versions), 7 name matches with timestamp mismatch, 5 tracked files without exact remote names, and 50 remote records without exact filename-stem matches. Restored the applied QR standee source and tracked applied checkout-transaction, atomic cart-increment, draft-state, and publish-retry claim migrations. This remains a source/history mismatch, not proof of missing schema. Follow [the reconciliation report](SUPABASE_MIGRATION_RECONCILIATION.md); preserve production history and do not replay or repair migrations blindly.

### B2. Social content flow
- [~] Fixed schema mismatch preventing `scheduled_posts.approval_status='draft'`: database CHECK now accepts `draft`, and Creative Studio's save-draft route sets it explicitly. Rollback-only DB insert passed and cron eligibility probe confirmed drafts are not publishable. Full browser create/edit/submit and approval cycle still pending.
- [~] Immediate publishing now checks workspace-scoped authorization: active global admin/owner or workspace owner/admin; a manager additionally needs both `approval.can_approve` and `publishing.can_publish`. The publish API binds the approved record to the draft's workspace and submitter. Browser-level owner/admin, manager, and denied-member tests plus real-provider publish remain pending.
- [~] Hardened alternate `POST /api/scheduled-posts`: requires active workspace membership and Content create/submit permission; draft state is explicit, and non-owner/admin scheduled posts are `pending` instead of defaulting to `approved`.
- [~] `/api/approvals/submit` uses shared workspace authorization for active global admins/owners, actual workspace owners and active members; staff still need `content.can_submit`. It validates shared workspace-owned social accounts independently from author ownership, rejects inactive profiles, and rejects malformed/past `scheduledFor` values rather than falling through to immediate submission. Composer's optional Schedule Date starts blank except when prefilled from Calendar. Review endpoints block inactive profiles and surface permission-query errors. Live authenticated HTTP tests remain pending.
- [~] All approval publish endpoints now enforce workspace role/permission checks and bind connected accounts to the approved workspace. Full live HTTP/browser tests remain pending; see [Approval & Publishing Authorization Audit](APPROVAL_PUBLISHING_AUDIT.md) for route-by-route findings and acceptance tests.
- [~] Approval Center now loads both the legacy `scheduled_posts` review queue and the current composer `post_approvals` queue. Approved-but-unpublished posts remain visible for publish retry, and reviewer decisions use conditional state transitions. Verify in browser with real workspace identities.
- [~] Legacy Drafts approval API now explicitly allows active global `admin`/`owner` profiles to review any workspace, even when they do not have a `workplace_members` row; workspace managers still require active membership plus `approval.can_approve`.
- [~] Legacy scheduled posts awaiting approval now appear beside ordinary drafts in Approval Center. Approving retains the schedule; rejecting cancels it; requesting changes returns the item to Drafts. Production migration adds publish claim/attempt/error fields; both legacy publishers and the composer publisher now atomically claim attempts and skip already-recorded successful accounts. Browser tests and connected-provider failure/retry tests remain pending.
- [ ] Submit draft for approval as a permitted staff member, then test approve/reject/request changes as a permitted reviewer.
- [ ] Confirm the negative/positive HTTP cases in `APPROVAL_PUBLISHING_AUDIT.md`, including no unapproved scheduled post is cron-eligible.
- [ ] Verify calendar timezone and schedule display.
- [~] Code audit confirms cron uses a conditional job claim (`status IN scheduled/failed`, `approval_status=approved`, attempts under limit) and skips when no row is returned; it also checks `social_posts` by scheduled post + account before publish. Manual approved-draft endpoints now have a separate conditional publish claim and skip already-recorded successful accounts on retry. Remaining risk/test: a provider may accept a post before the following history insert fails, so real provider-level retry/idempotency tests remain pending.
- [ ] Confirm publishing history/analytics match the recorded provider result after connected accounts are available.

### B3. Product Catalogue
- [ ] Create category/product in Workspace A and verify it is absent in Workspace B.
- [ ] Test featured product, compare-at price, coupon percentage/fixed discount, min order and max use limit.
- [ ] Run a public storefront add-to-cart/wishlist/checkout flow.
- [ ] Verify server-side order total and discount; never trust a total supplied only by the browser.
- [~] Public checkout uses the service-role-only atomic database transaction. Rollback-only DB probe passed: subtotal 200, 25% discount 50, total 150; stock 10→8; coupon usage 0→1; order item recorded; cart cleared. Insufficient-stock checkout rejected and rolled back; no test data remained. `Add to cart` now increments quantity atomically: successive adds returned 1 then 2; above-stock increment rejected and left quantity unchanged; probe data was rolled back. A combined rollback-only add-twice→checkout probe also passed: quantity 2, total 80, stock 5→3, order item quantity 2, cart cleared; zero test rows remained after rollback. Full browser UI, customer checkout and independent-connection concurrency/max-coupon tests remain pending.
- [ ] Confirm order appears under the correct workspace.

### B4. Digital Card and leads
- [ ] Create/edit a digital card and visit the public slug while signed out.
- [ ] Test profile/cover/logo/contact/services/social links on desktop and mobile.
- [ ] Submit the public lead/contact form and verify exactly one lead is recorded.
- [ ] Confirm lead access is limited to authorized members of its workspace.

### B5. CRM
- [ ] Create a contact, lead and task; verify stage/score changes persist.
- [ ] Trigger rule-based qualification and check score clamping/target-stage behavior.
- [ ] Create, edit, pause and activate each workflow type.
- [ ] Run manual workflow; confirm action result and execution-history record.
- [ ] Test each action: create task, set stage, approved WhatsApp template, product suggestions.
- [~] Added a database-enforced atomic reservation for `task_due` CRM workflows: the cron inserts the `queued` execution row before running actions, and a unique partial index prevents a second claim for the same workflow/task pair. The index exists in production and no pre-existing duplicate task-run groups were found. Positive execution/concurrency tests remain pending because production currently has zero CRM workflow definitions; Vercel deployment protection also blocked direct route smoke tests.
- [ ] Seed a controlled test workflow/task in a non-production workspace or test environment, call the task-due endpoint concurrently, and verify only one action runs; remove all probe data afterward.
- [ ] Decide whether tasks without `lead_id` should be ignored or supported; current cron skips them.
- [ ] Confirm recent workflow history shows failures and result details accurately.

### B6. Review requests and GMB suite
- [ ] Create a review request and open its public token page without a signed-in session.
- [ ] Test rating thresholds and private-feedback guidance.
- [ ] Confirm the Google public-review option remains available; no review gating/deletion/fabrication.
- [ ] When Google credentials are ready, verify live location and review import, reply create/update/delete, and sync error behavior.
- [ ] Confirm no sample/demo reviews are represented as provider-live data.

## C. Priority 1 — WhatsApp real-world verification

- [ ] Complete Meta Embedded Signup for the intended workspace and real business number.
- [ ] Verify signed webhook requests and reject invalid signatures.
- [ ] Test inbound text/button/media events, contact upsert and conversation unread state.
- [ ] Test outbound text/template/interactive sends and provider status updates.
- [ ] Verify WhatsApp opt-in remains false unless the contact explicitly opted in.
- [ ] Test an active 24-hour window normal bot reply.
- [ ] Test a closed 24-hour window with an APPROVED after-hours template; inspect bot event logs and provider delivery.
- [ ] Test missing/rejected template behavior and confirm a useful error is logged.
- [ ] Test campaign audience filters, launch, provider statuses, retry and duplicate protection.
- [ ] Confirm WhatsApp→CRM contact/lead sync and workflow trigger behavior.
- [ ] Verify campaign cron configuration and inspect real execution logs.

## D. Priority 1 — External social connections (intentionally last)

Do not begin these connections until the rest of the core product audit is complete, as requested.

### Facebook
- [ ] Verify Meta app mode, app ID/secret, allowed domains and callback URL.
- [ ] Review required permissions/scopes for the intended publishing use case and complete Meta review where required.
- [ ] OAuth connect/reconnect/disconnect test with a real Page.
- [ ] Publish a permitted test post and verify provider result/history.

### Instagram
- [ ] Fix/verify the earlier `instagram_basic` invalid-scope issue against current Meta OAuth permissions before testing.
- [ ] Confirm account type/linkage requirements for the intended publishing API.
- [ ] OAuth connect/sync/reconnect test, followed by permitted media publish and error cases.

### Google Business Profile
- [ ] Confirm approved Google Cloud project and enabled Business Profile APIs.
- [ ] Confirm OAuth web client, redirect URL and server-only client secret.
- [ ] Connect a real Google account; import locations and reviews.
- [ ] Test reply and sync with a real profile and verify errors for accounts without access.

## E. Priority 1 — Production configuration and operations
- [ ] Verify required Vercel environment variable names are present and non-empty without exposing values.
- [ ] Confirm `CRON_SECRET` is configured for production only and that unauthenticated requests to cron endpoints are rejected.
- [~] GitHub Actions scheduler `.github/workflows/production-scheduler.yml` is configured for every 5 minutes and calls the secured publishing/WhatsApp + CRM task-due workers. Activation remains pending two GitHub Action secrets and one repository variable; the scheduled job is gated off until setup is completed.
- [ ] In Vercel Settings → Deployment Protection, create a dedicated Protection Bypass for Automation secret while keeping SSO enabled; add it to GitHub Actions as `VERCEL_AUTOMATION_BYPASS_SECRET`. Also add `CRON_SECRET` matching the production Vercel value. Set Actions repository variable `ENABLE_PRODUCTION_SCHEDULER=true`, run `Production Scheduler` manually, verify both endpoints return successful HTTP statuses, and confirm runtime logs/results.
- [ ] Confirm public environment variables contain no service-role keys, app secrets, OAuth secrets or provider access tokens.
- [ ] Enable Supabase Auth leaked-password protection in the dashboard.
- [x] Restrict `admin_delete_workspace(uuid)` to `service_role` only; verified `anon=false`, `authenticated=false`, `service_role=true`. Current workspace deletion uses the secured `/api/brands/[id]` route, which checks owner/admin membership. Test that UI path during acceptance testing.
- [x] Revoke `PUBLIC`, `anon`, and `authenticated` execution of the legacy `create_order_with_csr(jsonb,jsonb,text)` RPC; verified only `service_role` retains execute. Its referenced legacy `orders/products/coupons` tables are absent; current catalogue checkout uses the separate `catalog_*` flow. Confirm no external/legacy client depends on this RPC before final sign-off.
- [~] Reviewed `can_access_workplace`, `has_workplace_permission`, and `is_admin` definitions and their use in RLS policies. A read-only guard probe under a distinct simulated `auth.uid()` passed: supplying another member's ID returned `false` for all three functions. Many workspace/catalogue/digital-card/approval RLS policies call these helpers, so authenticated EXECUTE must remain unless policies are redesigned together. Two real-user PostgREST cross-workspace read/write tests remain pending.
- [ ] Review Supabase performance advisories observed at audit time: 30 unindexed foreign keys, 38 auth/RLS initialization-plan warnings, 17 multiple-permissive-policy warnings, and 76 unused-index notices. Prioritize actual query patterns and validate before making index/policy changes.
- [ ] Verify backup/recovery expectations for production data and uploaded media.

## F. Priority 2 — UI and repository cleanup
- [x] Make the sidebar more compact and add a dedicated scrollable navigation area; production deployment is READY.
- [ ] Use grouped/collapsible navigation sections while preserving permission-based visibility.
- [ ] Test sidebar at short desktop heights, standard desktop, tablet and mobile; current CSS has an independently scrollable navigation area, but manual browser verification is still pending.
- [ ] Test sidebar scrolling at short desktop heights, normal desktop, tablet and mobile.
- [ ] Identify duplicate/empty/obsolete source files before removing any. Current review candidates include `app/api/meta/facebook/callback/route2.ts` and `app/api/meta/facebook/placeholder.txt`; verify references/history before deletion.
- [ ] Align forms, table spacing, status badges, loading/empty/error states and mobile overflow.
- [ ] Make sure errors are actionable and success messages appear only after the API confirms success.
- [ ] Run project quality/build workflows after each refactor.

## G. Documentation and final release
- [x] Create the master product/architecture guide in `docs/PROJECT_MASTER_GUIDE.md`.
- [x] Add this checklist so unfinished work is visible and prioritized.
- [x] Add a compact root README linking to the master guide, setup guides, and local run/build information.
- [ ] Reconcile older guides that may describe GMB replies as future work even though reply APIs now exist.
- [ ] Complete the core acceptance tests and then the external connection tests.
- [ ] Run a clean production build and review its logs.
- [ ] Run the final runtime-error scan after testing.
- [ ] Record final deployment ID/commit, exact tests passed, known limitations and only then mark project "FINAL".

## Completion definition

The project is final only when all P0 tests pass, P1 provider integrations have either passed real-account E2E or are clearly disclosed as intentionally unconnected, required migrations/settings are verified, the production build is READY, and no new runtime errors are present after the test window.
