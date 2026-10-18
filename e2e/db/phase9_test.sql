-- Phase 9 database behaviour test (billing, service requests, surveys). Run with: bash e2e/db/run.sh e2e/db/phase9_test.sql
begin;
create temp table t_res(n serial, k text, v text); grant insert, select on t_res to authenticated; grant usage on sequence t_res_n_seq to authenticated;
set local role authenticated;
-- management adds a bill due in 2 days for LakeWalker's unit
select null from set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d0001","role":"authenticated"}', true);
select null from set_config('t.bill', public.save_bill(null, (select unit_id from public.profiles_private where user_id = '00000000-0000-0000-0000-0000000d0011'), 'Maintenance fee', 'Oct-Dec 2026 (test)', 450, (now() at time zone 'Asia/Kuala_Lumpur')::date + 2, 'INV-T1', null)::text, true);
select null from set_config('t.bill2', public.save_bill(null, (select unit_id from public.profiles_private where user_id = '00000000-0000-0000-0000-0000000d0011'), 'water', 'Sep 2026 (test)', 38.5, (now() at time zone 'Asia/Kuala_Lumpur')::date - 3, null, null)::text, true);
insert into t_res(k,v) select 'admin_bills', string_agg(state||':'||amount, ',' order by amount) from public.admin_bills('all', null);
insert into t_res(k,v) select 'import_preview', (public.import_bills(('[{"unit":"' || (select label from public.units u join public.profiles_private pp on pp.unit_id = u.id where pp.user_id = '00000000-0000-0000-0000-0000000d0011') || '","type":"sinking fund","period":"Q4 2026","amount":"45.00","due_date":"2026-12-31"},{"unit":"No such unit","type":"xyz","period":"","amount":"-1","due_date":"31/12/2026"}]')::jsonb, false))::text;
insert into t_res(k,v) select 'import_commit_blocked', (public.import_bills('[{"unit":"No such unit","type":"water","period":"x","amount":"1","due_date":"2026-12-31"}]'::jsonb, true))->>'inserted';
-- owner LakeWalker
select null from set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d0011","role":"authenticated"}', true);
insert into t_res(k,v) select 'owner_my_bills', string_agg(state||':'||kind, ',' order by kind) from public.my_bills();
insert into t_res(k,v) select 'owner_billing_notices', count(*)::text from public.notifications where kind = 'billing' and user_id = auth.uid();
insert into t_res(k,v) select 'owner_tick_again_same', (select count(*) from (select public.bill_reminders_tick()) x)::text || '/' || (select count(*) from public.notifications where kind='billing' and user_id = auth.uid())::text;
select public.set_bill_reminder(current_setting('t.bill')::uuid, false);
insert into t_res(k,v) select 'owner_toggle', reminders_on::text from public.my_bills() where id = current_setting('t.bill')::uuid;
-- sub-owner NasiLemak (same unit): no billing
select null from set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d0013","role":"authenticated"}', true);
insert into t_res(k,v) select 'subowner_table_rows', count(*)::text from public.billing_reminders;
do $$ begin perform * from public.my_bills(); insert into t_res(k,v) values ('subowner_my_bills', 'ALLOWED (bad)');
exception when others then insert into t_res(k,v) values ('subowner_my_bills', 'refused: ' || sqlerrm); end $$;
-- other owner KopiKaki: no rows from another unit
select null from set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d0012","role":"authenticated"}', true);
insert into t_res(k,v) select 'other_owner_rows', count(*)::text from public.billing_reminders;
do $$ begin perform public.mark_bill_paid(current_setting('t.bill')::uuid, null); insert into t_res(k,v) values ('owner_mark_paid', 'ALLOWED (bad)');
exception when others then insert into t_res(k,v) values ('owner_mark_paid', 'refused: ' || sqlerrm); end $$;
-- management marks paid, voids, audit
select null from set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d0001","role":"authenticated"}', true);
select public.mark_bill_paid(current_setting('t.bill')::uuid, (now() at time zone 'Asia/Kuala_Lumpur')::date);
select public.void_bill(current_setting('t.bill2')::uuid, 'Entered twice');
insert into t_res(k,v) select 'after_paid_void', string_agg(state, ',' order by state) from public.admin_bills('all', null);
insert into t_res(k,v) select 'audit_bills', string_agg(action, ',' order by id) from public.audit_log where target_table = 'billing_reminders' and at > now() - interval '1 minute';

