-- Phase 1: include WhatsApp in workspace role defaults.

create or replace function public.workspace_role_defaults(p_role text)
returns table(module text, can_view boolean, can_create boolean, can_edit boolean, can_submit boolean, can_approve boolean, can_publish boolean, can_manage boolean)
language sql
immutable
set search_path = ''
as $function$
  select * from (values
    ('dashboard', true,true,true,true,true,true,true),
    ('content', true,true,true,true,false,false,false),
    ('creative', true,true,true,true,false,false,false),
    ('calendar', true,true,true,true,false,false,false),
    ('analytics', true,false,false,false,false,false,false),
    ('drafts', true,true,true,true,false,false,false),
    ('approval', true,false,false,false,true,false,false),
    ('publishing', true,false,false,false,false,true,false),
    ('social_accounts', true,false,false,false,false,false,false),
    ('whatsapp', true,true,true,false,false,false,false),
    ('team', false,false,false,false,false,false,false),
    ('workspace_settings', false,false,false,false,false,false,false)
  ) v(module, can_view, can_create, can_edit, can_submit, can_approve, can_publish, can_manage)
  where p_role = 'member'
  union all
  select * from (values
    ('dashboard', true,true,true,true,true,true,true),
    ('content', true,true,true,true,true,false,true),
    ('creative', true,true,true,true,false,false,true),
    ('calendar', true,true,true,true,false,false,true),
    ('analytics', true,true,true,false,false,false,true),
    ('drafts', true,true,true,true,true,false,true),
    ('approval', true,false,false,false,true,false,true),
    ('publishing', true,false,false,false,false,true,false),
    ('social_accounts', true,false,false,false,false,false,true),
    ('whatsapp', true,true,true,false,false,false,true),
    ('team', true,true,true,false,false,false,true),
    ('workspace_settings', false,false,false,false,false,false,false)
  ) v2(module, can_view, can_create, can_edit, can_submit, can_approve, can_publish, can_manage)
  where p_role = 'manager'
  union all
  select * from (values
    ('dashboard', true,true,true,true,true,true,true),
    ('content', true,true,true,true,true,true,true),
    ('creative', true,true,true,true,true,true,true),
    ('calendar', true,true,true,true,true,true,true),
    ('analytics', true,true,true,true,true,true,true),
    ('drafts', true,true,true,true,true,true,true),
    ('approval', true,true,true,true,true,true,true),
    ('publishing', true,true,true,true,true,true,true),
    ('social_accounts', true,true,true,true,true,true,true),
    ('whatsapp', true,true,true,true,true,true,true),
    ('team', true,true,true,true,true,true,true),
    ('workspace_settings', true,true,true,true,true,true,true)
  ) v3(module, can_view, can_create, can_edit, can_submit, can_approve, can_publish, can_manage)
  where p_role in ('admin','owner');
$function$;