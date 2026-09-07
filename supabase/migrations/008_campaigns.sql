-- Durable broadcast campaigns, reusable audiences, templates, and suppressions.
create table public.vc_contact_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.vc_workspaces on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 240),
  created_by uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now()
);
create index vc_contact_lists_workspace on public.vc_contact_lists(workspace_id,created_at desc);

create table public.vc_list_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.vc_workspaces on delete cascade,
  list_id uuid not null references public.vc_contact_lists on delete cascade,
  phone text not null check (phone ~ '^[1-9][0-9]{7,14}$'),
  name text not null default '' check (char_length(name) <= 120),
  variables jsonb not null default '{}'::jsonb check (jsonb_typeof(variables)='object'),
  opted_in_at timestamptz not null,
  opt_in_source text not null check (char_length(opt_in_source) between 2 and 120),
  created_at timestamptz not null default now(),
  unique(list_id,phone)
);
create index vc_list_contacts_workspace on public.vc_list_contacts(workspace_id,list_id);

create table public.vc_message_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.vc_workspaces on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  body text not null check (char_length(body) between 1 and 4000),
  created_by uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vc_message_templates_workspace on public.vc_message_templates(workspace_id,updated_at desc);

create table public.vc_suppressions (
  workspace_id uuid not null references public.vc_workspaces on delete cascade,
  phone text not null check (phone ~ '^[1-9][0-9]{7,14}$'),
  reason text not null default 'opt_out' check (char_length(reason) between 2 and 120),
  created_by uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  primary key(workspace_id,phone)
);

create table public.vc_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.vc_workspaces on delete cascade,
  number_id uuid not null references public.vc_numbers on delete restrict,
  name text not null check (char_length(name) between 2 and 80),
  message_template text not null check (char_length(message_template) between 1 and 4000),
  status text not null default 'queued' check (status in ('scheduled','queued','sending','paused','completed','cancelled','failed')),
  scheduled_for timestamptz,
  recipient_count integer not null check (recipient_count between 1 and 5000),
  queued_count integer not null default 0 check (queued_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  suppressed_count integer not null default 0 check (suppressed_count >= 0),
  created_by uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index vc_campaigns_workspace_created on public.vc_campaigns(workspace_id,created_at desc);
create index vc_campaigns_worker on public.vc_campaigns(status,scheduled_for);

create table public.vc_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.vc_campaigns on delete cascade,
  workspace_id uuid not null references public.vc_workspaces on delete cascade,
  phone text not null check (phone ~ '^[1-9][0-9]{7,14}$'),
  name text not null default '' check (char_length(name) <= 120),
  variables jsonb not null default '{}'::jsonb check (jsonb_typeof(variables)='object'),
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','suppressed','cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  locked_at timestamptz,
  worker_id text,
  provider_message_id text,
  error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(campaign_id,phone)
);
create index vc_campaign_recipients_queue on public.vc_campaign_recipients(status,created_at) where status='queued';
create index vc_campaign_recipients_campaign on public.vc_campaign_recipients(campaign_id,status);

alter table public.vc_contact_lists enable row level security;
alter table public.vc_list_contacts enable row level security;
alter table public.vc_message_templates enable row level security;
alter table public.vc_suppressions enable row level security;
alter table public.vc_campaigns enable row level security;
alter table public.vc_campaign_recipients enable row level security;
create policy vc_contact_lists_read on public.vc_contact_lists for select to authenticated using(public.vc_role(workspace_id) is not null);
create policy vc_list_contacts_read on public.vc_list_contacts for select to authenticated using(public.vc_role(workspace_id) is not null);
create policy vc_message_templates_read on public.vc_message_templates for select to authenticated using(public.vc_role(workspace_id) is not null);
create policy vc_suppressions_read on public.vc_suppressions for select to authenticated using(public.vc_role(workspace_id) is not null);
create policy vc_campaigns_read on public.vc_campaigns for select to authenticated using(public.vc_role(workspace_id) is not null);
create policy vc_campaign_recipients_read on public.vc_campaign_recipients for select to authenticated using(public.vc_role(workspace_id) is not null);
revoke all on public.vc_contact_lists,public.vc_list_contacts,public.vc_message_templates,public.vc_suppressions,public.vc_campaigns,public.vc_campaign_recipients from anon,authenticated;
grant select on public.vc_contact_lists,public.vc_list_contacts,public.vc_message_templates,public.vc_suppressions,public.vc_campaigns,public.vc_campaign_recipients to authenticated;

