-- Broadcast history is tenant-scoped and readable only by workspace members.
create table public.vc_broadcasts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.vc_workspaces on delete cascade,
  number_id uuid not null references public.vc_numbers on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  message text not null check (char_length(message) between 1 and 4000),
  status text not null check (status in ('sending','completed','partial','failed')) default 'sending',
  recipient_count integer not null check (recipient_count between 1 and 25),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_by uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index vc_broadcasts_workspace_created on public.vc_broadcasts(workspace_id, created_at desc);
alter table public.vc_broadcasts enable row level security;
create policy vc_broadcasts_read on public.vc_broadcasts for select to authenticated using (public.vc_role(workspace_id) is not null);
revoke all on public.vc_broadcasts from anon, authenticated;
grant select on public.vc_broadcasts to authenticated;

create function public.vc_begin_broadcast(target uuid, source_number uuid, broadcast_name text, broadcast_message text, total_recipients integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if coalesce(public.vc_role(target),'') not in ('owner','admin') then raise exception 'Admin access required'; end if;
  if total_recipients not between 1 and 25 or char_length(trim(broadcast_name)) not between 2 and 80 or char_length(trim(broadcast_message)) not between 1 and 4000 then raise exception 'Invalid broadcast'; end if;
  if not exists(select 1 from public.vc_numbers where id=source_number and workspace_id=target) then raise exception 'Number not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text,2));
  if (select count(*) from public.vc_broadcasts where workspace_id=target and created_at>now()-interval '1 minute') >= 2 then raise exception 'Broadcast rate limit reached'; end if;
  if coalesce((select sum(recipient_count) from public.vc_broadcasts where workspace_id=target and created_at>now()-interval '1 day'),0) + total_recipients > 250 then raise exception 'Daily recipient limit reached'; end if;
  insert into public.vc_broadcasts(workspace_id,number_id,name,message,recipient_count,created_by) values(target,source_number,trim(broadcast_name),trim(broadcast_message),total_recipients,auth.uid()) returning id into result;
  return result;
end $$;

create function public.vc_finish_broadcast(broadcast_id uuid, delivered integer, rejected integer, final_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  select workspace_id into target from public.vc_broadcasts where id=broadcast_id;
  if coalesce(public.vc_role(target),'') not in ('owner','admin') then raise exception 'Admin access required'; end if;
  if final_status not in ('completed','partial','failed') or delivered < 0 or rejected < 0 then raise exception 'Invalid result'; end if;
  update public.vc_broadcasts set sent_count=delivered,failed_count=rejected,status=final_status,completed_at=now() where id=broadcast_id and delivered+rejected=recipient_count;
end $$;

revoke all on function public.vc_begin_broadcast(uuid,uuid,text,text,integer), public.vc_finish_broadcast(uuid,integer,integer,text) from public, anon;
grant execute on function public.vc_begin_broadcast(uuid,uuid,text,text,integer), public.vc_finish_broadcast(uuid,integer,integer,text) to authenticated;
