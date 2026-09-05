-- Apply once in the Supabase SQL editor. All app tables use a vc_ prefix.
create table public.vc_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  created_at timestamptz not null default now()
);
create table public.vc_memberships (
  workspace_id uuid not null references public.vc_workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);
create index vc_memberships_user on public.vc_memberships(user_id);
create table public.vc_numbers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.vc_workspaces on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  instance_name text not null unique,
  created_at timestamptz not null default now()
);
create index vc_numbers_workspace on public.vc_numbers(workspace_id);
create table public.vc_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.vc_workspaces on delete cascade,
  email text not null,
  role text not null check (role in ('admin','member')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create table public.vc_action_limits (
  workspace_id uuid not null references public.vc_workspaces on delete cascade,
  action text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key(workspace_id,action)
);
-- Security-definer functions use fixed search paths and always verify auth.uid().
create function public.vc_role(target uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.vc_memberships where workspace_id=target and user_id=auth.uid()
$$;
alter table public.vc_workspaces enable row level security;
alter table public.vc_memberships enable row level security;
alter table public.vc_numbers enable row level security;
alter table public.vc_invitations enable row level security;
alter table public.vc_action_limits enable row level security;
create policy vc_workspaces_read on public.vc_workspaces for select to authenticated using (public.vc_role(id) is not null);
create policy vc_memberships_read on public.vc_memberships for select to authenticated using (public.vc_role(workspace_id) is not null);
create policy vc_numbers_read on public.vc_numbers for select to authenticated using (public.vc_role(workspace_id) is not null);
revoke all on public.vc_workspaces, public.vc_memberships, public.vc_numbers, public.vc_invitations, public.vc_action_limits from anon, authenticated;
grant select on public.vc_workspaces, public.vc_memberships, public.vc_numbers to authenticated;

create function public.vc_create_workspace(workspace_name text) returns public.vc_workspaces
language plpgsql security definer set search_path = '' as $$
declare result public.vc_workspaces;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if (select count(*) from public.vc_memberships where user_id=auth.uid() and role='owner') >= 10 then raise exception 'Workspace limit reached'; end if;
  insert into public.vc_workspaces(name) values (trim(workspace_name)) returning * into result;
  insert into public.vc_memberships values (result.id,auth.uid(),'owner',now());
  return result;
end $$;
create function public.vc_create_number(target uuid, number_label text) returns public.vc_numbers
language plpgsql security definer set search_path = '' as $$
declare result public.vc_numbers; number_id uuid := gen_random_uuid();
begin
  if coalesce(public.vc_role(target),'') not in ('owner','admin') then raise exception 'Admin access required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text,0));
  if (select count(*) from public.vc_numbers where workspace_id=target) >= 20 then raise exception 'Number limit reached'; end if;
  insert into public.vc_numbers(id,workspace_id,label,instance_name) values (number_id,target,trim(number_label),'vc_' || replace(number_id::text,'-','')) returning * into result;
  return result;
end $$;
create function public.vc_team(target uuid) returns table(user_id uuid,email text,role text,joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.vc_role(target) is null then raise exception 'Workspace access denied'; end if;
  return query select m.user_id,u.email::text,m.role,m.joined_at from public.vc_memberships m join auth.users u on u.id=m.user_id where m.workspace_id=target order by m.joined_at;
end $$;
create function public.vc_invite(target uuid, invite_email text, invite_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare token uuid;
begin
  if coalesce(public.vc_role(target),'') not in ('owner','admin') then raise exception 'Admin access required'; end if;
  if invite_role not in ('admin','member') or invite_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(invite_email)>254 then raise exception 'Invalid invitation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text,1));
  if (select count(*) from public.vc_invitations where workspace_id=target and created_at>now()-interval '1 day')>=20 then raise exception 'Daily invitation limit reached'; end if;
  insert into public.vc_invitations(workspace_id,email,role) values(target,lower(trim(invite_email)),invite_role) returning id into token;
  return token;
end $$;
create function public.vc_accept_invite(token uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare invitation public.vc_invitations; user_email text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select lower(email) into user_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  select * into invitation from public.vc_invitations where id=token for update;
  if invitation.id is null or invitation.expires_at<now() or invitation.accepted_at is not null or user_email is null or invitation.email<>user_email then raise exception 'Invitation unavailable or email does not match'; end if;
  insert into public.vc_memberships(workspace_id,user_id,role) values(invitation.workspace_id,auth.uid(),invitation.role) on conflict do nothing;
  update public.vc_invitations set accepted_at=now() where id=token;
  return invitation.workspace_id;
end $$;
create function public.vc_remove_member(target uuid, member_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.vc_role(target),'')<>'owner' then raise exception 'Owner access required'; end if;
  if exists(select 1 from public.vc_memberships where workspace_id=target and user_id=member_id and role='owner') then raise exception 'Cannot remove workspace owner'; end if;
  delete from public.vc_memberships where workspace_id=target and user_id=member_id and role<>'owner';
end $$;
-- Shared per-workspace limits remain effective across Vercel serverless instances.
create function public.vc_consume_action(target uuid, action_name text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare count_now integer;
begin
  if public.vc_role(target) is null then raise exception 'Workspace access denied'; end if;
  if action_name not in ('send','connect') then raise exception 'Invalid action'; end if;
  insert into public.vc_action_limits as a(workspace_id,action,window_start,hits) values(target,action_name,date_trunc('minute',now()),1)
  on conflict(workspace_id,action) do update set
    hits=case when a.window_start<date_trunc('minute',now()) then 1 else a.hits+1 end,
    window_start=date_trunc('minute',now()) returning hits into count_now;
  return count_now<=case when action_name='send' then 30 else 10 end;
end $$;
-- Functions are not executable anonymously (Postgres grants PUBLIC by default).
revoke all on function public.vc_role(uuid), public.vc_create_workspace(text), public.vc_create_number(uuid,text), public.vc_team(uuid), public.vc_invite(uuid,text,text), public.vc_accept_invite(uuid), public.vc_remove_member(uuid,uuid), public.vc_consume_action(uuid,text) from public, anon;
grant execute on function public.vc_role(uuid), public.vc_create_workspace(text), public.vc_create_number(uuid,text), public.vc_team(uuid), public.vc_invite(uuid,text,text), public.vc_accept_invite(uuid), public.vc_remove_member(uuid,uuid), public.vc_consume_action(uuid,text) to authenticated;