-- service requests: sub-owner creates, owner sees it, other owner doesn't
select null from set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d0013","role":"authenticated"}', true);
select null from set_config('t.sr', (public.create_service_request('service', (select id from public.service_categories where name = 'Maintenance request'), 'Kitchen tap is dripping all night (test)', null, null, 'app', '{}'))->>'id', true);
select null from set_config('t.sr2', (public.create_service_request('enquiry', (select id from public.service_categories where name = 'General enquiry'), 'When is the next pest fogging? (test)', (now() at time zone 'Asia/Kuala_Lumpur')::date + 3, 'morning', 'phone', '{}'))->>'id', true);
select null from set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d0011","role":"authenticated"}', true);
insert into t_res(k,v) select 'owner_sees_unit_requests', count(*)::text from public.my_service_requests() where description like '%(test)';
select null from set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d0012","role":"authenticated"}', true);
insert into t_res(k,v) select 'other_owner_requests', count(*)::text from public.service_requests where description like '%(test)';
-- management: acknowledge sr, then requester cancels (allowed); assign sr2 then requester cancel refused
select null from set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d0001","role":"authenticated"}', true);
select public.update_service_request(current_setting('t.sr')::uuid, 'acknowledged', 'We have seen this', null);
do $$ begin perform public.update_service_request(current_setting('t.sr2')::uuid, 'assigned', null, null); insert into t_res(k,v) values ('assign_without_handler', 'ALLOWED (bad)');
exception when others then insert into t_res(k,v) values ('assign_without_handler', 'refused: ' || sqlerrm); end $$;
select public.update_service_request(current_setting('t.sr2')::uuid, 'assigned', 'Security desk will reply', '00000000-0000-0000-0000-0000000d0002');
select public.add_service_note(current_setting('t.sr2')::uuid, 'internal: check fogging roster');
insert into t_res(k,v) select 'queue', string_agg(status||'/'||coalesce(handler,'-'), ',' order by ref_no) from public.service_queue('all', null, null) where description like '%(test)';
select null from set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d0013","role":"authenticated"}', true);
select public.cancel_service_request(current_setting('t.sr')::uuid);
do $$ begin perform public.cancel_service_request(current_setting('t.sr2')::uuid); insert into t_res(k,v) values ('cancel_after_assigned', 'ALLOWED (bad)');
exception when others then insert into t_res(k,v) values ('cancel_after_assigned', 'refused: ' || sqlerrm); end $$;
insert into t_res(k,v) select 'detail_sr', (select string_agg(x->>'status', '>') from jsonb_array_elements(public.service_request_detail(current_setting('t.sr')::uuid)->'history') x);
insert into t_res(k,v) select 'detail_sr2_resident', (public.service_request_detail(current_setting('t.sr2')::uuid) ? 'notes')::text || ' handler=' || (public.service_request_detail(current_setting('t.sr2')::uuid)->'handler'->>'nickname');
insert into t_res(k,v) select 'resident_notes_table', count(*)::text from public.service_request_notes;
insert into t_res(k,v) select 'resident_service_notices', string_agg(title, ' | ') from public.notifications where user_id = auth.uid() and kind = 'service' and created_at > now() - interval '1 minute';
select null from set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d0001","role":"authenticated"}', true);
select public.update_service_request(current_setting('t.sr2')::uuid, 'completed', 'Fogging is every 2nd Tuesday (test)', null);
do $$ begin perform public.update_service_request(current_setting('t.sr2')::uuid, 'in_progress', null, null); insert into t_res(k,v) values ('reopen_completed', 'ALLOWED (bad)');
exception when others then insert into t_res(k,v) values ('reopen_completed', 'refused: ' || sqlerrm); end $$;
select null from set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d0013","role":"authenticated"}', true);
select public.rate_service_request(current_setting('t.sr2')::uuid, 5, 'Quick answer');
insert into t_res(k,v) select 'rated', rating::text from public.service_requests where id = current_setting('t.sr2')::uuid;

-- surveys and FAQ
select null from set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d0001","role":"authenticated"}', true);
select null from set_config('t.sv', public.save_survey(null, 'Test survey', 'Two questions', '[{"kind":"rating","prompt":"How safe do you feel?"},{"kind":"choice","prompt":"Best time for events?","options":["Weekday evening","Weekend morning"]},{"kind":"text","prompt":"Anything else?","required":false}]'::jsonb)::text, true);
select public.set_survey_status(current_setting('t.sv')::uuid, 'open');
select null from set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d0013","role":"authenticated"}', true);
insert into t_res(k,v) select 'open_surveys', string_agg(title||':'||answered, ',') from public.open_surveys() where title = 'Test survey';
select public.submit_survey(current_setting('t.sv')::uuid, (select jsonb_agg(jsonb_build_object('question_id', id, 'rating', 4, 'choice', 'Weekend morning', 'text', 'More lights')) from public.survey_questions where survey_id = current_setting('t.sv')::uuid));
do $$ begin perform public.submit_survey(current_setting('t.sv')::uuid, '[]'); insert into t_res(k,v) values ('answer_twice', 'ALLOWED (bad)');
exception when others then insert into t_res(k,v) values ('answer_twice', 'refused: ' || sqlerrm); end $$;
insert into t_res(k,v) select 'resident_reads_answers', count(*)::text from public.survey_answers;
insert into t_res(k,v) select 'faqs_visible', count(*)::text from public.faqs;
select null from set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d0001","role":"authenticated"}', true);
insert into t_res(k,v) select 'survey_results', public.survey_results(current_setting('t.sv')::uuid)::text;
insert into t_res(k,v) select 'language_values', string_agg(distinct language, ',') from public.profiles;
reset role;
select k, v from t_res order by n;
rollback;
