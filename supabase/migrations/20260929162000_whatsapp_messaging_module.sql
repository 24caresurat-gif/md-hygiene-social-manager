-- WhatsApp messaging module: inbox, messages, templates and campaigns.
-- Schema and RLS are applied to the connected Supabase project as part of this delivery.

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  contact_id uuid references public.whatsapp_contacts(id) on delete set null,
  phone text not null,
  contact_name text,
  status text not null default 'open' check (status in ('open','pending','closed')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_preview text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  customer_window_expires_at timestamptz,
  assigned_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, phone)
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  contact_id uuid references public.whatsapp_contacts(id) on delete set null,
  direction text not null check (direction in ('inbound','outbound')),
  type text not null default 'text' check (type in ('text','template','image','video','audio','document','sticker','location','contacts','interactive','reaction','unknown')),
  body text,
  media_url text,
  media_mime_type text,
  provider_message_id text,
  provider_status text not null default 'queued' check (provider_status in ('queued','sent','delivered','read','failed','deleted','received')),
  error_message text,
  template_name text,
  template_language text,
  template_parameters jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  sent_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid references public.whatsapp_connections(id) on delete set null,
  provider_template_id text,
  name text not null,
  language text not null,
  category text not null default 'UTILITY' check (category in ('MARKETING','UTILITY','AUTHENTICATION')),
  status text not null default 'DRAFT' check (status in ('DRAFT','PENDING','APPROVED','REJECTED','PAUSED','DISABLED')),
  components jsonb not null default '[]'::jsonb,
  body_preview text,
  rejection_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name, language)
);

create table if not exists public.whatsapp_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid references public.whatsapp_connections(id) on delete set null,
  name text not null,
  template_id uuid references public.whatsapp_templates(id) on delete set null,
  audience_filter jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','scheduled','running','completed','failed','cancelled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  total_recipients integer not null default 0,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  read_count integer not null default 0,
  failed_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.whatsapp_campaigns(id) on delete cascade,
  contact_id uuid references public.whatsapp_contacts(id) on delete set null,
  phone text not null,
  name text,
  status text not null default 'queued' check (status in ('queued','sent','delivered','read','failed','skipped')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, phone)
);

create unique index if not exists whatsapp_messages_connection_provider_id_uidx
  on public.whatsapp_messages(connection_id, provider_message_id)
  where provider_message_id is not null;
create index if not exists whatsapp_conversations_workspace_last_message_idx
  on public.whatsapp_conversations(workspace_id, last_message_at desc nulls last);
create index if not exists whatsapp_conversations_workspace_status_idx
  on public.whatsapp_conversations(workspace_id, status, updated_at desc);
create index if not exists whatsapp_messages_conversation_created_idx
  on public.whatsapp_messages(conversation_id, created_at);
create index if not exists whatsapp_messages_workspace_created_idx
  on public.whatsapp_messages(workspace_id, created_at desc);
create index if not exists whatsapp_templates_workspace_status_idx
  on public.whatsapp_templates(workspace_id, status, updated_at desc);
create index if not exists whatsapp_campaigns_workspace_status_idx
  on public.whatsapp_campaigns(workspace_id, status, scheduled_at desc nulls last);
create index if not exists whatsapp_campaign_recipients_campaign_status_idx
  on public.whatsapp_campaign_recipients(campaign_id, status);

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.whatsapp_campaigns enable row level security;
alter table public.whatsapp_campaign_recipients enable row level security;

drop policy if exists "Workspace members can view WhatsApp conversations" on public.whatsapp_conversations;
create policy "Workspace members can view WhatsApp conversations" on public.whatsapp_conversations for select to authenticated
using (
  exists (select 1 from public.workspaces w where w.id = whatsapp_conversations.workspace_id and w.owner_user_id = (select auth.uid()))
  or exists (select 1 from public.workplace_members wm where wm.workspace_id = whatsapp_conversations.workspace_id and wm.user_id = (select auth.uid()) and wm.active = true)
);

drop policy if exists "Workspace members can view WhatsApp messages" on public.whatsapp_messages;
create policy "Workspace members can view WhatsApp messages" on public.whatsapp_messages for select to authenticated
using (
  exists (select 1 from public.workspaces w where w.id = whatsapp_messages.workspace_id and w.owner_user_id = (select auth.uid()))
  or exists (select 1 from public.workplace_members wm where wm.workspace_id = whatsapp_messages.workspace_id and wm.user_id = (select auth.uid()) and wm.active = true)
);

drop policy if exists "Workspace members can view WhatsApp templates" on public.whatsapp_templates;
create policy "Workspace members can view WhatsApp templates" on public.whatsapp_templates for select to authenticated
using (
  exists (select 1 from public.workspaces w where w.id = whatsapp_templates.workspace_id and w.owner_user_id = (select auth.uid()))
  or exists (select 1 from public.workplace_members wm where wm.workspace_id = whatsapp_templates.workspace_id and wm.user_id = (select auth.uid()) and wm.active = true)
);

drop policy if exists "Workspace members can view WhatsApp campaigns" on public.whatsapp_campaigns;
create policy "Workspace members can view WhatsApp campaigns" on public.whatsapp_campaigns for select to authenticated
using (
  exists (select 1 from public.workspaces w where w.id = whatsapp_campaigns.workspace_id and w.owner_user_id = (select auth.uid()))
  or exists (select 1 from public.workplace_members wm where wm.workspace_id = whatsapp_campaigns.workspace_id and wm.user_id = (select auth.uid()) and wm.active = true)
);

drop policy if exists "Workspace members can view WhatsApp campaign recipients" on public.whatsapp_campaign_recipients;
create policy "Workspace members can view WhatsApp campaign recipients" on public.whatsapp_campaign_recipients for select to authenticated
using (
  exists (
    select 1
    from public.whatsapp_campaigns c
    join public.workspaces w on w.id = c.workspace_id
    where c.id = whatsapp_campaign_recipients.campaign_id
      and (
        w.owner_user_id = (select auth.uid())
        or exists (
          select 1 from public.workplace_members wm
          where wm.workspace_id = c.workspace_id and wm.user_id = (select auth.uid()) and wm.active = true
        )
      )
  )
);

alter table public.workspace_member_permissions drop constraint if exists workspace_member_permissions_module_check;
alter table public.workspace_member_permissions add constraint workspace_member_permissions_module_check
  check (module = any (array['dashboard','content','creative','calendar','analytics','drafts','approval','publishing','social_accounts','whatsapp','team','workspace_settings']));

insert into public.workspace_member_permissions (workspace_id,user_id,module,can_view,can_create,can_edit,can_submit,can_approve,can_publish,can_manage)
select m.workspace_id,m.user_id,'whatsapp',true,true,true,false,false,true,true
from public.workplace_members m
where m.active=true and m.role in ('manager','admin')
on conflict (workspace_id,user_id,module) do nothing;
