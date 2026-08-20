create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null,
  account_ids uuid[] not null default '{}',
  caption text not null default '',
  link text,
  media_url text,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('draft','scheduled','processing','published','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduled_posts_user_brand_idx on public.scheduled_posts(user_id, brand_id);
create index if not exists scheduled_posts_due_idx on public.scheduled_posts(status, scheduled_for);

alter table public.scheduled_posts enable row level security;

drop policy if exists "scheduled_posts_select_own" on public.scheduled_posts;
create policy "scheduled_posts_select_own" on public.scheduled_posts for select using (auth.uid() = user_id);

drop policy if exists "scheduled_posts_insert_own" on public.scheduled_posts;
create policy "scheduled_posts_insert_own" on public.scheduled_posts for insert with check (auth.uid() = user_id);

drop policy if exists "scheduled_posts_update_own" on public.scheduled_posts;
create policy "scheduled_posts_update_own" on public.scheduled_posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "scheduled_posts_delete_own" on public.scheduled_posts;
create policy "scheduled_posts_delete_own" on public.scheduled_posts for delete using (auth.uid() = user_id);

create or replace function public.set_scheduled_posts_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists scheduled_posts_updated_at on public.scheduled_posts;
create trigger scheduled_posts_updated_at before update on public.scheduled_posts
for each row execute function public.set_scheduled_posts_updated_at();
