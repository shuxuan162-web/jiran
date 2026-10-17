-- Jiran demo seed · re-runnable (fixed ids + on conflict)
-- Everything marked synthetic/unverified is a placeholder, not real SDP data.
-- Demo password for every account: JiranDemo2026!

-- Township ------------------------------------------------------------------
insert into public.townships (id, slug, name, center_lat, center_lng)
values ('00000000-0000-0000-0000-00000000e100', 'city-of-elmina', 'City of Elmina', 3.1800, 101.5000)
on conflict (id) do nothing;

-- Areas (centre points are rough, traced from Google Maps screenshots; verified = false)
insert into public.areas (id, township_id, parent_id, slug, name, kind, residential, center_lat, center_lng, source_note, sort_order) values
 ('00000000-0000-0000-0000-0000000a0001','00000000-0000-0000-0000-00000000e100',null,'elmina-west','Elmina West','estate',true,3.1950,101.4930,'Estate, 2,662 acres (StarProperty)',10),
 ('00000000-0000-0000-0000-0000000a0002','00000000-0000-0000-0000-00000000e100',null,'elmina-east','Elmina East','estate',true,3.1950,101.5150,'Estate, 1,088 acres, east of the GCE (StarProperty)',20),
 ('00000000-0000-0000-0000-0000000a0003','00000000-0000-0000-0000-00000000e100',null,'denai-alam','Denai Alam','estate',true,3.1550,101.5020,'Estate, 1,000 acres (StarProperty)',30),
 ('00000000-0000-0000-0000-0000000a0004','00000000-0000-0000-0000-00000000e100',null,'bukit-subang','Bukit Subang','estate',true,3.1480,101.5110,'Estate, 250 acres (StarProperty)',40),
 ('00000000-0000-0000-0000-0000000a0005','00000000-0000-0000-0000-00000000e100','00000000-0000-0000-0000-0000000a0001','elmina-green','Elmina Green','precinct',true,3.2040,101.4890,'Precinct in Elmina West (StarProperty); Green 1-4 on Google Maps',11),
 ('00000000-0000-0000-0000-0000000a0006','00000000-0000-0000-0000-00000000e100',null,'elmina-valley','Elmina Valley','precinct',true,3.1700,101.4990,'Valley 3 and 4 on Google Maps; parent estate to confirm',12),
 ('00000000-0000-0000-0000-0000000a0007','00000000-0000-0000-0000-00000000e100',null,'elmina-city-centre','Elmina City Centre','commercial',false,3.1840,101.4990,'Elmina Lakeside Mall, EV Arena',50),
 ('00000000-0000-0000-0000-0000000a0008','00000000-0000-0000-0000-00000000e100',null,'elmina-central-park','Elmina Central Park','park',false,3.1790,101.5030,'300-acre Central Park (Wikipedia)',60),
 ('00000000-0000-0000-0000-0000000a0009','00000000-0000-0000-0000-00000000e100',null,'forest-park','Forest Park and Subang Forest Reserve','park',false,3.1750,101.4820,'Forest Park 84 acres next to the 2,700-acre reserve (Wikipedia)',70),
 ('00000000-0000-0000-0000-0000000a0010','00000000-0000-0000-0000-00000000e100',null,'elmina-business-park','Elmina Business Park','business',false,null,null,'Location to confirm before use',80)
on conflict (id) do update set name = excluded.name, center_lat = excluded.center_lat, center_lng = excluded.center_lng,
  source_note = excluded.source_note, sort_order = excluded.sort_order;

-- Synthetic units: 12 per residential area, jittered around the area centre
insert into public.units (id, township_id, area_id, label, street, unit_no, lat, lng, synthetic)
select md5('unit-' || a.slug || '-' || n)::uuid,
       a.township_id, a.id,
       a.name || ' · No. ' || n || ' (demo)',
       a.name || ' demo street',
       n::text,
       a.center_lat + (((n * 37) % 11) - 5) * 0.0006,
       a.center_lng + (((n * 53) % 13) - 6) * 0.0006,
       true
  from public.areas a
  cross join generate_series(1, 12) n
 where a.residential and a.kind in ('precinct', 'estate') and a.slug not in ('elmina-west')
