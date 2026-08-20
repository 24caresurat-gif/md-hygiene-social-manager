alter table if exists public.social_accounts add column if not exists token_expires_at timestamptz;
alter table if exists public.social_accounts add column if not exists token_checked_at timestamptz;
alter table if exists public.social_accounts add column if not exists token_last_refreshed_at timestamptz;
alter table if exists public.social_accounts add column if not exists token_error text;

alter table if exists public.social_posts enable row level security;
drop policy if exists "social_posts_select_own" on public.social_posts;
create policy "social_posts_select_own" on public.social_posts for select using (auth.uid() = user_id);
drop policy if exists "social_posts_insert_own" on public.social_posts;
create policy "social_posts_insert_own" on public.social_posts for insert with check (auth.uid() = user_id);
drop policy if exists "social_posts_update_own" on public.social_posts;
create policy "social_posts_update_own" on public.social_posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table if exists public.scheduled_posts enable row level security;
drop policy if exists "scheduled_posts_select_own" on public.scheduled_posts;
create policy "scheduled_posts_select_own" on public.scheduled_posts for select using (auth.uid() = user_id);
drop policy if exists "scheduled_posts_insert_own" on public.scheduled_posts;
create policy "scheduled_posts_insert_own" on public.scheduled_posts for insert with check (auth.uid() = user_id);
drop policy if exists "scheduled_posts_update_own" on public.scheduled_posts;
create policy "scheduled_posts_update_own" on public.scheduled_posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "scheduled_posts_delete_own" on public.scheduled_posts;
create policy "scheduled_posts_delete_own" on public.scheduled_posts for delete using (auth.uid() = user_id);
