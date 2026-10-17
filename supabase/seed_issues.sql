-- Jiran demo issues · re-runnable. Placeholder reports (is_demo = true), not real complaints.
with src(n, reporter, cat, descr, lat, lng, st, votes, days, team, anon) as (values
 (1,  'd0012', 'drain_flood', 'Blocked drain along Persiaran Metafasa overflows onto the road every time it rains. Water reaches the pavement.', 3.1702, 101.4993, 'acknowledged', 9, 6.0, null, false),
 (2,  'd0011', 'streetlight', 'Three street lights out near the Elmina Green 4 playground. Very dark at night for kids walking home.', 3.2043, 101.4893, 'assigned', 7, 4.0, 'Street lighting team', false),
 (3,  'd0014', 'road', 'Deep pothole at the Denai Alam roundabout exit. Motorcyclists swerve to avoid it.', 3.1552, 101.5025, 'in_progress', 12, 9.0, 'Roads team', false),
 (4,  'd0013', 'waste', 'Construction debris dumped next to the Elmina Green 1 back lane.', 3.2050, 101.4880, 'submitted', 3, 1.0, null, false),
 (5,  'd0012', 'pest', 'Stagnant water in the empty lot behind Elmina Valley 3, lots of mosquitoes. Worried about aedes and dengue.', 3.1710, 101.4980, 'acknowledged', 6, 3.0, null, false),
 (6,  'd0014', 'tree', 'Large branch hanging over the jogging track in Elmina Central Park after last night''s storm.', 3.1792, 101.5035, 'submitted', 4, 0.5, null, false),
 (7,  'd0011', 'park', 'Swing seat broken at Elmina Green 4 Neighbourhood Park.', 3.2038, 101.4897, 'resolved', 5, 20.0, 'Landscape team', false),
 (8,  'd0012', 'water', 'Low water pressure in Elmina Valley 4 every evening between 7 pm and 10 pm.', 3.1695, 101.4975, 'assigned', 8, 7.0, 'Water utility liaison', false),
 (9,  'd0014', 'security', 'Broken perimeter fence near Denai Alam Pond A. People cut through at night.', 3.1560, 101.5010, 'acknowledged', 5, 5.0, null, true),
 (10, 'd0013', 'noise', 'Loud karaoke from the shop lots until 2 am on weekends.', 3.1845, 101.4985, 'rejected', 1, 15.0, null, false),
 (11, 'd0011', 'road', 'Faded zebra crossing outside SJKC Ladang Regent Elmina. Cars don''t stop for school children.', 3.1850, 101.4970, 'submitted', 10, 2.0, null, false),
 (12, 'd0012', 'drain_flood', 'Drain cover missing on Jalan Metafasa U16/3. Someone could fall in.', 3.1690, 101.5005, 'in_progress', 6, 8.0, 'Drainage team', false),
 (13, 'd0014', 'electrical', 'Exposed wires hanging from a lamp post at Bukit Subang. Sparks seen when it rains.', 3.1482, 101.5112, 'assigned', 9, 1.0, 'Electrical contractor', false),
 (14, 'd0013', 'waste', 'Overflowing rubbish bins at the Elmina Lakeside Mall bus stop.', 3.1838, 101.4995, 'resolved', 3, 12.0, 'Cleaning team', false),
 (15, 'd0011', 'park', 'Broken lights at the Elmina Green 4 basketball court.', 3.2045, 101.4900, 'submitted', 2, 1.0, null, false),
 (16, 'd0012', 'other', 'Sales signboard blocking the view at a junction near Elmina East.', 3.1950, 101.5150, 'submitted', 1, 3.0, null, false),
 (17, 'd0014', 'road', 'Uneven pavement on the walkway to Elmina Central Park. An elderly neighbour tripped last week.', 3.1785, 101.5025, 'acknowledged', 4, 4.0, null, false),
 (18, 'd0011', 'pest', 'Wasp nest in a tree beside the Elmina Green 1 playground.', 3.2052, 101.4886, 'resolved', 2, 10.0, 'Pest control', false),
 (19, 'd0013', 'streetlight', 'Flickering street light on Persiaran Shorea.', 3.2060, 101.4900, 'submitted', 0, 0.2, null, false),
 (20, 'd0012', 'tree', 'Tree roots lifting the drain cover near the Elmina Valley 3 basketball court.', 3.1705, 101.4985, 'submitted', 2, 2.0, null, false)
), ins as (
  insert into public.issues (id, township_id, ref_no, reporter_id, anonymous, category, description, lat, lng,
                             status, upvote_count, assigned_team, created_at, updated_at, resolved_at, is_demo)
  select md5('issue-' || n)::uuid, '00000000-0000-0000-0000-00000000e100', 'pending',
         ('00000000-0000-0000-0000-0000000' || reporter)::uuid, anon, cat, descr, lat, lng,
         st::public.issue_status, votes, team,
         now() - make_interval(secs => days * 86400), now() - make_interval(secs => days * 86400 / 3),
         case when st = 'resolved' then now() - make_interval(secs => days * 86400 / 5) end, true
    from src
  on conflict (id) do nothing
  returning id, status, created_at
)
-- Status history: one row per step reached, spread across the issue's age
insert into public.issue_status_history (issue_id, status, note, team, actor_id, created_at)
select ins.id, step.s::public.issue_status,
       case step.s when 'acknowledged' then 'Seen by township management'
                   when 'assigned' then 'Passed to the responsible team'
                   when 'in_progress' then 'Work started on site'
                   when 'resolved' then 'Repair completed'
                   when 'rejected' then 'Outside township management''s remit: referred to the local council' end,
       case when step.s in ('assigned', 'in_progress', 'resolved') then (select assigned_team from public.issues where id = ins.id) end,
       '00000000-0000-0000-0000-0000000d0001',
       ins.created_at + (now() - ins.created_at) * step.ord / 6.0
  from ins
  cross join lateral (values (1, 'acknowledged'), (2, 'assigned'), (3, 'in_progress'), (4, 'resolved')) step(ord, s)
 where (ins.status = 'acknowledged' and step.ord <= 1)
    or (ins.status = 'assigned' and step.ord <= 2)
    or (ins.status = 'in_progress' and step.ord <= 3)
    or (ins.status = 'resolved' and step.ord <= 4);

