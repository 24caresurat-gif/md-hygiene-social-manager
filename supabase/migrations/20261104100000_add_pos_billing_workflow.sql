-- Additive POS support. Existing online catalogue checkout stays unchanged.
create table if not exists public.pos_tables (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  table_number text not null,
  qr_token uuid not null default gen_random_uuid(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_tables_number_not_empty check (char_length(btrim(table_number)) between 1 and 40),
  constraint pos_tables_workspace_table_unique unique (workspace_id, table_number),
  constraint pos_tables_qr_token_unique unique (qr_token)
);

alter table public.pos_tables enable row level security;
drop policy if exists pos_tables_member_select on public.pos_tables;
create policy pos_tables_member_select on public.pos_tables
  for select to authenticated using (private.is_workspace_member(workspace_id));
drop policy if exists pos_tables_manager_insert on public.pos_tables;
create policy pos_tables_manager_insert on public.pos_tables
  for insert to authenticated with check (private.is_workspace_manager(workspace_id));
drop policy if exists pos_tables_manager_update on public.pos_tables;
create policy pos_tables_manager_update on public.pos_tables
  for update to authenticated using (private.is_workspace_manager(workspace_id))
  with check (private.is_workspace_manager(workspace_id));
drop policy if exists pos_tables_manager_delete on public.pos_tables;
create policy pos_tables_manager_delete on public.pos_tables
  for delete to authenticated using (private.is_workspace_manager(workspace_id));
grant select, insert, update, delete on public.pos_tables to authenticated, service_role;

alter table public.catalog_orders
  add column if not exists order_channel text not null default 'online',
  add column if not exists order_type text not null default 'delivery',
  add column if not exists table_label text,
  add column if not exists pos_table_id uuid references public.pos_tables(id) on delete set null;

alter table public.catalog_orders drop constraint if exists catalog_orders_order_channel_check;
alter table public.catalog_orders add constraint catalog_orders_order_channel_check
  check (order_channel in ('online','pos','table_qr'));
alter table public.catalog_orders drop constraint if exists catalog_orders_order_type_check;
alter table public.catalog_orders add constraint catalog_orders_order_type_check
  check (order_type in ('delivery','counter','dine_in','takeaway'));
alter table public.catalog_orders drop constraint if exists catalog_orders_status_check;
alter table public.catalog_orders add constraint catalog_orders_status_check
  check (status in ('pending','confirmed','processing','preparing','ready','served','shipped','delivered','cancelled'));

create index if not exists catalog_orders_workspace_channel_created_idx
  on public.catalog_orders(workspace_id,order_channel,created_at desc);

create or replace function public.create_pos_order_transaction(
  p_workspace_id uuid,
  p_order_number text,
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text default null,
  p_order_type text default 'counter',
  p_table_label text default null,
  p_payment_status text default 'pending',
  p_notes text default null,
  p_order_channel text default 'pos',
  p_pos_table_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_item record;
  v_order public.catalog_orders%rowtype;
  v_expected integer := 0;
  v_processed integer := 0;
  v_total numeric(12,2) := 0;
  v_customer text;
  v_table_number text;
begin
  if p_workspace_id is null or nullif(pg_catalog.btrim(coalesce(p_order_number,'')),'') is null then
    raise exception using errcode='P0001',message='Workspace and order number are required.';
  end if;
  if pg_catalog.jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode='P0001',message='Bill items must be a list.';
  end if;
  if pg_catalog.jsonb_array_length(p_items)=0 or pg_catalog.jsonb_array_length(p_items)>100 then
    raise exception using errcode='P0001',message='Add between 1 and 100 product lines.';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_to_recordset(p_items) as x(product_id uuid,quantity integer)
    where x.product_id is null or x.quantity is null or x.quantity<1 or x.quantity>1000
  ) then
    raise exception using errcode='P0001',message='Each bill line needs a valid product and quantity.';
  end if;
  if p_order_type not in ('counter','dine_in','takeaway') then
    raise exception using errcode='P0001',message='Choose counter, dine-in or takeaway.';
  end if;
  if p_order_channel not in ('pos','table_qr') then
    raise exception using errcode='P0001',message='Unsupported POS order channel.';
  end if;
  if p_order_channel='table_qr' then
    if p_order_type<>'dine_in' or p_pos_table_id is null then
      raise exception using errcode='P0001',message='A valid restaurant table is required for QR orders.';
    end if;
    select table_number into v_table_number
      from public.pos_tables
     where id=p_pos_table_id and workspace_id=p_workspace_id and active=true
     for share;
    if not found then
      raise exception using errcode='P0001',message='This table QR is inactive or unavailable.';
    end if;
  end if;
  if p_order_type='dine_in' and nullif(pg_catalog.btrim(coalesce(p_table_label,'')),'') is null then
    raise exception using errcode='P0001',message='Enter a table number for dine-in orders.';
  end if;
  if p_payment_status not in ('pending','paid') then
    raise exception using errcode='P0001',message='Payment status must be pending or paid.';
  end if;

  select pg_catalog.count(*)::integer into v_expected
  from (select x.product_id from pg_catalog.jsonb_to_recordset(p_items) as x(product_id uuid,quantity integer) group by x.product_id) q;

  -- Lock and price every active product in this workspace before creating the order.
  for v_item in
    select p.id,p.name,p.sku,p.price,p.stock_quantity,x.quantity
    from public.catalog_products p
    join (select product_id,pg_catalog.sum(quantity)::integer as quantity
          from pg_catalog.jsonb_to_recordset(p_items) as x(product_id uuid,quantity integer)
          group by product_id) x on x.product_id=p.id
    where p.workspace_id=p_workspace_id and p.active=true
    order by p.id
    for update of p
  loop
    v_processed:=v_processed+1;
    if v_item.price<0 then raise exception using errcode='P0001',message='Product price is invalid.'; end if;
    if v_item.stock_quantity<v_item.quantity then
      raise exception using errcode='P0001',message=v_item.name||' does not have enough stock.';
    end if;
    v_total:=v_total+pg_catalog.round(v_item.price*v_item.quantity,2);
  end loop;
  if v_processed=0 or v_processed<>v_expected then
    raise exception using errcode='P0001',message='One or more products are inactive or outside this workspace.';
  end if;
  v_total:=pg_catalog.round(v_total,2);
  v_customer:=pg_catalog.left(coalesce(nullif(pg_catalog.btrim(coalesce(p_customer_name,'')),''),'Walk-in Customer'),200);

  insert into public.catalog_orders(
    workspace_id,order_number,customer_name,customer_phone,subtotal,discount,total,
    status,payment_status,shipping_address,notes,order_channel,order_type,table_label,pos_table_id
  ) values (
    p_workspace_id,pg_catalog.left(pg_catalog.btrim(p_order_number),80),v_customer,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_customer_phone,'')),40),''),
    v_total,0,v_total,'pending',p_payment_status,'{}'::jsonb,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_notes,'')),1000),''),
    p_order_channel,p_order_type,
    case when p_order_type='dine_in' then pg_catalog.left(pg_catalog.btrim(coalesce(v_table_number,p_table_label)),40) else null end,
    p_pos_table_id
  ) returning * into v_order;

  for v_item in
    select p.id,p.name,p.sku,p.price,p.stock_quantity,x.quantity
    from public.catalog_products p
    join (select product_id,pg_catalog.sum(quantity)::integer as quantity
          from pg_catalog.jsonb_to_recordset(p_items) as x(product_id uuid,quantity integer)
          group by product_id) x on x.product_id=p.id
    where p.workspace_id=p_workspace_id and p.active=true
    order by p.id
    for update of p
  loop
    update public.catalog_products set stock_quantity=stock_quantity-v_item.quantity,updated_at=pg_catalog.now()
     where id=v_item.id and workspace_id=p_workspace_id and active=true and stock_quantity>=v_item.quantity;
    if not found then raise exception using errcode='P0001',message='Stock changed while creating the bill. Please try again.'; end if;
    insert into public.catalog_order_items(order_id,product_id,product_name,sku,quantity,unit_price,line_total)
    values(v_order.id,v_item.id,v_item.name,v_item.sku,v_item.quantity,v_item.price,pg_catalog.round(v_item.price*v_item.quantity,2));
  end loop;

  return pg_catalog.jsonb_build_object(
    'id',v_order.id,'order_number',v_order.order_number,'order_channel',v_order.order_channel,
    'order_type',v_order.order_type,'table_label',v_order.table_label,'pos_table_id',v_order.pos_table_id,'customer_name',v_order.customer_name,
    'subtotal',v_order.subtotal,'total',v_order.total,'status',v_order.status,
    'payment_status',v_order.payment_status,'created_at',v_order.created_at
  );
end;
$function$;

revoke all on function public.create_pos_order_transaction(uuid,text,jsonb,text,text,text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.create_pos_order_transaction(uuid,text,jsonb,text,text,text,text,text,text,text,uuid) to service_role;
grant select,update on public.catalog_products to service_role;
grant insert on public.catalog_orders,public.catalog_order_items to service_role;
