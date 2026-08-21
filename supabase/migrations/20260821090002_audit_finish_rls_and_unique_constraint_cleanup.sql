alter table public.social_accounts drop constraint if exists social_accounts_user_platform_account_unique;

drop policy if exists "Users can view own social accounts" on public.social_accounts;
create policy "Users can view own social accounts" on public.social_accounts for select using ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own social accounts" on public.social_accounts;
create policy "Users can delete own social accounts" on public.social_accounts for delete using ((select auth.uid()) = user_id);
drop policy if exists social_accounts_insert_workspace on public.social_accounts;
create policy social_accounts_insert_workspace on public.social_accounts for insert with check ((select auth.uid()) = user_id and (brand_id is null or exists (select 1 from public.brands b where b.id = social_accounts.brand_id and b.user_id = (select auth.uid()))));
drop policy if exists social_accounts_update_workspace on public.social_accounts;
create policy social_accounts_update_workspace on public.social_accounts for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and (brand_id is null or exists (select 1 from public.brands b where b.id = social_accounts.brand_id and b.user_id = (select auth.uid()))));

drop policy if exists post_drafts_delete_own on public.post_drafts;
create policy post_drafts_delete_own on public.post_drafts for delete using ((select auth.uid()) = user_id);
drop policy if exists post_drafts_insert_own on public.post_drafts;
create policy post_drafts_insert_own on public.post_drafts for insert with check ((select auth.uid()) = user_id and exists (select 1 from public.brands b where b.id = post_drafts.brand_id and b.user_id = (select auth.uid())));
drop policy if exists post_drafts_select_own on public.post_drafts;
create policy post_drafts_select_own on public.post_drafts for select using ((select auth.uid()) = user_id and exists (select 1 from public.brands b where b.id = post_drafts.brand_id and b.user_id = (select auth.uid())));
drop policy if exists post_drafts_update_own on public.post_drafts;
create policy post_drafts_update_own on public.post_drafts for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.brands b where b.id = post_drafts.brand_id and b.user_id = (select auth.uid())));

drop policy if exists publishing_history_select_own on public.publishing_history;
create policy publishing_history_select_own on public.publishing_history for select using ((select auth.uid()) = user_id and exists (select 1 from public.brands b where b.id = publishing_history.brand_id and b.user_id = (select auth.uid())));

drop policy if exists scheduled_posts_delete_own on public.scheduled_posts;
create policy scheduled_posts_delete_own on public.scheduled_posts for delete using ((select auth.uid()) = user_id);
drop policy if exists scheduled_posts_insert_own on public.scheduled_posts;
create policy scheduled_posts_insert_own on public.scheduled_posts for insert with check ((select auth.uid()) = user_id and exists (select 1 from public.brands b where b.id = scheduled_posts.brand_id and b.user_id = (select auth.uid())));
drop policy if exists scheduled_posts_select_own on public.scheduled_posts;
create policy scheduled_posts_select_own on public.scheduled_posts for select using ((select auth.uid()) = user_id);
drop policy if exists scheduled_posts_update_own on public.scheduled_posts;
create policy scheduled_posts_update_own on public.scheduled_posts for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.brands b where b.id = scheduled_posts.brand_id and b.user_id = (select auth.uid())));

drop policy if exists social_posts_delete_own on public.social_posts;
create policy social_posts_delete_own on public.social_posts for delete using ((select auth.uid()) = user_id and exists (select 1 from public.social_accounts a where a.id = social_posts.social_account_id and a.user_id = (select auth.uid())));
