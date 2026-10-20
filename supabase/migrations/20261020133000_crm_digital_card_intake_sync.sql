-- Send Digital Card public form submissions into the existing workspace-scoped CRM.
-- All records are created in the same workspace as the originating Digital Card.
-- Contact form messages are logged as CRM activity; lead-capture submissions also
-- create (or reuse) an open CRM lead.

create or replace function public.crm_sync_digital_card_intake(
  p_digital_card_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_subject text,
  p_message text,
  p_activity_source text,
  p_create_lead boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_workspace_id uuid;
  v_business_name text;
  v_contact_id uuid;
  v_lead_id uuid;
  v_phone_digits text;
  v_email text;
  v_lock_phone bigint;
  v_lock_email bigint;
  v_note text;
begin
  select dc.workspace_id, nullif(pg_catalog.btrim(dc.business_name), '')
    into v_workspace_id, v_business_name
  from public.digital_cards dc
  where dc.id = p_digital_card_id;

  if v_workspace_id is null then
    return;
  end if;

  v_phone_digits := pg_catalog.regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_email := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))), '');

  -- Serialize submissions sharing a phone/email so parallel form submits are
  -- less likely to create duplicate CRM contacts or open leads.
  if v_phone_digits <> '' then
    v_lock_phone := pg_catalog.hashtextextended(v_workspace_id::text || ':phone:' || v_phone_digits, 0);
  end if;
  if v_email is not null then
    v_lock_email := pg_catalog.hashtextextended(v_workspace_id::text || ':email:' || v_email, 0);
  end if;

  if v_lock_phone is not null and v_lock_email is not null then
    if v_lock_phone <= v_lock_email then
      perform pg_catalog.pg_advisory_xact_lock(v_lock_phone);
      perform pg_catalog.pg_advisory_xact_lock(v_lock_email);
    else
      perform pg_catalog.pg_advisory_xact_lock(v_lock_email);
      perform pg_catalog.pg_advisory_xact_lock(v_lock_phone);
    end if;
  elsif v_lock_phone is not null then
    perform pg_catalog.pg_advisory_xact_lock(v_lock_phone);
  elsif v_lock_email is not null then
    perform pg_catalog.pg_advisory_xact_lock(v_lock_email);
  end if;

  select c.id
    into v_contact_id
  from public.crm_contacts c
  where c.workspace_id = v_workspace_id
    and (
      (
        v_phone_digits <> ''
        and pg_catalog.regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') <> ''
        and case
          when pg_catalog.length(v_phone_digits) >= 10
            then pg_catalog.right(pg_catalog.regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = pg_catalog.right(v_phone_digits, 10)
          else pg_catalog.regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_phone_digits
        end
      )
      or (v_email is not null and pg_catalog.lower(pg_catalog.btrim(coalesce(c.email, ''))) = v_email)
    )
  order by
    case
      when v_phone_digits <> ''
        and pg_catalog.regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') <> ''
        and case
          when pg_catalog.length(v_phone_digits) >= 10
            then pg_catalog.right(pg_catalog.regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = pg_catalog.right(v_phone_digits, 10)
          else pg_catalog.regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_phone_digits
        end
      then 0 else 1
    end,
    c.created_at desc
  limit 1;

  if v_contact_id is null then
    insert into public.crm_contacts (
      workspace_id, name, phone, email, company, source,
      lifecycle_stage, status, whatsapp_opt_in, custom_fields
    )
    values (
      v_workspace_id,
      nullif(pg_catalog.btrim(coalesce(p_name, '')), ''),
      nullif(pg_catalog.btrim(coalesce(p_phone, '')), ''),
      v_email,
      v_business_name,
      'digital_card',
      'lead',
      'active',
      false,
      pg_catalog.jsonb_build_object('intake_source', coalesce(p_activity_source, 'digital_card'))
    )
    returning id into v_contact_id;
  else
    update public.crm_contacts
    set
      name = coalesce(nullif(pg_catalog.btrim(coalesce(name, '')), ''), nullif(pg_catalog.btrim(coalesce(p_name, '')), '')),
      phone = coalesce(nullif(pg_catalog.btrim(coalesce(phone, '')), ''), nullif(pg_catalog.btrim(coalesce(p_phone, '')), '')),
      email = coalesce(nullif(pg_catalog.btrim(coalesce(email, '')), ''), v_email),
      company = coalesce(nullif(pg_catalog.btrim(coalesce(company, '')), ''), v_business_name),
      last_contacted_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    where id = v_contact_id and workspace_id = v_workspace_id;
  end if;

  select l.id
    into v_lead_id
  from public.crm_leads l
  where l.workspace_id = v_workspace_id
    and l.contact_id = v_contact_id
    and l.stage in ('new', 'qualified', 'proposal', 'negotiation')
  order by l.created_at desc
  limit 1;

  if coalesce(p_create_lead, false) and v_lead_id is null then
    insert into public.crm_leads (
      workspace_id, contact_id, title, source, stage, score, value, notes
    )
    values (
      v_workspace_id,
      v_contact_id,
      pg_catalog.left(
        coalesce(nullif(pg_catalog.btrim(coalesce(p_name, '')), ''), nullif(pg_catalog.btrim(coalesce(p_phone, '')), ''), v_email, 'New contact')
        || ' — Digital Card enquiry',
        200
      ),
      'digital_card',
      'new',
      50,
      0,
      pg_catalog.left('Captured from Digital Card: ' || coalesce(nullif(pg_catalog.btrim(coalesce(p_message, '')), ''), 'No message supplied.'), 4000)
    )
    returning id into v_lead_id;
  end if;

  v_note := pg_catalog.left(
    coalesce(nullif(pg_catalog.btrim(coalesce(p_activity_source, '')), ''), 'Digital Card form')
    || ': '
    || coalesce(
      nullif(pg_catalog.btrim(coalesce(p_subject, '')), ''),
      nullif(pg_catalog.btrim(coalesce(p_message, '')), ''),
      'Submitted a form without a message.'
    ),
    4000
  );

  insert into public.crm_follow_up_history (
    workspace_id, lead_id, contact_id, activity_type, note, status
  )
  values (
    v_workspace_id,
    v_lead_id,
    v_contact_id,
    'note',
    v_note,
    'completed'
  );
end;
$function$;

create or replace function public.trg_digital_card_lead_to_crm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.crm_sync_digital_card_intake(
    new.digital_card_id, new.name, new.email, new.phone, null, new.message,
    'Digital Card lead form', true
  );
  return new;
end;
$function$;

create or replace function public.trg_digital_card_message_to_crm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.crm_sync_digital_card_intake(
    new.digital_card_id, new.name, new.email, new.phone, new.subject, new.message,
    'Digital Card contact form', false
  );
  return new;
end;
$function$;

drop trigger if exists digital_card_leads_sync_crm on public.digital_card_leads;
create trigger digital_card_leads_sync_crm
after insert on public.digital_card_leads
for each row execute function public.trg_digital_card_lead_to_crm();

drop trigger if exists digital_card_messages_sync_crm on public.digital_card_messages;
create trigger digital_card_messages_sync_crm
after insert on public.digital_card_messages
for each row execute function public.trg_digital_card_message_to_crm();

revoke all on function public.crm_sync_digital_card_intake(uuid,text,text,text,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.trg_digital_card_lead_to_crm() from public, anon, authenticated;
revoke all on function public.trg_digital_card_message_to_crm() from public, anon, authenticated;
grant execute on function public.crm_sync_digital_card_intake(uuid,text,text,text,text,text,text,boolean) to service_role;
grant execute on function public.trg_digital_card_lead_to_crm() to service_role;
grant execute on function public.trg_digital_card_message_to_crm() to service_role;
