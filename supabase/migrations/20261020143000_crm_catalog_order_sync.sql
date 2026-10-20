-- Link each new public catalogue order to a workspace-scoped CRM contact and lead.
-- The BEFORE INSERT trigger runs inside the order transaction; if checkout fails,
-- the CRM contact/lead/activity are rolled back with the order as well.

alter table public.catalog_orders
  add column if not exists crm_contact_id uuid,
  add column if not exists crm_lead_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'catalog_orders_crm_contact_id_fkey'
      and conrelid = 'public.catalog_orders'::regclass
  ) then
    alter table public.catalog_orders
      add constraint catalog_orders_crm_contact_id_fkey
      foreign key (crm_contact_id) references public.crm_contacts(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'catalog_orders_crm_lead_id_fkey'
      and conrelid = 'public.catalog_orders'::regclass
  ) then
    alter table public.catalog_orders
      add constraint catalog_orders_crm_lead_id_fkey
      foreign key (crm_lead_id) references public.crm_leads(id) on delete set null;
  end if;
end;
$$;

create index if not exists catalog_orders_crm_contact_id_idx
  on public.catalog_orders (crm_contact_id);
create index if not exists catalog_orders_crm_lead_id_idx
  on public.catalog_orders (crm_lead_id);

create or replace function public.crm_sync_catalog_order_to_crm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_contact_id uuid;
  v_lead_id uuid;
  v_digits text;
  v_phone_match text;
  v_email text;
  v_phone_lock bigint;
  v_email_lock bigint;
  v_note text;
begin
  v_digits := pg_catalog.regexp_replace(coalesce(new.customer_phone, ''), '\D', '', 'g');
  v_phone_match := case
    when pg_catalog.length(v_digits) >= 10 then pg_catalog.right(v_digits, 10)
    else v_digits
  end;
  v_email := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(new.customer_email, ''))), '');

  -- Lock by normalized phone/email in deterministic order to reduce duplicate contacts
  -- when two checkout requests for the same customer arrive at the same time.
  if v_phone_match <> '' then
    v_phone_lock := pg_catalog.hashtextextended(new.workspace_id::text || ':phone:' || v_phone_match, 0);
  end if;
  if v_email is not null then
    v_email_lock := pg_catalog.hashtextextended(new.workspace_id::text || ':email:' || v_email, 0);
  end if;

  if v_phone_lock is not null and v_email_lock is not null then
    if v_phone_lock <= v_email_lock then
      perform pg_catalog.pg_advisory_xact_lock(v_phone_lock);
      perform pg_catalog.pg_advisory_xact_lock(v_email_lock);
    else
      perform pg_catalog.pg_advisory_xact_lock(v_email_lock);
      perform pg_catalog.pg_advisory_xact_lock(v_phone_lock);
    end if;
  elsif v_phone_lock is not null then
    perform pg_catalog.pg_advisory_xact_lock(v_phone_lock);
  elsif v_email_lock is not null then
    perform pg_catalog.pg_advisory_xact_lock(v_email_lock);
  end if;

  select c.id
    into v_contact_id
  from public.crm_contacts c
  where c.workspace_id = new.workspace_id
    and (
      (
        v_phone_match <> ''
        and pg_catalog.regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') <> ''
        and case
          when pg_catalog.length(v_digits) >= 10
            then pg_catalog.right(pg_catalog.regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = v_phone_match
          else pg_catalog.regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_phone_match
        end
      )
      or (v_email is not null and pg_catalog.lower(pg_catalog.btrim(coalesce(c.email, ''))) = v_email)
    )
  order by
    case
      when v_phone_match <> ''
        and pg_catalog.regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') <> ''
        and case
          when pg_catalog.length(v_digits) >= 10
            then pg_catalog.right(pg_catalog.regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = v_phone_match
          else pg_catalog.regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_phone_match
        end
      then 0 else 1
    end,
    c.created_at desc
  limit 1;

  if v_contact_id is null then
    insert into public.crm_contacts (
      workspace_id, name, phone, email, source,
      lifecycle_stage, status, whatsapp_opt_in, custom_fields
    )
    values (
      new.workspace_id,
      nullif(pg_catalog.btrim(coalesce(new.customer_name, '')), ''),
      nullif(pg_catalog.btrim(coalesce(new.customer_phone, '')), ''),
      v_email,
      'catalog_order',
      'customer',
      'active',
      false,
      pg_catalog.jsonb_build_object('intake_source', 'catalog_order')
    )
    returning id into v_contact_id;
  else
    update public.crm_contacts
    set
      name = coalesce(nullif(pg_catalog.btrim(coalesce(name, '')), ''), nullif(pg_catalog.btrim(coalesce(new.customer_name, '')), '')),
      phone = coalesce(nullif(pg_catalog.btrim(coalesce(phone, '')), ''), nullif(pg_catalog.btrim(coalesce(new.customer_phone, '')), '')),
      email = coalesce(nullif(pg_catalog.btrim(coalesce(email, '')), ''), v_email),
      lifecycle_stage = 'customer',
      last_contacted_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    where id = v_contact_id and workspace_id = new.workspace_id;
  end if;

  v_note := pg_catalog.left(
    'Catalogue order ' || coalesce(new.order_number, '(no order number)')
      || ' placed. Order status: ' || coalesce(new.status, 'pending')
      || '; payment status: ' || coalesce(new.payment_status, 'pending')
      || '; total: ' || coalesce(new.total, 0)::text,
    4000
  );

  insert into public.crm_leads (
    workspace_id, contact_id, title, source, stage, score, value, notes
  )
  values (
    new.workspace_id,
    v_contact_id,
    pg_catalog.left('Store order ' || coalesce(new.order_number, 'New order'), 200),
    'catalog_order',
    'new',
    75,
    coalesce(new.total, 0),
    v_note
  )
  returning id into v_lead_id;

  insert into public.crm_follow_up_history (
    workspace_id, lead_id, contact_id, activity_type, note, status
  )
  values (
    new.workspace_id,
    v_lead_id,
    v_contact_id,
    'note',
    v_note,
    'completed'
  );

  new.crm_contact_id := v_contact_id;
  new.crm_lead_id := v_lead_id;
  return new;
end;
$function$;

revoke all on function public.crm_sync_catalog_order_to_crm() from public, anon, authenticated;

drop trigger if exists catalog_orders_sync_crm_before_insert on public.catalog_orders;
create trigger catalog_orders_sync_crm_before_insert
before insert on public.catalog_orders
for each row execute function public.crm_sync_catalog_order_to_crm();
