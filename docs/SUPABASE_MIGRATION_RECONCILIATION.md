# Supabase Migration Reconciliation

**Audit date:** 2026-10-10  
**Repository:** [24caresurat-gif/md-hygiene-social-manager](https://github.com/24caresurat-gif/md-hygiene-social-manager)  
**Production Supabase project:** `uuofdbsnkazmfdqfflnq`

## Executive result

| Measure | Count |
|---|---:|
| SQL files currently tracked in `supabase/migrations/` on `main` | 17 |
| Applied migration records reported by Supabase | 63 |
| Same migration name in both lists | 11 |
| Same name **and** exact version/timestamp | 4 |
| Same name but filename timestamp differs | 7 |
| Tracked SQL files with no exact remote migration name | 6 |
| Remote records with no exact tracked filename stem | 52 |

**Interpretation:** this is a migration-source/history mismatch, not proof that the production schema is missing these changes. Some tracked SQL files overlap or consolidate work recorded under different remote migration names. Do not replay the tracked files on production, mass-mark migrations as applied, delete migration records, or run `supabase migration repair` without a reviewed mapping.

## Tracked files with a matching remote name

| Tracked SQL file | Remote recorded version | Result |
|---|---|---|
| `202608200001_scheduled_posts.sql` | `20260820183019` | Name matches; filename version is `202608200001` |
| `20260821090000_audit_fix_token_health_and_function_security.sql` | `20260821063330` | Name matches; filename version is `20260821090000` |
| `20260821090001_audit_fix_rls_and_fk_indexes.sql` | `20260821063335` | Name matches; filename version is `20260821090001` |
| `20260821090003_harden_social_posts_workspace_rls.sql` | `20260821064404` | Name matches; filename version is `20260821090003` |
| `20260929123606_whatsapp_messaging_module.sql` | `20260929123606` | Exact version + name |
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
20261008105155_add_qr_standees
20261008105240_crm_automation_phase2
20261008105257_crm_whatsapp_contact_unique
```

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

The probe for `public.workspace_review_requests` returned no relation. That name was only a probe candidate, not an asserted required table; review the current public review-request implementation before treating it as a defect.

## Safe reconciliation plan

1. Preserve the production database and all 63 existing migration history records.
2. Recover migration SQL sources from original repository commits, working copies, release artefacts or the operator who first applied them. Record source SHA and remote version for each recovered file.
3. For each remote-only name, inspect the actual migration content if recoverable and compare its DDL/RLS/function changes with tracked files and live schema. A table existing today does not prove which migration created it.
4. Where an old SQL source cannot be recovered, take a reviewed schema snapshot from the production schema (for example, a controlled `supabase db pull` from an authorized workstation/branch) and keep it explicitly labelled as a baseline snapshot—not as a historical migration to replay.
5. Establish a clean canonical local migration history on a separate branch/environment; validate with Supabase CLI migration-list/diff checks before proposing any production migration action.
6. Keep future migrations versioned consistently and commit their SQL in the same change as the schema update. Do not use a repair operation merely to make counts match.

## Completion gate

Migration reconciliation is **not complete** until the team has a reviewed mapping for each remote history row, a reproducible local schema baseline, and a non-production validation showing that onboarding a fresh database produces the intended schema without replaying migrations into this existing production database.
