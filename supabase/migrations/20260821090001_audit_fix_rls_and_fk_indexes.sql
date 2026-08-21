create index if not exists post_drafts_brand_id_idx on public.post_drafts(brand_id);
create index if not exists publishing_history_brand_id_idx on public.publishing_history(brand_id);
create index if not exists publishing_history_draft_id_idx on public.publishing_history(draft_id);
create index if not exists publishing_history_social_account_id_idx on public.publishing_history(social_account_id);
create index if not exists scheduled_posts_brand_id_idx on public.scheduled_posts(brand_id);

alter table public.social_posts enable row level security;
drop policy if exists "social_posts_select_own" on public.social_posts;
create policy "social_posts_select_own" on public.social_posts
  for select using ((select auth.uid()) = user_id);
drop policy if exists "social_posts_insert_own" on public.social_posts;
create policy "social_posts_insert_own" on public.social_posts
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "social_posts_update_own" on public.social_posts;
create policy "social_posts_update_own" on public.social_posts
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.brands enable row level security;
drop policy if exists "brands_select_own" on public.brands;
create policy "brands_select_own" on public.brands
  for select using ((select auth.uid()) = user_id);
drop policy if exists "brands_insert_own" on public.brands;
create policy "brands_insert_own" on public.brands
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "brands_update_own" on public.brands;
create policy "brands_update_own" on public.brands
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "brands_delete_own" on public.brands;
create policy "brands_delete_own" on public.brands
  for delete using ((select auth.uid()) = user_id);

-- Keep one copy of the duplicate uniqueness index.
drop index if exists public.social_accounts_user_platform_platform_account_unique;
