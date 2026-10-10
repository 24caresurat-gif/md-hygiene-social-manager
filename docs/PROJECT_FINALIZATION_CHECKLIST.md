# Project Finalization Checklist

This checklist is the operational source of truth for making the application tidy, documented and ready for a controlled final release.

**Rule:** do not mark something complete solely because a route exists or the deployment compiled. Mark it verified only after the acceptance test is recorded.

## Status key
- [x] Done / confirmed from current repository or deployment metadata
- [ ] Pending verification or implementation
- [~] Partly in place; final test/refinement remains

## A. Current baseline

- [x] Production deployment is READY at https://md-hygiene-social-manager.vercel.app
- [x] Compact, independently scrollable sidebar is deployed and the latest production build is READY.
- [x] CRM execution history UI is present in main
- [x] WhatsApp bot logs page and navigation are present in main
- [x] CRM task-due API route exists and is authenticated with `CRON_SECRET`
- [x] Vercel project runtime-error scan returned no runtime errors in the last 24 hours at audit time
- [ ] Run a real browser pass through key pages on desktop and mobile
- [ ] Capture final test date, tester, workspace used and observed result

## B. Priority 0 — Finalize core product safely

### B1. User, workspace and permissions
- [ ] Test owner/admin/staff access using separate test accounts.
- [ ] Verify changing the selected workspace reloads all workspace-owned lists and forms.
- [ ] Attempt direct API reads/writes using Workspace A token against Workspace B IDs; requests must be denied or return no rows.
- [ ] Verify staff cannot reach owner/admin-only Settings or management endpoints.
- [~] Migration reconciliation report added: production history has 63 applied records vs 18 tracked SQL files; 12 exact-name matches (5 with exact versions), 7 name matches with timestamp mismatch, 6 tracked files without exact remote names, and 51 remote records without exact filename-stem matches. Restored the already-applied QR standee migration source from the `feat/qr-standee` branch after checking live columns, constraints, index, and RLS policies. This remains a source/history mismatch, not proof of missing schema. Follow [the reconciliation report](SUPABASE_MIGRATION_RECONCILIATION.md); preserve production history and do not replay or repair migrations blindly.

### B2. Social content flow
- [ ] Create draft, edit draft, upload media, and confirm persistence.
- [ ] Submit draft for approval as a permitted staff member.
- [ ] Approve, reject and request changes as a permitted reviewer.
- [ ] Confirm an unapproved post cannot publish or enter scheduled publishing through an alternate API path.
- [ ] Verify calendar timezone and schedule display.
- [ ] Verify one scheduled post is claimed/published once and failures are retriable without duplicate public posts.
- [ ] Confirm publishing history/analytics match the recorded provider result after connected accounts are available.

### B3. Product Catalogue
- [ ] Create category/product in Workspace A and verify it is absent in Workspace B.
- [ ] Test featured product, compare-at price, coupon percentage/fixed discount, min order and max use limit.
- [ ] Run a public storefront add-to-cart/wishlist/checkout flow.
- [ ] Verify server-side order total and discount; never trust a total supplied only by the browser.
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
- [ ] Validate the daily task-due behavior with due open tasks and ensure the same workflow/task pair does not execute twice.
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
- [ ] Verify actual scheduled invocation for CRM task-due, publishing and WhatsApp campaigns; review runtime logs afterwards. The current 24-hour Vercel runtime-error scan reported no errors, but scheduled invocation itself is not yet proven.
- [ ] Confirm public environment variables contain no service-role keys, app secrets, OAuth secrets or provider access tokens.
- [ ] Enable Supabase Auth leaked-password protection in the dashboard.
- [x] Restrict `admin_delete_workspace(uuid)` to `service_role` only; verified `anon=false`, `authenticated=false`, `service_role=true`. Current workspace deletion uses the secured `/api/brands/[id]` route, which checks owner/admin membership. Test that UI path during acceptance testing.
- [x] Revoke `PUBLIC`, `anon`, and `authenticated` execution of the legacy `create_order_with_csr(jsonb,jsonb,text)` RPC; verified only `service_role` retains execute. Its referenced legacy `orders/products/coupons` tables are absent; current catalogue checkout uses the separate `catalog_*` flow. Confirm no external/legacy client depends on this RPC before final sign-off.
- [~] Reviewed `can_access_workplace`, `has_workplace_permission`, and `is_admin` definitions and their use in RLS policies. Supplied user IDs are constrained to `auth.uid()` and the functions return permission/role booleans; multiple current workspace/catalogue/digital-card/approval policies call these helpers, so authenticated EXECUTE must remain unless policies are redesigned together. Two-user cross-workspace tests and direct-RPC negative tests remain pending.
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
