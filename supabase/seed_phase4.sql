-- Jiran phase 4 demo content · re-runnable (upserts on fixed IDs; times are relative to now()).
-- Every row is a labelled placeholder ("demo"), not a real announcement, event or post.
-- Run again on demo day so the "happening now" event is open for check-in.

-- Fixed people (from seed.sql)
--   d0001 TownshipTeam (management) · d0011 LakeWalker (Elmina Green) · d0012 KopiKaki (Elmina Valley)
--   d0013 NasiLemakFan (Elmina Green, sub-owner) · d0014 CyclingAuntie (Denai Alam)

-- ---------------------------------------------------------------- Announcements
insert into public.announcements (id, township_id, category, source_label, title, body, target_kind, target_area_ids,
                                  lat, lng, pinned, publish_at, starts_at, ends_at, created_by, is_demo, notified_at)
values
 (md5('ann-1')::uuid, '00000000-0000-0000-0000-00000000e100', 'safety', 'Township management (demo)',
  'Lock car doors and gates at night',
  E'A friendly reminder to lock car doors and house gates before bed, and to keep valuables out of sight in parked cars.\n\nSee something suspicious? Use SOS in Jiran or call 999.\n\n(Demo notice for the hackathon prototype, not a real announcement.)',
  'township', '{}', null, null, true, now() - interval '2 days', null, now() + interval '12 days',
  '00000000-0000-0000-0000-0000000d0001', true, now() - interval '2 days'),
 (md5('ann-2')::uuid, '00000000-0000-0000-0000-00000000e100', 'maintenance', 'Township management (demo)',
  'Drain cleaning in Elmina Valley',
  E'Contractors will clear the roadside drains in Elmina Valley. Please avoid parking along the drains on the day.\n\n(Demo notice for the hackathon prototype, not a real schedule.)',
  'areas', array['00000000-0000-0000-0000-0000000a0006']::uuid[], 3.1700, 101.4990, false,
  now() - interval '1 day', date_trunc('day', now()) + interval '5 days' + interval '1 hour',
  date_trunc('day', now()) + interval '5 days' + interval '9 hours', '00000000-0000-0000-0000-0000000d0001', true, now() - interval '1 day'),
 (md5('ann-3')::uuid, '00000000-0000-0000-0000-00000000e100', 'general', 'Township management (demo)',
  'Welcome to Jiran',
  E'Jiran is the new way to report problems, follow their progress and stay in touch with neighbours in City of Elmina.\n\nReport an issue from the + button, upvote the ones that affect you too, and watch the queue move.\n\n(Demo notice for the hackathon prototype.)',
  'township', '{}', null, null, false, now() - interval '5 days', null, null,
  '00000000-0000-0000-0000-0000000d0001', true, now() - interval '5 days'),
 (md5('ann-4')::uuid, '00000000-0000-0000-0000-00000000e100', 'event', 'Township management (demo)',
  'Join the gotong-royong this weekend',
  E'Neighbours are clearing the drains and green verges together. Gloves and water provided. Details and RSVP are in Events.\n\n(Demo notice for the hackathon prototype.)',
  'areas', array['00000000-0000-0000-0000-0000000a0006', '00000000-0000-0000-0000-0000000a0002']::uuid[], null, null, false,
  now() - interval '6 hours', null, null, '00000000-0000-0000-0000-0000000d0001', true, now() - interval '6 hours')
on conflict (id) do update set
  title = excluded.title, body = excluded.body, publish_at = excluded.publish_at, starts_at = excluded.starts_at,
  ends_at = excluded.ends_at, withdrawn_at = null, pinned = excluded.pinned;

-- ---------------------------------------------------------------- Area follows
insert into public.area_follows (user_id, area_id) values
 ('00000000-0000-0000-0000-0000000d0012', '00000000-0000-0000-0000-0000000a0008')
on conflict do nothing;

-- ---------------------------------------------------------------- Events
insert into public.events (id, township_id, title, description, kind, host_id, starts_at, ends_at, location_name,
                           lat, lng, area_id, capacity, approval_state, decided_by, decided_at, is_demo)
