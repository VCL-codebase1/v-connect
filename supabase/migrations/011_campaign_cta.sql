alter table public.vc_campaigns add column cta jsonb check (cta is null or (jsonb_typeof(cta)='object' and jsonb_array_length(coalesce(cta->'buttons','[]'::jsonb)) between 1 and 3));

create or replace function public.vc_set_campaign_cta(target uuid,campaign uuid,config jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(public.vc_role(target),'') not in ('owner','admin') then raise exception 'Admin access required'; end if;
  if config is not null and (jsonb_typeof(config)<>'object' or jsonb_array_length(coalesce(config->'buttons','[]'::jsonb)) not between 1 and 3) then raise exception 'Invalid CTA'; end if;
  update public.vc_campaigns set cta=config where id=campaign and workspace_id=target;
  if not found then raise exception 'Campaign not found'; end if;
end $$;
revoke all on function public.vc_set_campaign_cta(uuid,uuid,jsonb) from public,anon;
grant execute on function public.vc_set_campaign_cta(uuid,uuid,jsonb) to authenticated;