-- Rejected issue gets its single closing step
insert into public.issue_status_history (issue_id, status, note, actor_id, created_at)
select id, 'rejected', 'Outside township management''s remit: referred to the local council',
       '00000000-0000-0000-0000-0000000d0001', created_at + interval '1 day'
  from public.issues i
 where i.is_demo and i.status = 'rejected'
   and not exists (select 1 from public.issue_status_history h where h.issue_id = i.id and h.status = 'rejected');

-- The "Report received" rows written by the insert trigger take the report time
update public.issue_status_history h set created_at = i.created_at
  from public.issues i
 where h.issue_id = i.id and i.is_demo and h.status = 'submitted' and h.created_at > i.created_at;

-- A few real votes so "I voted" shows for demo residents (counts above already include them)
insert into public.issue_votes (issue_id, user_id)
select md5('issue-' || n)::uuid, ('00000000-0000-0000-0000-0000000' || u)::uuid
  from (values (1, 'd0014'), (3, 'd0012'), (11, 'd0014'), (13, 'd0012'), (2, 'd0013')) v(n, u)
on conflict do nothing;
-- the vote trigger added +1 to each; take it back so counts stay as seeded
update public.issues set upvote_count = upvote_count - 1
 where id in (select md5('issue-' || n)::uuid from (values (1), (3), (11), (13), (2)) x(n))
   and is_demo and upvote_count > 0
   and exists (select 1 from public.app_config where key = 'seed_votes_adjusted') is false;
insert into public.app_config (key, value, description)
values ('seed_votes_adjusted', 'true', 'Internal: demo vote counts already adjusted') on conflict do nothing;

-- Comments
insert into public.issue_comments (id, issue_id, author_id, body, created_at)
values
 (md5('c-1')::uuid, md5('issue-1')::uuid, '00000000-0000-0000-0000-0000000d0014', 'Same at my end of the road. It was ankle deep on Tuesday.', now() - interval '5 days'),
 (md5('c-2')::uuid, md5('issue-1')::uuid, '00000000-0000-0000-0000-0000000d0001', 'Thanks for reporting. The drainage team will inspect this week.', now() - interval '4 days'),
 (md5('c-3')::uuid, md5('issue-3')::uuid, '00000000-0000-0000-0000-0000000d0012', 'Nearly came off my scooter here this morning. Please fix soon.', now() - interval '6 days')
on conflict (id) do nothing;

-- Feedback on one resolved issue
insert into public.issue_feedback (issue_id, user_id, fixed, rating, comment, created_at)
values (md5('issue-14')::uuid, '00000000-0000-0000-0000-0000000d0013', true, 4, 'Bins emptied and a bigger one added. Thanks.', now() - interval '2 days')
on conflict do nothing;

-- Refresh stored priority snapshots
select public.refresh_issue_priority(id) from public.issues where is_demo;
