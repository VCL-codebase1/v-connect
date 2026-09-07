-- Webhooks store only a small refresh signal; message bodies remain in Evolution API.
create table public.vc_webhook_configs (
  number_id uuid primary key references public.vc_numbers on delete cascade,
  workspace_id uuid not null references public.vc_workspaces on delete cascade,
  secret text not null check (char_length(secret) >= 32),
  enabled_at timestamptz not null default now()
);
create table public.vc_inbox_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.vc_workspaces on delete cascade,
  number_id uuid not null references public.vc_numbers on delete cascade,
  event text not null check (event in ('messages.upsert','messages.update','send.message','send.message.update','chats.upsert','chats.update','connection.update')),
  created_at timestamptz not null default now()
);
create index vc_inbox_events_number_created on public.vc_inbox_events(number_id,created_at desc);
alter table public.vc_webhook_configs enable row level security;
alter table public.vc_inbox_events enable row level security;
create policy vc_inbox_events_read on public.vc_inbox_events for select to authenticated using (public.vc_role(workspace_id) is not null);
revoke all on public.vc_webhook_configs, public.vc_inbox_events from anon, authenticated;
grant select on public.vc_inbox_events to authenticated;

create function public.vc_set_webhook_secret(target uuid, source_number uuid, webhook_secret text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.vc_role(target),'') not in ('owner','admin') then raise exception 'Admin access required'; end if;
  if char_length(webhook_secret) < 32 or not exists(select 1 from public.vc_numbers where id=source_number and workspace_id=target) then raise exception 'Invalid webhook configuration'; end if;
  insert into public.vc_webhook_configs(number_id,workspace_id,secret) values(source_number,target,webhook_secret)
  on conflict(number_id) do update set secret=excluded.secret,enabled_at=now();
end $$;

create function public.vc_record_inbox_event(webhook_secret text, provider_instance text, event_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare config public.vc_webhook_configs;
begin
  if event_name not in ('messages.upsert','messages.update','send.message','send.message.update','chats.upsert','chats.update','connection.update') then return; end if;
  select c.* into config from public.vc_webhook_configs c join public.vc_numbers n on n.id=c.number_id where n.instance_name=provider_instance and c.secret=webhook_secret;
  if config.number_id is null then raise exception 'Invalid webhook secret'; end if;
  insert into public.vc_inbox_events(workspace_id,number_id,event) values(config.workspace_id,config.number_id,event_name);
  delete from public.vc_inbox_events where number_id=config.number_id and created_at<now()-interval '1 day';
end $$;
revoke all on function public.vc_set_webhook_secret(uuid,uuid,text), public.vc_record_inbox_event(text,text,text) from public;
grant execute on function public.vc_set_webhook_secret(uuid,uuid,text) to authenticated;
grant execute on function public.vc_record_inbox_event(text,text,text) to anon;
alter publication supabase_realtime add table public.vc_inbox_events;
