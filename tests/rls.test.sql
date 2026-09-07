\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values
('11111111-1111-4111-8111-111111111111','owner1@example.com',now()),
('22222222-2222-4222-8222-222222222222','owner2@example.com',now()),
('33333333-3333-4333-8333-333333333333','member@example.com',now());
create temporary table fixture(k text primary key,v uuid);
grant all on fixture to authenticated;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into fixture select 'workspace1',(public.vc_create_workspace('Tenant One')).id;
insert into fixture select 'number1',(public.vc_create_number((select v from fixture where k='workspace1'),'Support')).id;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
insert into fixture select 'workspace2',(public.vc_create_workspace('Tenant Two')).id;
insert into fixture select 'number2',(public.vc_create_number((select v from fixture where k='workspace2'),'Sales')).id;
select pg_temp.assert_true((select count(*)=1 from public.vc_workspaces),'workspace rows are tenant-scoped');
select pg_temp.assert_true((select count(*)=1 from public.vc_numbers),'number rows are tenant-scoped');
select pg_temp.assert_true((select count(*)=0 from public.vc_numbers where id=(select v from fixture where k='number1')),'guessed number ID cannot cross tenants');
do $$ begin
 begin perform public.vc_create_number((select v from fixture where k='workspace1'),'Intruder'); raise exception 'cross-tenant RPC unexpectedly succeeded'; exception when raise_exception then if sqlerrm <> 'Admin access required' then raise; end if; end;
 begin update public.vc_memberships set role='owner'; raise exception 'direct role update unexpectedly succeeded'; exception when insufficient_privilege then null; end;
 begin insert into public.vc_numbers(workspace_id,label,instance_name) values((select v from fixture where k='workspace2'),'Forged','global-instance'); raise exception 'provider mapping injection unexpectedly succeeded'; exception when insufficient_privilege then null; end;
 begin perform public.vc_team((select v from fixture where k='workspace1')); raise exception 'cross-tenant team read unexpectedly succeeded'; exception when raise_exception then if sqlerrm <> 'Workspace access denied' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into fixture select 'invite',public.vc_invite((select v from fixture where k='workspace1'),'member@example.com','member');
do $$ begin
 begin perform public.vc_invite((select v from fixture where k='workspace1'),'member@example.com','owner'); raise exception 'owner invitation unexpectedly succeeded'; exception when raise_exception then if sqlerrm <> 'Invalid invitation' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 begin perform public.vc_accept_invite((select v from fixture where k='invite')); raise exception 'wrong-email acceptance unexpectedly succeeded'; exception when raise_exception then if sqlerrm <> 'Invitation unavailable or email does not match' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select public.vc_accept_invite((select v from fixture where k='invite'));
select pg_temp.assert_true(public.vc_role((select v from fixture where k='workspace1'))='member','invitation grants exactly the intended role');
do $$ begin
 begin perform public.vc_create_number((select v from fixture where k='workspace1'),'Forbidden'); raise exception 'member managed number unexpectedly'; exception when raise_exception then if sqlerrm <> 'Admin access required' then raise; end if; end;
 begin perform public.vc_accept_invite((select v from fixture where k='invite')); raise exception 'invitation replay unexpectedly succeeded'; exception when raise_exception then if sqlerrm <> 'Invitation unavailable or email does not match' then raise; end if; end;
end $$;
select pg_temp.assert_true((select bool_and(public.vc_consume_action((select v from fixture where k='workspace1'),'send')) from generate_series(1,30)),'first 30 sends within rate budget');
select pg_temp.assert_true(not public.vc_consume_action((select v from fixture where k='workspace1'),'send'),'31st send rate limited');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.vc_remove_member((select v from fixture where k='workspace1'),'33333333-3333-4333-8333-333333333333');
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select pg_temp.assert_true((select count(*)=0 from public.vc_numbers),'removed member immediately loses number access');
select pg_temp.assert_true(not has_function_privilege('anon','public.vc_create_workspace(text)','execute'),'anonymous users cannot create workspaces');
select pg_temp.assert_true(not has_function_privilege('anon','public.vc_invite(uuid,text,text)','execute'),'anonymous users cannot create invitations');
rollback;
