create table if not exists public.creative_image_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.brands(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null,
  prompt text not null default '',
  format text not null default '1:1' check (format in ('9:16','4:5','1:1','16:9')),
  source_type text not null default 'generated' check (source_type in ('generated','edited')),
  created_at timestamptz not null default now()
);

create index if not exists creative_image_history_workspace_created_idx
  on public.creative_image_history (workspace_id, created_at desc);
create index if not exists creative_image_history_user_idx
  on public.creative_image_history (user_id);

alter table public.creative_image_history enable row level security;

-- This table is accessed only by the server API using the Supabase service role.
-- The API verifies the caller's session, workspace membership and Content permission.
revoke all on table public.creative_image_history from anon, authenticated;
grant select, insert, delete on table public.creative_image_history to service_role;
