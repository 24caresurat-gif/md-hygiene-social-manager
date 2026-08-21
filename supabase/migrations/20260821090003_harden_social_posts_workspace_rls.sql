drop policy if exists social_posts_insert_own on public.social_posts;
create policy social_posts_insert_workspace on public.social_posts
  for insert
  with check (
    (select auth.uid()) = user_id
    and (brand_id is null or exists (
      select 1 from public.brands b
      where b.id = social_posts.brand_id
        and b.user_id = (select auth.uid())
    ))
    and exists (
      select 1 from public.social_accounts a
      where a.id = social_posts.social_account_id
        and a.user_id = (select auth.uid())
        and (social_posts.brand_id is null or a.brand_id = social_posts.brand_id)
    )
  );

drop policy if exists social_posts_update_own on public.social_posts;
create policy social_posts_update_workspace on public.social_posts
  for update
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.social_accounts a
      where a.id = social_posts.social_account_id
        and a.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and (brand_id is null or exists (
      select 1 from public.brands b
      where b.id = social_posts.brand_id
        and b.user_id = (select auth.uid())
    ))
    and exists (
      select 1 from public.social_accounts a
      where a.id = social_posts.social_account_id
        and a.user_id = (select auth.uid())
        and (social_posts.brand_id is null or a.brand_id = social_posts.brand_id)
    )
  );
