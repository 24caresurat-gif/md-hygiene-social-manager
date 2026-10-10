# Supabase Migration Reconciliation

**Audit date:** 2026-10-10  
**Repository:** [24caresurat-gif/md-hygiene-social-manager](https://github.com/24caresurat-gif/md-hygiene-social-manager)  
**Production Supabase project:** `uuofdbsnkazmfdqfflnq`

## Executive result

| Measure | Count |
|---|---:|
| SQL files currently tracked in `supabase/migrations/` on `main` | 22 |
| Applied migration records reported by Supabase | 67 |
| Same migration name in both lists | 16 |
| Same name **and** exact version/timestamp | 9 |
| Same name but filename timestamp differs | 7 |
| Tracked SQL files with no exact remote migration name | 6 |
| Remote records with no exact tracked filename stem | 51 |

**Interpretation:** this is a migration-source/history mismatch, not proof that the production schema is missing these changes. Some tracked SQL files overlap or consolidate work recorded under different remote migration names. Do not replay the tracked files on production, mass-mark migrations as applied, delete migration records, or run `supabase migration repair` without a reviewed mapping.

## Tracked files with a matching remote name

| Tracked SQL file | Remote recorded version | Result |
|---|---|---|
| `202608200001_scheduled_posts.sql` | `20260820183019` | Name matches; filename version is `202608200001` |
| `20260821090000_audit_fix_token_health_and_function_security.sql` | `20260821063330` | Name matches; filename version is `20260821090000` |
| `20260821090001_audit_fix_rls_and_fk_indexes.sql` | `20260821063335` | Name matches; filename version is `20260821090001` |
| `20260821090003_harden_social_posts_workspace_rls.sql` | `20260821064404` | Name matches; filename version is `20260821090003` |
| `20260929123606_whatsapp_messaging_module.sql` | `20260929123606` | Exact version + name |
| `20261008105155_add_qr_standees.sql` | `20261008105155` | Exact version + name; source restored from historical branch after checking live schema |
| `20261010090656_catalog_checkout_transaction_hardening.sql` | `20261010090656` | Exact version + name; source committed with the checkout API change |
| `20261010091336_catalog_cart_item_atomic_increment.sql` | `20261010091336` | Exact version + name; source committed with the atomic cart increment API change |
| `20261010092313_scheduled_posts_allow_draft_approval_state.sql` | `20261010092313` | Exact version + name; fixes the pre-submission draft approval-state constraint |
| `20261010095804_scheduled_post_publish_retry_claim_fields.sql` | `20261010095804` | Exact version + name; adds publish status/claim/attempt fields and links composer social-post history to the approval row |
| `20260930110000_phase1_workspace_auth_hardening.sql` | `20260929133513` | Name matches; filename version is `20260930110000` |
| `20260930111500_phase1_role_defaults_whatsapp.sql` | `20260930054748` | Name matches; filename version is `20260930111500` |
| `20260930113000_phase1_google_connection_deny_policy.sql` | `20260930054822` | Name matches; filename version is `20260930113000` |
| `20261010073105_revoke_anon_admin_delete_workspace.sql` | `20261010073105` | Exact version + name |
| `20261010073158_revoke_public_legacy_csr_order_rpc.sql` | `20261010073158` | Exact version + name |
| `20261010073358_restrict_admin_delete_workspace_rpc_to_server.sql` | `20261010073358` | Exact version + name |

## Tracked SQL files without an exact remote migration name

These files are in GitHub but their filename stem does not exactly equal any `schema_migrations.name`. The SQL may overlap with changes recorded under differently named migrations; semantic equivalence has not been fully established.

| Tracked SQL file | Observation |
|---|---|
| `202608200002_publishing_history.sql` | The database has publishing-history-related objects and differently named history migrations; do not infer this exact migration was applied. |
| `202608200003_token_health_and_security.sql` | Its SQL overlaps token-health/RLS changes recorded under other names. |
| `20260820_token_expiry_architecture.sql` | Its SQL alters social-account token expiry/status metadata and indexes; match against actual schema and remote SQL before mapping. |
| `20260821090002_audit_finish_rls_and_unique_constraint_cleanup.sql` | Likely related to the remote `audit_finish_rls_and_unique_constraint_cleanup_v3` record, but name/version and full content still need source mapping. |
| `20260930120000_workspace_review_settings.sql` | The `public.workspace_review_settings` table exists in the current database, but no exact-name remote migration record was found. |
| `20260930122500_phase2d_gmb_permissions.sql` | The file changes workspace permission/module definitions; compare the effective function and permission-table schema to the remote records before assigning provenance. |

## Remote migration records with no exact filename-stem match

The records below were returned by Supabase, but there is no file in the current tracked migration directory whose stem exactly matches that record name. This is a **name-based inventory**, not a claim that every operation is absent from the current database or from another consolidated SQL file.

```text
20260820083335_create_social_accounts
20260820143329_create_social_posts_for_real_dashboard_metrics
20260820145151_add_google_oauth_token_fields
20260820150211_add_brand_workspace_architecture
20260820165443_workspace_social_account_constraints
20260820170548_add_workspace_logo_storage
20260820182815_complete_pending_workflow_schema
20260820182914_publishing_tracking_columns
20260820183041_social_posts_history_trigger
20260820193004_harden_workspace_rls_for_history_and_posts
20260821050928_add_missing_token_health_columns
20260821054329_add_brand_id_to_social_posts
20260821063512_audit_fix_rls_and_fk_indexes_verify
20260821063539_audit_fix_history_function_execute_acl
20260821063613_audit_finish_rls_and_unique_constraint_cleanup_v3
20260821070105_add_scheduled_post_idempotency
20260821070120_refine_scheduled_post_idempotency_index
20260821071039_add_workplace_staff_permissions_approval_workflow
20260821071051_enforce_workplace_rls_and_approval_access
20260821072121_enforce_approval_security_v2
20260821073305_add_post_draft_target_accounts
20260821073643_add_approval_publish_tracking
20260821084959_harden_security_definer_rpc_permissions
20260821091254_revoke_public_execute_security_definer_rpcs
20260821131931_final_rls_and_fk_performance_hardening
20260821132516_restore_authenticated_rls_helper_execute
20260821132557_lock_rls_helper_rpc_to_current_user
20260821185435_add_admin_delete_workspace_rpc
20260822062259_add_media_url_to_social_posts
20260822080549_allow_workspace_members_manage_social_accounts
20260822091136_allow_social_media_uploads_for_authenticated_users
20260822091140_add_creative_studio_metadata_to_post_drafts
20260822115553_add_draft_approval_fields_to_scheduled_posts
20260822122211_create_scheduled_post_activity_log
20260824081024_add_workspace_employee_login_fields
20260824081127_enforce_global_employee_id_uniqueness
20260824090009_phase1_core_workspace_architecture
20260824090144_phase2_role_permission_model
20260824090944_refine_role_ui_defaults
20260824092003_phase_8_harden_workspace_rls
20260824092114_phase_8_social_account_legacy_workspace_bridge
20260831153504_ensure_secure_order_transaction_entrypoint
20260919115139_add_workspace_gmb_review_system
20261008103502_add_catalog_and_digital_card
20261008103715_add_public_catalog_and_card_forms
20261008104406_crm_core_phase1
20261008104527_crm_core_phase1_hardening
20261008104717_catalog_orders_phase2
20261008104948_catalog_orders_indexes
20261008105240_crm_automation_phase2
20261008105257_crm_whatsapp_contact_unique
```

## RLS helper caller-identity guard probe

A read-only database probe selected an active workspace member and a different existing Auth user, then set the simulated `request.jwt.claim.sub` to the other user's ID. The three helper functions were called with the member's different ID:
- `can_access_workplace(workspace_id, different_user_id)` returned `false`.
- `is_admin(different_user_id)` returned `false`.
- `has_workplace_permission(workspace_id, platform, permission, different_user_id)` returned `false`.

The assertions completed without an error. This confirms the explicit `auth.uid()` mismatch guard in the SQL function definitions.

A second read-only test used `SET LOCAL ROLE authenticated` with a real active staff user's Auth subject that has no workspace memberships. RLS showed zero rows for the target workspace across `brands`, `catalog_products`, `catalog_orders`, `qr_standees`, and `social_posts`. An attempted insert into `catalog_products` was rejected by RLS; a follow-up query confirmed no probe row persisted. `workspace_review_settings` is separately and intentionally denied to browser roles at the SQL privilege level; its server-side API checks the workspace owner/admin before using service-role access.

These SQL-session tests do **not** replace full authenticated PostgREST tests under two browser sessions, nor do they verify owner/admin positive access through the real UI. Those API-level cross-workspace read/write tests remain required before sign-off.

## Read-only schema spot checks

The following expected relations exist in the production schema at audit time:

- `public.scheduled_posts`
- `public.publishing_history`
- `public.social_accounts`
- `public.workspace_review_settings`
- `public.workspace_member_permissions`
- `public.google_business_connections`
- `public.google_business_reviews`
- `public.catalog_orders`
- `public.crm_workflows`
- `public.qr_standees`
- `public.review_requests`

A probe for the candidate name `public.workspace_review_requests` returned no relation; the actual `public.review_requests` table exists.

## Historical source recovered and verified

The GitHub branch `feat/qr-standee` contained `20261009103000_add_qr_standees.sql` (source blob `fdd5a50d323c9a3d935030d528c12cff532b1f4f`). It has been restored to `main` as `supabase/migrations/20261008105155_add_qr_standees.sql`, matching the already-applied Supabase history version `20261008105155_add_qr_standees`. **This was a source-file restoration only; no migration was applied to production.**

The live database was checked against the recovered source:
- `public.qr_standees` exists with the seven expected columns.
- Its primary key, three foreign keys, and `qr_standees_workspace_id_idx` match the source.
- Both expected RLS policies exist.
- `private.is_workspace_manager(uuid)` and `private.is_workspace_member(uuid)` exist, and their definitions bind access checks to `auth.uid()`.

This recovers one migration source from a historical feature branch. Inspection of relevant audit/publishing and feature branches did not reveal a complete archive for the remaining remote history.

## Checkout transaction migration

The `catalog_checkout_transaction_hardening` migration was applied once to production under version `20261010090656` and its corresponding SQL is tracked as `supabase/migrations/20261010090656_catalog_checkout_transaction_hardening.sql`. The function performs cart/order/item/stock/coupon operations in a single database transaction and its EXECUTE grant is restricted to `service_role`. A rollback-only database probe passed the successful-checkout assertions (subtotal ₹200, 25% coupon discount ₹50, total ₹150, stock 10→8, coupon usage 0→1, one order item and cleared cart) and the insufficient-stock rejection/rollback assertion. The probe was wrapped in a nested transaction and deliberately rolled back; a follow-up query confirmed zero probe products, coupons, carts and orders remained. A separate no-cart probe returned the expected `Your cart is empty.` exception. This does not replace a real browser checkout, coupon maximum-use race test with independent connections, or post-deploy customer journey test.

## Atomic add-to-cart increment migration

The production database now has `20261010091336_catalog_cart_item_atomic_increment`, tracked in Git as `supabase/migrations/20261010091336_catalog_cart_item_atomic_increment.sql`. It adds a partial unique index on `(workspace_id, session_key)` for non-null session keys and a server-only `add_catalog_cart_item` RPC. The route now requests an atomic increment instead of upserting quantity `1` over the existing value.

A rollback-only database probe passed:
- First add returned quantity `1`; second add returned `2`.
- An attempted increment that would exceed stock was rejected.
- The cart retained quantity `2` after that rejection.
- The entire probe rolled back; follow-up checks found zero probe products, carts or cart items.
- RPC execute rights were verified as `anon=false`, `authenticated=false`, `service_role=true`.

A combined rollback-only add-to-cart→checkout probe also passed: two adds produced quantity 2, checkout totaled 80 for two items at 40 each, stock fell from 5 to 3, the order item quantity was 2 and the cart cleared. The full probe rolled back; follow-up checks confirmed zero probe products, carts or orders remained. Full browser UI verification and independent-connection concurrency testing still remain pending.

## Draft approval-state constraint fix

The `scheduled_posts_approval_status_check` constraint originally allowed only `pending`, `approved`, `rejected`, and `changes_requested`, while the draft API explicitly wrote `approval_status='draft'`. This mismatch caused draft insertion/editing to fail at the database constraint.

Production migration `20261010092313_scheduled_posts_allow_draft_approval_state` now permits `draft` as a valid pre-submission state. The Creative Studio save-draft route explicitly writes this state. A rollback-only insert probe confirmed a `status='draft', approval_status='draft'` row is accepted, while the cron's eligible set (status scheduled/failed + approval approved + scheduled time due) excludes the draft. The probe was rolled back and confirmed no row remained.

This is a schema/API compatibility fix; full browser create/edit/submit and approval workflow testing is still required.

## Publish retry claim schema

The production database now tracks manual publish state explicitly:
- `scheduled_posts`: `publish_status`, `publish_error`, `publish_claimed_at`, `publish_attempts`.
- `post_approvals`: `publish_claimed_at`, `publish_attempts` (the table already held `publish_status` and `publish_error`).
- `social_posts`: nullable `post_approval_id`, a foreign key to `post_approvals`, plus a partial unique index on `(post_approval_id, social_account_id)` for published records.

Migration `20261010095804_scheduled_post_publish_retry_claim_fields` is applied in production and source-tracked in GitHub. It supports conditional `publishing` claims, retry/error tracking, stale-claim recovery after ten minutes, and skipping account posts already recorded as published. It prevents concurrent publish requests from both owning the same claim. An external provider can still accept a post before the following database history insert fails; that provider/DB failure window requires real-provider testing and cannot be proven exactly-once using a database claim alone.

## Safe reconciliation plan

1. Preserve the production database and all 63 existing migration history records.
2. Recover migration SQL sources from original repository commits, working copies, release artefacts or the operator who first applied them. Record source SHA and remote version for each recovered file.
3. For each remote-only name, inspect the actual migration content if recoverable and compare its DDL/RLS/function changes with tracked files and live schema. A table existing today does not prove which migration created it.
4. Where an old SQL source cannot be recovered, take a reviewed schema snapshot from the production schema (for example, a controlled `supabase db pull` from an authorized workstation/branch) and keep it explicitly labelled as a baseline snapshot—not as a historical migration to replay.
5. Establish a clean canonical local migration history on a separate branch/environment; validate with Supabase CLI migration-list/diff checks before proposing any production migration action.
6. Keep future migrations versioned consistently and commit their SQL in the same change as the schema update. Do not use a repair operation merely to make counts match.

## Completion gate

Migration reconciliation is **not complete** until the team has a reviewed mapping for each remote history row, a reproducible local schema baseline, and a non-production validation showing that onboarding a fresh database produces the intended schema without replaying migrations into this existing production database.