on conflict (township_id, label) do nothing;

-- Demo accounts in auth ------------------------------------------------------
with demo(id, email) as (values
  ('00000000-0000-0000-0000-0000000d0001'::uuid, 'admin@jiran.example.com'),
  ('00000000-0000-0000-0000-0000000d0002'::uuid, 'security@jiran.example.com'),
  ('00000000-0000-0000-0000-0000000d0011'::uuid, 'lakewalker@jiran.example.com'),
  ('00000000-0000-0000-0000-0000000d0012'::uuid, 'kopikaki@jiran.example.com'),
  ('00000000-0000-0000-0000-0000000d0013'::uuid, 'nasilemak@jiran.example.com'),
  ('00000000-0000-0000-0000-0000000d0014'::uuid, 'cyclingauntie@jiran.example.com'),
  ('00000000-0000-0000-0000-0000000d0015'::uuid, 'newneighbour@jiran.example.com')
), ins as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change,
                          email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
         extensions.crypt('JiranDemo2026!', extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
         '', '', '', '', '', '', '', ''
    from demo
  on conflict (id) do nothing
  returning id, email
)
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       'email', now(), now(), now()
  from ins;

-- Profiles ------------------------------------------------------------------
insert into public.profiles (id, township_id, role, nickname, home_area_id, map_visibility, avatar_config) values
 ('00000000-0000-0000-0000-0000000d0001','00000000-0000-0000-0000-00000000e100','management','TownshipTeam',null,'hidden','{"skin":2,"hair":1,"outfit":"staff","ring":"red"}'),
 ('00000000-0000-0000-0000-0000000d0002','00000000-0000-0000-0000-00000000e100','security','SecurityDesk',null,'hidden','{"skin":3,"hair":0,"outfit":"guard","ring":"red"}'),
 ('00000000-0000-0000-0000-0000000d0011','00000000-0000-0000-0000-00000000e100','owner','LakeWalker','00000000-0000-0000-0000-0000000a0005','precinct','{"skin":1,"hair":3,"outfit":"tee","ring":"amber"}'),
 ('00000000-0000-0000-0000-0000000d0012','00000000-0000-0000-0000-00000000e100','owner','KopiKaki','00000000-0000-0000-0000-0000000a0006','precinct','{"skin":4,"hair":2,"outfit":"batik","ring":"orange"}'),
 ('00000000-0000-0000-0000-0000000d0013','00000000-0000-0000-0000-00000000e100','sub_owner','NasiLemakFan','00000000-0000-0000-0000-0000000a0005','precinct','{"skin":2,"hair":5,"outfit":"hoodie","ring":"green"}'),
 ('00000000-0000-0000-0000-0000000d0014','00000000-0000-0000-0000-00000000e100','owner','CyclingAuntie','00000000-0000-0000-0000-0000000a0003','precinct','{"skin":3,"hair":4,"outfit":"sport","ring":"blue"}'),
 ('00000000-0000-0000-0000-0000000d0015','00000000-0000-0000-0000-00000000e100','owner','NewNeighbour','00000000-0000-0000-0000-0000000a0004','unset','{}')
on conflict (id) do nothing;

insert into public.profiles_private (user_id, full_name, email, phone, id_type, id_last4, id_hash, unit_id, owner_id, status, resident_since) values
 ('00000000-0000-0000-0000-0000000d0001','Township Management (demo)','admin@jiran.example.com',null,null,null,null,null,null,'active','2020-01-01'),
 ('00000000-0000-0000-0000-0000000d0002','Security Desk (demo)','security@jiran.example.com',null,null,null,null,null,null,'active','2020-01-01'),
 ('00000000-0000-0000-0000-0000000d0011','Aisyah Rahman (demo)','lakewalker@jiran.example.com','+60 12-000 0011','nric','0011',private.hash_id('nric','900101-14-0011'),md5('unit-elmina-green-4')::uuid,null,'active','2022-03-01'),
 ('00000000-0000-0000-0000-0000000d0012','Wei Ling Tan (demo)','kopikaki@jiran.example.com','+60 12-000 0012','nric','0012',private.hash_id('nric','880505-10-0012'),md5('unit-elmina-valley-7')::uuid,null,'active','2021-08-15'),
 ('00000000-0000-0000-0000-0000000d0013','Adam Rahman (demo)','nasilemak@jiran.example.com',null,null,null,null,md5('unit-elmina-green-4')::uuid,'00000000-0000-0000-0000-0000000d0011','active','2023-01-10'),
 ('00000000-0000-0000-0000-0000000d0014','Kavitha Nair (demo)','cyclingauntie@jiran.example.com','+60 12-000 0014','nric','0014',private.hash_id('nric','700707-08-0014'),md5('unit-denai-alam-3')::uuid,null,'active','2016-05-20'),
 ('00000000-0000-0000-0000-0000000d0015','Daniel Lim (demo)','newneighbour@jiran.example.com','+60 12-000 0015','passport','0015',private.hash_id('passport','A0000015'),md5('unit-bukit-subang-9')::uuid,null,'pending',current_date)
