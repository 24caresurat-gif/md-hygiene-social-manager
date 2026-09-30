create table if not exists public.workspace_review_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  negative_protection_enabled boolean not null default true,
  negative_protection_threshold smallint not null default 2 check (negative_protection_threshold between 1 and 4),
  negative_protection_message text not null default 'Your feedback will be reviewed privately by our team. You can still choose to share your experience publicly on Google after submitting.',
  ai_enabled boolean not null default true,
  ai_business_name text,
  ai_business_context text,
  ai_services text,
  ai_tone text not null default 'Warm, professional, concise',
  ai_signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_review_settings enable row level security;

revoke all on public.workspace_review_settings from anon, authenticated;
grant all on public.workspace_review_settings to service_role;

drop policy if exists "workspace_review_settings_no_client_access" on public.workspace_review_settings;
create policy "workspace_review_settings_no_client_access"
on public.workspace_review_settings
for all
to anon, authenticated
using (false)
with check (false);

create index if not exists workspace_review_settings_updated_at_idx
on public.workspace_review_settings(updated_at);

insert into public.workspace_review_settings (
  workspace_id,
  negative_protection_enabled,
  negative_protection_threshold,
  negative_protection_message,
  ai_enabled,
  ai_tone
)
select
  id,
  true,
  2,
  'Your feedback will be reviewed privately by our team. You can still choose to share your experience publicly on Google after submitting.',
  true,
  'Warm, professional, concise'
from public.workspaces
on conflict (workspace_id) do nothing;
