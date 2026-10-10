-- QR standees: one permanent QR code per business location.
-- Scans are handled by app/standee/[id]/route.ts, which creates a fresh
-- review_requests row (source = 'qr') per scan and redirects into the
-- existing /review-request/[token] rating-gate flow.
--
-- Recovered from feat/qr-standee (original source blob fdd5a50d323c9a3d935030d528c12cff532b1f4f).
-- This historical migration is already applied in production; do not replay it there.
-- The file version has been aligned to the version reported by Supabase migration history.

create table if not exists public.qr_standees (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid references public.google_business_profiles(id) on delete set null,
  form_id uuid references public.feedback_forms(id) on delete set null,
  label text,
  scan_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists qr_standees_workspace_id_idx on public.qr_standees(workspace_id);

alter table public.qr_standees enable row level security;

drop policy if exists "workspace managers can manage qr standees" on public.qr_standees;
create policy "workspace managers can manage qr standees"
  on public.qr_standees for all
  using (private.is_workspace_manager(workspace_id))
  with check (private.is_workspace_manager(workspace_id));

drop policy if exists "workspace members can view qr standees" on public.qr_standees;
create policy "workspace members can view qr standees"
  on public.qr_standees for select
  using (private.is_workspace_member(workspace_id));