values
 (md5('event-1')::uuid, '00000000-0000-0000-0000-00000000e100', 'Gotong-royong drain clean-up (demo)',
  E'Let''s clear the drains and verges around the basketball court together before the rainy season.\nGloves, bags and water provided. Wear closed shoes.',
  'official', '00000000-0000-0000-0000-0000000d0001',
  date_trunc('day', now()) + interval '4 days' + interval '0 hours 30 minutes',   -- 08:30 MYT
  date_trunc('day', now()) + interval '4 days' + interval '3 hours 30 minutes',
  'Elmina Valley 3 basketball court', 3.1705, 101.4985, '00000000-0000-0000-0000-0000000a0006', 40,
  'approved', '00000000-0000-0000-0000-0000000d0001', now() - interval '3 days', true),
 (md5('event-2')::uuid, '00000000-0000-0000-0000-00000000e100', 'Sunday morning walk at Central Park (demo)',
  E'An easy 3 km walk around the park at walking pace. All ages welcome, strollers too. We meet at the main entrance.',
  'community', '00000000-0000-0000-0000-0000000d0014',
  date_trunc('day', now()) + interval '6 days' - interval '1 hour',              -- 07:00 MYT
  date_trunc('day', now()) + interval '6 days' + interval '30 minutes',
  'Elmina Central Park, main entrance', 3.1790, 101.5030, '00000000-0000-0000-0000-0000000a0008', null,
  'approved', '00000000-0000-0000-0000-0000000d0001', now() - interval '2 days', true),
 (md5('event-3')::uuid, '00000000-0000-0000-0000-00000000e100', 'Kids'' board-game afternoon (demo)',
  E'Bring a board game or card game to share. For children aged 6 to 12 with a parent.',
  'community', '00000000-0000-0000-0000-0000000d0011',
  date_trunc('day', now()) + interval '9 days' + interval '7 hours',             -- 15:00 MYT
  date_trunc('day', now()) + interval '9 days' + interval '9 hours',
  'Elmina Green 4 neighbourhood park', 3.2038, 101.4897, '00000000-0000-0000-0000-0000000a0005', 20,
  'pending', null, null, true),
 (md5('event-4')::uuid, '00000000-0000-0000-0000-00000000e100', 'Neighbourhood potluck (demo)',
  E'Bring one dish to share. Plates and drinks provided.',
  'community', '00000000-0000-0000-0000-0000000d0012',
  date_trunc('day', now()) - interval '10 days' + interval '10 hours',
  date_trunc('day', now()) - interval '10 days' + interval '13 hours',
  'Elmina Valley 3 community area', 3.1708, 101.4990, '00000000-0000-0000-0000-0000000a0006', 30,
  'approved', '00000000-0000-0000-0000-0000000d0001', now() - interval '14 days', true),
 (md5('event-5')::uuid, '00000000-0000-0000-0000-00000000e100', 'Drop-in coffee morning (demo, open now)',
  E'Kopi and kuih with your neighbours. Drop in any time. This demo event is always open so you can try check-in.',
  'community', '00000000-0000-0000-0000-0000000d0012',
  now() - interval '15 minutes', now() + interval '6 hours',
  'Elmina Valley 3 basketball court', 3.1705, 101.4985, '00000000-0000-0000-0000-0000000a0006', null,
  'approved', '00000000-0000-0000-0000-0000000d0001', now() - interval '1 day', true)
on conflict (id) do update set
  title = excluded.title, description = excluded.description, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
  approval_state = excluded.approval_state, reject_reason = null, decided_by = excluded.decided_by, decided_at = excluded.decided_at;

-- Demo check-in code for every approved demo event (real events get a random one)
insert into private.event_codes (event_id, code)
select id, '135790' from public.events where id in (md5('event-1')::uuid, md5('event-2')::uuid, md5('event-4')::uuid, md5('event-5')::uuid)
on conflict (event_id) do update set code = excluded.code;

insert into public.rsvps (event_id, user_id, status) values
 (md5('event-1')::uuid, '00000000-0000-0000-0000-0000000d0011', 'going'),
 (md5('event-1')::uuid, '00000000-0000-0000-0000-0000000d0014', 'going'),
 (md5('event-1')::uuid, '00000000-0000-0000-0000-0000000d0013', 'interested'),
 (md5('event-2')::uuid, '00000000-0000-0000-0000-0000000d0014', 'going'),
 (md5('event-2')::uuid, '00000000-0000-0000-0000-0000000d0012', 'interested'),
 (md5('event-3')::uuid, '00000000-0000-0000-0000-0000000d0011', 'going'),
 (md5('event-4')::uuid, '00000000-0000-0000-0000-0000000d0012', 'going'),
 (md5('event-4')::uuid, '00000000-0000-0000-0000-0000000d0011', 'going'),
 (md5('event-4')::uuid, '00000000-0000-0000-0000-0000000d0014', 'going'),
 (md5('event-5')::uuid, '00000000-0000-0000-0000-0000000d0012', 'going')
on conflict do nothing;
insert into public.event_checkins (event_id, user_id, method, at) values
 (md5('event-4')::uuid, '00000000-0000-0000-0000-0000000d0012', 'distance', now() - interval '10 days'),
 (md5('event-4')::uuid, '00000000-0000-0000-0000-0000000d0011', 'code', now() - interval '10 days')
on conflict do nothing;

-- ---------------------------------------------------------------- Community posts
insert into public.community_posts (id, township_id, author_id, type, body, area_id, lat, lng, anonymous, bubble_until,
                                    moderation_state, held_reason, created_at, is_demo)