create function public.vc_create_contact_list(target uuid,list_name text,list_description text,contacts jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; item jsonb; clean_phone text; total integer;
begin
  if coalesce(public.vc_role(target),'') not in ('owner','admin') then raise exception 'Admin access required'; end if;
  if char_length(trim(list_name)) not between 2 and 80 or char_length(coalesce(list_description,''))>240 or jsonb_typeof(contacts)<>'array' then raise exception 'Invalid contact list'; end if;
  total:=jsonb_array_length(contacts);
  if total<1 or total>5000 then raise exception 'A list must contain 1 to 5000 contacts'; end if;
  insert into public.vc_contact_lists(workspace_id,name,description,created_by) values(target,trim(list_name),trim(coalesce(list_description,'')),auth.uid()) returning id into result;
  for item in select value from jsonb_array_elements(contacts) loop
    clean_phone:=regexp_replace(coalesce(item->>'phone',''),'[^0-9]','','g');
    if clean_phone ~ '^[1-9][0-9]{7,14}$' then
      insert into public.vc_list_contacts(workspace_id,list_id,phone,name,variables,opted_in_at,opt_in_source)
      values(target,result,clean_phone,left(trim(coalesce(item->>'name','')),120),coalesce(item->'variables','{}'::jsonb),coalesce((item->>'optedInAt')::timestamptz,now()),left(coalesce(nullif(trim(item->>'optInSource'),''),'import'),120))
      on conflict(list_id,phone) do update set name=excluded.name,variables=excluded.variables,opted_in_at=excluded.opted_in_at,opt_in_source=excluded.opt_in_source;
    end if;
  end loop;
  if not exists(select 1 from public.vc_list_contacts where list_id=result) then raise exception 'No valid contacts'; end if;
  return result;
end $$;

create function public.vc_create_message_template(target uuid,template_name text,template_body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if coalesce(public.vc_role(target),'') not in ('owner','admin') then raise exception 'Admin access required'; end if;
  if char_length(trim(template_name)) not between 2 and 80 or char_length(trim(template_body)) not between 1 and 4000 then raise exception 'Invalid template'; end if;
  insert into public.vc_message_templates(workspace_id,name,body,created_by) values(target,trim(template_name),trim(template_body),auth.uid()) returning id into result;
  return result;
end $$;

create function public.vc_set_suppression(target uuid,recipient_phone text,suppression_reason text,suppressed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare clean_phone text:=regexp_replace(coalesce(recipient_phone,''),'[^0-9]','','g');
begin
  if coalesce(public.vc_role(target),'') not in ('owner','admin') or clean_phone !~ '^[1-9][0-9]{7,14}$' then raise exception 'Invalid suppression'; end if;
  if suppressed then
    insert into public.vc_suppressions(workspace_id,phone,reason,created_by) values(target,clean_phone,left(coalesce(nullif(trim(suppression_reason),''),'opt_out'),120),auth.uid())
    on conflict(workspace_id,phone) do update set reason=excluded.reason,created_by=excluded.created_by,created_at=now();
  else delete from public.vc_suppressions where workspace_id=target and phone=clean_phone;
  end if;
end $$;

create function public.vc_create_campaign(target uuid,source_number uuid,campaign_name text,campaign_message text,send_at timestamptz,recipients jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; item jsonb; clean_phone text; total integer; queued integer:=0; blocked integer:=0; next_status text;
begin
  if coalesce(public.vc_role(target),'') not in ('owner','admin') then raise exception 'Admin access required'; end if;
  if not exists(select 1 from public.vc_numbers where id=source_number and workspace_id=target) then raise exception 'Number not found'; end if;
  if char_length(trim(campaign_name)) not between 2 and 80 or char_length(trim(campaign_message)) not between 1 and 4000 or jsonb_typeof(recipients)<>'array' then raise exception 'Invalid campaign'; end if;
  total:=jsonb_array_length(recipients);
  if total<1 or total>5000 then raise exception 'A campaign must contain 1 to 5000 recipients'; end if;
  if send_at is not null and send_at>now()+interval '90 days' then raise exception 'Schedule is too far ahead'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text,8));
  if (select count(*) from public.vc_campaigns where workspace_id=target and created_at>now()-interval '1 minute')>=5 then raise exception 'Campaign creation rate limit reached'; end if;
  next_status:=case when send_at is not null and send_at>now() then 'scheduled' else 'queued' end;
  insert into public.vc_campaigns(workspace_id,number_id,name,message_template,status,scheduled_for,recipient_count,created_by)
  values(target,source_number,trim(campaign_name),trim(campaign_message),next_status,send_at,total,auth.uid()) returning id into result;
  for item in select distinct on (value->>'phone') value from jsonb_array_elements(recipients) order by value->>'phone' loop
    clean_phone:=regexp_replace(coalesce(item->>'phone',''),'[^0-9]','','g');
    if clean_phone ~ '^[1-9][0-9]{7,14}$' then
      if exists(select 1 from public.vc_suppressions where workspace_id=target and phone=clean_phone) then
        insert into public.vc_campaign_recipients(campaign_id,workspace_id,phone,name,variables,status) values(result,target,clean_phone,left(trim(coalesce(item->>'name','')),120),coalesce(item->'variables','{}'::jsonb),'suppressed');
        blocked:=blocked+1;
      else
        insert into public.vc_campaign_recipients(campaign_id,workspace_id,phone,name,variables) values(result,target,clean_phone,left(trim(coalesce(item->>'name','')),120),coalesce(item->'variables','{}'::jsonb));
        queued:=queued+1;
      end if;
    end if;
  end loop;
  if queued+blocked=0 then raise exception 'No valid recipients'; end if;
  update public.vc_campaigns set recipient_count=queued+blocked,queued_count=queued,suppressed_count=blocked,status=case when queued=0 then 'completed' else next_status end,completed_at=case when queued=0 then now() end where id=result;
  return result;
end $$;

create function public.vc_campaign_action(target uuid,campaign uuid,next_action text) returns void
language plpgsql security definer set search_path='' as $$
declare current_status text;
begin
  if coalesce(public.vc_role(target),'') not in ('owner','admin') then raise exception 'Admin access required'; end if;
  select status into current_status from public.vc_campaigns where id=campaign and workspace_id=target for update;
  if current_status is null then raise exception 'Campaign not found'; end if;
  if next_action='pause' and current_status in('scheduled','queued','sending') then update public.vc_campaigns set status='paused' where id=campaign;
  elsif next_action='resume' and current_status='paused' then update public.vc_campaigns set status=case when scheduled_for>now() then 'scheduled' else 'queued' end where id=campaign;
  elsif next_action='cancel' and current_status in('scheduled','queued','sending','paused') then
    update public.vc_campaigns set status='cancelled',completed_at=now() where id=campaign;
    update public.vc_campaign_recipients set status='cancelled' where campaign_id=campaign and status='queued';
  else raise exception 'Campaign action is not available'; end if;
end $$;

revoke all on function public.vc_create_contact_list(uuid,text,text,jsonb),public.vc_create_message_template(uuid,text,text),public.vc_set_suppression(uuid,text,text,boolean),public.vc_create_campaign(uuid,uuid,text,text,timestamptz,jsonb),public.vc_campaign_action(uuid,uuid,text) from public,anon;
grant execute on function public.vc_create_contact_list(uuid,text,text,jsonb),public.vc_create_message_template(uuid,text,text),public.vc_set_suppression(uuid,text,text,boolean),public.vc_create_campaign(uuid,uuid,text,text,timestamptz,jsonb),public.vc_campaign_action(uuid,uuid,text) to authenticated;

alter publication supabase_realtime add table public.vc_campaigns;
alter publication supabase_realtime add table public.vc_campaign_recipients;