on conflict (user_id) do nothing;

insert into public.ownership_verifications (id, user_id, unit_id, status, doc_paths, submitted_at, decided_at, decided_by) values
 ('00000000-0000-0000-0000-0000000f0011','00000000-0000-0000-0000-0000000d0011',md5('unit-elmina-green-4')::uuid,'verified','{}',now() - interval '200 days',now() - interval '199 days','00000000-0000-0000-0000-0000000d0001'),
 ('00000000-0000-0000-0000-0000000f0012','00000000-0000-0000-0000-0000000d0012',md5('unit-elmina-valley-7')::uuid,'verified','{}',now() - interval '300 days',now() - interval '298 days','00000000-0000-0000-0000-0000000d0001'),
 ('00000000-0000-0000-0000-0000000f0014','00000000-0000-0000-0000-0000000d0014',md5('unit-denai-alam-3')::uuid,'verified','{}',now() - interval '400 days',now() - interval '399 days','00000000-0000-0000-0000-0000000d0001'),
 ('00000000-0000-0000-0000-0000000f0015','00000000-0000-0000-0000-0000000d0015',md5('unit-bukit-subang-9')::uuid,'submitted','{}',now() - interval '2 hours',null,null)
on conflict (id) do nothing;

insert into public.sub_owner_invites (id, owner_id, unit_id, name, email, token_hash, status, expires_at, accepted_user_id, created_at) values
 ('00000000-0000-0000-0000-0000000b0013','00000000-0000-0000-0000-0000000d0011',md5('unit-elmina-green-4')::uuid,'Adam Rahman (demo)','nasilemak@jiran.example.com',
  encode(extensions.digest('seed-invite-used','sha256'),'hex'),'active',now() + interval '72 hours','00000000-0000-0000-0000-0000000d0013',now() - interval '30 days')
on conflict (id) do nothing;

insert into public.prime_members (id, id_type, id_hash, user_id) values
 ('00000000-0000-0000-0000-0000000c0011','nric',private.hash_id('nric','900101-14-0011'),'00000000-0000-0000-0000-0000000d0011')
on conflict (id) do nothing;

-- App config -----------------------------------------------------------------
insert into public.app_config (key, value, description) values
 ('priority_weights', '{"severity":0.40,"upvotes":0.25,"affected":0.20,"waiting":0.15}', 'P = 0.40S + 0.25U + 0.20A + 0.15T'),
 ('priority_waiting_cap_days', '14', 'T reaches 100 after this many days'),
 ('affected_radius_m', '200', 'Radius for counting distinct affected units (A)'),
 ('duplicate_radius_m', '100', 'Radius for duplicate suggestions'),
 ('sos_alert_radius_m', '1000', 'Residents inside this radius get the SOS alert'),
 ('sos_trigger_mode', '{"large":"instant","small":"hold"}', 'Instant on big SOS buttons, press-and-hold on small ones'),
 ('sos_rate_limit_per_hour', '3', 'Max SOS per resident per hour'),
 ('event_approval_required', 'true', 'Resident-organised events need management approval'),
 ('bubble_hours', '24', 'Speech bubbles expire after this many hours'),
 ('presence_minutes', '30', 'Opt-in check-in presence expires after this many minutes'),
 ('demo_mode', 'true', 'When true the SOS dialer is replaced by a demo modal')
on conflict (key) do nothing;