values
 (md5('post-1')::uuid, '00000000-0000-0000-0000-00000000e100', '00000000-0000-0000-0000-0000000d0012', 'question',
  'Anyone know a clinic near Elmina that opens on Sunday mornings? Little one has a fever. (demo post)',
  '00000000-0000-0000-0000-0000000a0006', 3.1703, 101.4987, false, now() + interval '20 hours', 'visible', null, now() - interval '4 hours', true),
 (md5('post-2')::uuid, '00000000-0000-0000-0000-00000000e100', '00000000-0000-0000-0000-0000000d0011', 'lost_found',
  'Found a set of keys with a blue keychain near the Elmina Green 4 playground. Reply here and describe them, and I''ll return them. (demo post)',
  '00000000-0000-0000-0000-0000000a0005', 3.2040, 101.4895, false, now() + interval '22 hours', 'visible', null, now() - interval '2 hours', true),
 (md5('post-3')::uuid, '00000000-0000-0000-0000-00000000e100', '00000000-0000-0000-0000-0000000d0014', 'recommendation',
  'The jogging track at Central Park is lovely at 7 am, cool and shady. See you there! (demo post)',
  '00000000-0000-0000-0000-0000000a0008', null, null, false, null, 'visible', null, now() - interval '2 days', true),
 (md5('post-4')::uuid, '00000000-0000-0000-0000-00000000e100', '00000000-0000-0000-0000-0000000d0013', 'safety_tip',
  'Saw a few motorbikes riding fast along the back lane after school hours. Please keep an eye on the kids crossing there. (demo post)',
  '00000000-0000-0000-0000-0000000a0005', null, null, true, null, 'visible', null, now() - interval '1 day', true),
 (md5('post-5')::uuid, '00000000-0000-0000-0000-00000000e100', '00000000-0000-0000-0000-0000000d0012', 'general',
  'Selling my old kids'' bicycle, good condition. WhatsApp me at 012-000 0000. (demo post)',
  '00000000-0000-0000-0000-0000000a0006', null, null, false, null, 'held', 'private_info', now() - interval '30 minutes', true)
on conflict (id) do update set
  body = excluded.body, bubble_until = excluded.bubble_until, moderation_state = excluded.moderation_state,
  held_reason = excluded.held_reason, created_at = excluded.created_at;

delete from public.post_replies where post_id in (md5('post-1')::uuid, md5('post-2')::uuid, md5('post-3')::uuid);
insert into public.post_replies (id, post_id, author_id, body, created_at) values
 (md5('reply-1')::uuid, md5('post-1')::uuid, '00000000-0000-0000-0000-0000000d0011',
  'I''d check the clinic''s Google Maps page for Sunday hours before going, they change often. Hope your little one feels better!', now() - interval '3 hours'),
 (md5('reply-2')::uuid, md5('post-1')::uuid, '00000000-0000-0000-0000-0000000d0014',
  'If the fever is very high, go straight to the hospital emergency department. Get well soon.', now() - interval '150 minutes'),
 (md5('reply-3')::uuid, md5('post-3')::uuid, '00000000-0000-0000-0000-0000000d0012', 'Agreed, it''s my favourite time too.', now() - interval '1 day');
insert into public.post_reactions (post_id, user_id) values
 (md5('post-1')::uuid, '00000000-0000-0000-0000-0000000d0011'),
 (md5('post-3')::uuid, '00000000-0000-0000-0000-0000000d0011'),
 (md5('post-3')::uuid, '00000000-0000-0000-0000-0000000d0012'),
 (md5('post-4')::uuid, '00000000-0000-0000-0000-0000000d0014')
on conflict do nothing;
update public.community_posts c set
  reply_count = (select count(*) from public.post_replies r where r.post_id = c.id and not r.hidden),
  helpful_count = (select count(*) from public.post_reactions r where r.post_id = c.id)
 where c.is_demo;

-- ---------------------------------------------------------------- Last week's newsletter (built from the data above)
insert into public.newsletters (id, township_id, week_start, title, intro, sections, status, published_at, created_by)
values (md5('newsletter-last-week')::uuid, '00000000-0000-0000-0000-00000000e100',
        date_trunc('week', (now() - interval '7 days') at time zone 'Asia/Kuala_Lumpur')::date,
        'Last week in City of Elmina (demo)',
        'A quick look at what happened around the township last week. (Demo issue for the hackathon prototype.)',
        private.build_newsletter('00000000-0000-0000-0000-00000000e100', now() - interval '21 days', now() - interval '1 day'),
        'published', now() - interval '6 days', '00000000-0000-0000-0000-0000000d0001')
on conflict (township_id, week_start) do update set sections = excluded.sections, status = 'published';
insert into public.newsletter_reads (newsletter_id, user_id)
select n.id, '00000000-0000-0000-0000-0000000d0011'::uuid from public.newsletters n where n.id = md5('newsletter-last-week')::uuid
on conflict do nothing;
