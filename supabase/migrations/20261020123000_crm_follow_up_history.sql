-- CRM follow-up history adapted to workspace-scoped Social Manager data.
-- Adds interaction history without replacing existing CRM contacts, leads or tasks.

create table if not exists public.crm_follow_up_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.crm_leads(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  activity_type text not null default 'note'
    check (activity_type in ('call','whatsapp','email','meeting','note','other')),
  note text not null check (char_length(btrim(note)) between 1 and 4000),
  status text not null default 'completed'
    check (status in ('completed','pending','cancelled')),
  next_follow_up_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_follow_up_history_target_check check (lead_id is not null or contact_id is not null)
);

create index if not exists crm_follow_up_history_workspace_created_idx
  on public.crm_follow_up_history (workspace_id, created_at desc);
create index if not exists crm_follow_up_history_workspace_next_followup_idx
  on public.crm_follow_up_history (workspace_id, next_follow_up_at)
  where next_follow_up_at is not null;

alter table public.crm_follow_up_history enable row level security;

drop policy if exists "Workspace members can view CRM follow-up history" on public.crm_follow_up_history;
create policy "Workspace members can view CRM follow-up history"
on public.crm_follow_up_history for select to authenticated
using (
  exists (select 1 from public.workspaces w where w.id = crm_follow_up_history.workspace_id and w.owner_user_id = (select auth.uid()))
  or exists (select 1 from public.workplace_members wm where wm.workspace_id = crm_follow_up_history.workspace_id and wm.user_id = (select auth.uid()) and wm.active = true)
);

drop policy if exists "Workspace members can create CRM follow-up history" on public.crm_follow_up_history;
create policy "Workspace members can create CRM follow-up history"
on public.crm_follow_up_history for insert to authenticated
with check (
  (
    exists (select 1 from public.workspaces w where w.id = crm_follow_up_history.workspace_id and w.owner_user_id = (select auth.uid()))
    or exists (select 1 from public.workplace_members wm where wm.workspace_id = crm_follow_up_history.workspace_id and wm.user_id = (select auth.uid()) and wm.active = true)
  )
  and (lead_id is null or exists (select 1 from public.crm_leads l where l.id = crm_follow_up_history.lead_id and l.workspace_id = crm_follow_up_history.workspace_id))
  and (contact_id is null or exists (select 1 from public.crm_contacts c where c.id = crm_follow_up_history.contact_id and c.workspace_id = crm_follow_up_history.workspace_id))
  and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "Workspace members can update CRM follow-up history" on public.crm_follow_up_history;
create policy "Workspace members can update CRM follow-up history"
on public.crm_follow_up_history for update to authenticated
using (
  exists (select 1 from public.workspaces w where w.id = crm_follow_up_history.workspace_id and w.owner_user_id = (select auth.uid()))
  or exists (select 1 from public.workplace_members wm where wm.workspace_id = crm_follow_up_history.workspace_id and wm.user_id = (select auth.uid()) and wm.active = true)
)
with check (
  (
    exists (select 1 from public.workspaces w where w.id = crm_follow_up_history.workspace_id and w.owner_user_id = (select auth.uid()))
    or exists (select 1 from public.workplace_members wm where wm.workspace_id = crm_follow_up_history.workspace_id and wm.user_id = (select auth.uid()) and wm.active = true)
  )
  and (lead_id is null or exists (select 1 from public.crm_leads l where l.id = crm_follow_up_history.lead_id and l.workspace_id = crm_follow_up_history.workspace_id))
  and (contact_id is null or exists (select 1 from public.crm_contacts c where c.id = crm_follow_up_history.contact_id and c.workspace_id = crm_follow_up_history.workspace_id))
  and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "Workspace members can delete CRM follow-up history" on public.crm_follow_up_history;
create policy "Workspace members can delete CRM follow-up history"
on public.crm_follow_up_history for delete to authenticated
using (
  exists (select 1 from public.workspaces w where w.id = crm_follow_up_history.workspace_id and w.owner_user_id = (select auth.uid()))
  or exists (select 1 from public.workplace_members wm where wm.workspace_id = crm_follow_up_history.workspace_id and wm.user_id = (select auth.uid()) and wm.active = true)
);
