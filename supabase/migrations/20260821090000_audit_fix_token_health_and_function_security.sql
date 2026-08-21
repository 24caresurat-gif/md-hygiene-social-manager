alter table public.social_accounts
  add column if not exists token_status text not null default 'unknown';

create index if not exists social_accounts_token_status_idx
  on public.social_accounts (token_status, token_expires_at);

create index if not exists social_accounts_reconnect_idx
  on public.social_accounts (user_id, brand_id, platform, token_status);

create or replace function public.set_scheduled_posts_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.record_publishing_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.publishing_history(
    user_id, brand_id, social_account_id, platform, platform_post_id,
    message, status, error_message, published_at
  )
  values (
    new.user_id, new.brand_id, new.social_account_id, new.platform,
    new.platform_post_id, new.message, new.status, new.error_message,
    new.published_at
  );
  return new;
end;
$$;

revoke execute on function public.record_publishing_history() from anon, authenticated;
revoke execute on function public.set_scheduled_posts_updated_at() from anon, authenticated;
