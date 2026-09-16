-- Safe broadcast pacing and recovery after provider restrictions/disconnects.
alter table public.vc_campaigns add column pause_reason text check (pause_reason is null or char_length(pause_reason) <= 240);

create or replace function public.vc_retry_failed_campaign(target uuid,campaign uuid) returns void
language plpgsql security definer set search_path='' as $$
declare current_status text;
begin
  if coalesce(public.vc_role(target),'') not in ('owner','admin') then raise exception 'Admin access required'; end if;
  select status into current_status from public.vc_campaigns where id=campaign and workspace_id=target for update;
  if current_status is null then raise exception 'Campaign not found'; end if;
  if current_status not in ('completed','failed','paused') then raise exception 'Retry is available after the campaign stops'; end if;
  update public.vc_campaign_recipients set status='queued',attempts=0,error_code=null,locked_at=null,worker_id=null where campaign_id=campaign and status='failed';
  if not found then raise exception 'There are no failed recipients to retry'; end if;
  update public.vc_campaigns set status='queued',pause_reason=null,completed_at=null,queued_count=(select count(*) from public.vc_campaign_recipients where campaign_id=campaign and status='queued'),failed_count=0 where id=campaign;
end $$;

create or replace function public.vc_campaign_action(target uuid,campaign uuid,next_action text) returns void
language plpgsql security definer set search_path='' as $$
declare current_status text;
begin
  if coalesce(public.vc_role(target),'') not in ('owner','admin') then raise exception 'Admin access required'; end if;
  select status into current_status from public.vc_campaigns where id=campaign and workspace_id=target for update;
  if current_status is null then raise exception 'Campaign not found'; end if;
  if next_action='pause' and current_status in('scheduled','queued','sending') then update public.vc_campaigns set status='paused',pause_reason='Paused by a workspace admin.' where id=campaign;
  elsif next_action='resume' and current_status='paused' then update public.vc_campaigns set status=case when scheduled_for>now() then 'scheduled' else 'queued' end,pause_reason=null where id=campaign;
  elsif next_action='cancel' and current_status in('scheduled','queued','sending','paused') then
    update public.vc_campaigns set status='cancelled',completed_at=now() where id=campaign;
    update public.vc_campaign_recipients set status='cancelled' where campaign_id=campaign and status='queued';
  else raise exception 'Campaign action is not available'; end if;
end $$;

revoke all on function public.vc_retry_failed_campaign(uuid,uuid) from public,anon;
grant execute on function public.vc_retry_failed_campaign(uuid,uuid) to authenticated;
revoke all on function public.vc_campaign_action(uuid,uuid,text) from public,anon;
grant execute on function public.vc_campaign_action(uuid,uuid,text) to authenticated;
