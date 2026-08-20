alter table if exists public.social_posts
  add column if not exists brand_id uuid,
  add column if not exists link text,
  add column if not exists media_url text,
  add column if not exists error_message text,
  add column if not exists platform_response jsonb,
  add column if not exists attempted_at timestamptz;

create index if not exists social_posts_user_brand_created_idx
  on public.social_posts(user_id, brand_id, created_at desc);
create index if not exists social_posts_user_status_created_idx
  on public.social_posts(user_id, status, created_at desc);

alter table if exists public.social_posts enable row level security;
drop policy if exists "social_posts_select_own" on public.social_posts;
create policy "social_posts_select_own" on public.social_posts
  for select using (auth.uid() = user_id);
drop policy if exists "social_posts_insert_own" on public.social_posts;
create policy "social_posts_insert_own" on public.social_posts
  for insert with check (auth.uid() = user_id);
drop policy if exists "social_posts_update_own" on public.social_posts;
create policy "social_posts_update_own" on public.social_posts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
