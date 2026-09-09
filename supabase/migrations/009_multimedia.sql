-- Private, tenant-scoped media uploads for direct messages and campaigns.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('vc-media','vc-media',false,16777216,array[
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/quicktime',
  'audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm',
  'application/pdf','text/plain','text/csv',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy vc_media_read on storage.objects for select to authenticated
using(bucket_id='vc-media' and public.vc_role(((storage.foldername(name))[1])::uuid) is not null);
create policy vc_media_upload on storage.objects for insert to authenticated
with check(bucket_id='vc-media' and public.vc_role(((storage.foldername(name))[1])::uuid) is not null);
create policy vc_media_delete on storage.objects for delete to authenticated
using(bucket_id='vc-media' and coalesce(public.vc_role(((storage.foldername(name))[1])::uuid),'') in('owner','admin'));

alter table public.vc_campaigns add column media_url text check(media_url is null or char_length(media_url)<=2048);
alter table public.vc_campaigns add column media_type text check(media_type is null or media_type in('image','video','audio','document'));
alter table public.vc_campaigns add column media_mime_type text check(media_mime_type is null or char_length(media_mime_type)<=120);
alter table public.vc_campaigns add column media_file_name text check(media_file_name is null or char_length(media_file_name)<=180);

create function public.vc_create_media_campaign(target uuid,source_number uuid,campaign_name text,campaign_message text,send_at timestamptz,recipients jsonb,attachment_url text,attachment_type text,attachment_mime text,attachment_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if attachment_type not in('image','video','audio','document') or char_length(attachment_url) not between 20 and 2048 or char_length(attachment_mime) not between 3 and 120 or char_length(attachment_name) not between 1 and 180 then raise exception 'Invalid attachment'; end if;
  result:=public.vc_create_campaign(target,source_number,campaign_name,coalesce(nullif(trim(campaign_message),''),attachment_name),send_at,recipients);
  update public.vc_campaigns set media_url=attachment_url,media_type=attachment_type,media_mime_type=attachment_mime,media_file_name=attachment_name where id=result;
  return result;
end $$;
revoke all on function public.vc_create_media_campaign(uuid,uuid,text,text,timestamptz,jsonb,text,text,text,text) from public,anon;
grant execute on function public.vc_create_media_campaign(uuid,uuid,text,text,timestamptz,jsonb,text,text,text,text) to authenticated;
