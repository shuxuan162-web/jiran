-- Jiran · 0004_map_sos
-- Phase 3: area outlines for the drawn map, SOS and emergencies (resident + management + security desk),
-- the urgent queue, opt-in map presence (check-in ~100 m, expires), and the ordered feed (tiers).
-- Map provider is Leaflet with key-less tiles; nothing here depends on the provider.

-- ---------------------------------------------------------------------------
-- Area outlines: a simple drawn layout of each section. Rough, unverified shapes
-- (verified stays false) placed around the seeded centres. GeoJSON order is [lng, lat].
-- ---------------------------------------------------------------------------
update public.areas a set boundary = v.b::jsonb from (values
  ('elmina-green',        '{"type":"Polygon","coordinates":[[[101.480,3.212],[101.498,3.212],[101.500,3.197],[101.482,3.196],[101.480,3.212]]]}'),
  ('elmina-city-centre',  '{"type":"Polygon","coordinates":[[[101.492,3.191],[101.506,3.191],[101.506,3.181],[101.492,3.181],[101.492,3.191]]]}'),
  ('elmina-central-park', '{"type":"Polygon","coordinates":[[[101.498,3.180],[101.510,3.180],[101.510,3.174],[101.498,3.174],[101.498,3.180]]]}'),
  ('elmina-valley',       '{"type":"Polygon","coordinates":[[[101.488,3.173],[101.497,3.173],[101.508,3.172],[101.508,3.164],[101.488,3.164],[101.488,3.173]]]}'),
  ('forest-park',         '{"type":"Polygon","coordinates":[[[101.466,3.192],[101.481,3.192],[101.487,3.165],[101.470,3.165],[101.466,3.192]]]}'),
  ('elmina-east',         '{"type":"Polygon","coordinates":[[[101.506,3.205],[101.528,3.205],[101.528,3.186],[101.508,3.186],[101.506,3.205]]]}'),
  ('denai-alam',          '{"type":"Polygon","coordinates":[[[101.492,3.162],[101.508,3.162],[101.506,3.149],[101.494,3.149],[101.492,3.162]]]}'),
  ('bukit-subang',        '{"type":"Polygon","coordinates":[[[101.509,3.155],[101.522,3.155],[101.522,3.140],[101.510,3.141],[101.509,3.155]]]}')
) v(slug, b) where a.slug = v.slug;

insert into public.app_config (key, value, description) values
  ('sos_cancel_seconds', '120', 'Reporter can cancel an SOS without penalty for this long'),
  ('sos_strikes_to_suspend', '2', 'False alarms before SOS is suspended for a user until management review'),
  ('sos_confirm_min_account_hours', '24', 'Accounts younger than this cannot confirm an SOS'),
  ('sos_community_confirms', '2', 'Confirmations needed to mark an SOS community confirmed'),
  ('sos_public_round_decimals', '3', 'Public SOS and check-in positions are rounded to this many decimals (3 = about 110 m)')
on conflict (key) do nothing;

-- Nearest area by centre (same rule the issue trigger uses)
create or replace function public.nearest_area(p_lat double precision, p_lng double precision)
returns uuid language sql stable security definer set search_path = ''
as $$
  select a.id from public.areas a
   where a.township_id = public.my_township() and a.center_lat is not null and a.kind <> 'estate'
   order by public.geo_distance_m(p_lat, p_lng, a.center_lat, a.center_lng) limit 1
$$;

-- ---------------------------------------------------------------------------
-- Emergencies
-- ---------------------------------------------------------------------------
create type public.emergency_type as enum ('fire', 'medical', 'crime', 'flood', 'accident', 'other', 'unspecified');
create type public.emergency_status as enum
  ('unconfirmed', 'community_confirmed', 'mgmt_confirmed', 'responding', 'resolved', 'false_alarm', 'cancelled');
create sequence public.sos_ref_seq;

create table public.emergencies (
  id            uuid primary key default gen_random_uuid(),
  township_id   uuid not null references public.townships(id),
  ref_no        text not null unique,
  client_id     uuid unique,                     -- lets an offline retry land exactly once
  reporter_id   uuid not null references public.profiles(id) on delete cascade,
  type          public.emergency_type not null default 'unspecified',
  status        public.emergency_status not null default 'unconfirmed',
  lat           double precision not null,
  lng           double precision not null,
  approximate   boolean not null default true,   -- true until the phone's location arrives
  area_id       uuid references public.areas(id),
  description   text check (char_length(description) <= 500),
  photo_path    text,
  cancel_until  timestamptz not null,
  confirm_count int not null default 0,
  handled_by    uuid references public.profiles(id),
  staff_note    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  closed_at     timestamptz
);
create index on public.emergencies (township_id, status, created_at desc);
alter table public.emergencies enable row level security;
-- Base table: reporter or staff only. Everyone else reads the rounded, anonymous active_emergencies().
create policy emergencies_read on public.emergencies for select to authenticated
  using (reporter_id = auth.uid() or (public.is_staff() and township_id = public.my_township()));

create table public.emergency_events (
  id            bigserial primary key,
  emergency_id  uuid not null references public.emergencies(id) on delete cascade,
  status        public.emergency_status not null,
  note          text,
  by_staff      boolean not null default false,
  actor_id      uuid references public.profiles(id) on delete set null,
  at            timestamptz not null default now()
);
create index on public.emergency_events (emergency_id, at);
alter table public.emergency_events enable row level security;
create policy emergency_events_read on public.emergency_events for select to authenticated
  using (exists (select 1 from public.emergencies e where e.id = emergency_id));

create table public.emergency_confirmations (
  emergency_id  uuid not null references public.emergencies(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  at            timestamptz not null default now(),
  primary key (emergency_id, user_id)
);
alter table public.emergency_confirmations enable row level security;
create policy emergency_confirmations_own on public.emergency_confirmations for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create table private.sos_strikes (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  warnings    int not null default 0,
  suspended   boolean not null default false,
  updated_at  timestamptz not null default now()
);

create or replace function public.trg_emergency_ref()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.ref_no := 'SOS-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYMM') || '-'
                || lpad(nextval('public.sos_ref_seq')::text, 4, '0');
  return new;
end;
$$;
create trigger emergencies_ref before insert on public.emergencies
  for each row execute function public.trg_emergency_ref();

create or replace function public.sos_type_word(p public.emergency_type)
returns text language sql immutable set search_path = ''
as $$
  select case p when 'fire' then 'Fire' when 'medical' then 'Medical' when 'crime' then 'Crime or threat'
    when 'flood' then 'Flood' when 'accident' then 'Accident' when 'other' then 'Other' else 'Emergency' end
$$;

-- Alert every active staff account (management and security desk): bell + simulated email.
create or replace function public.alert_staff(p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.notifications (user_id, kind, title, body, link)
  select p.id, 'sos', p_title, p_body, p_link
    from public.profiles p join public.profiles_private pp on pp.user_id = p.id
   where p.role in ('management', 'security') and pp.status = 'active' and p.township_id = public.my_township();
  insert into public.email_outbox (kind, recipient_user_id, to_email, subject, body, link)
  select 'sos', p.id, pp.email, p_title, p_body, p_link
    from public.profiles p join public.profiles_private pp on pp.user_id = p.id
   where p.role in ('management', 'security') and pp.status = 'active' and p.township_id = public.my_township();
end;
$$;

-- One tap. Never refuses because of location: no GPS yet means the home area centre, marked approximate.
create or replace function public.trigger_sos(
  p_lat double precision default null, p_lng double precision default null,
  p_type text default 'unspecified', p_client_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_town public.townships%rowtype; v_home public.areas%rowtype; v_e public.emergencies%rowtype;
  v_lat double precision := p_lat; v_lng double precision := p_lng; v_approx boolean := false;
  v_type public.emergency_type;
begin
  if not public.is_active_member() or public.auth_role() not in ('owner', 'sub_owner') then raise exception 'forbidden'; end if;
  if p_client_id is not null then
    select * into v_e from public.emergencies where client_id = p_client_id and reporter_id = auth.uid();
    if found then
      return jsonb_build_object('id', v_e.id, 'ref_no', v_e.ref_no, 'cancel_until', v_e.cancel_until,
        'approximate', v_e.approximate, 'duplicate', true);
    end if;
  end if;
  if exists (select 1 from private.sos_strikes where user_id = auth.uid() and suspended) then
    raise exception 'sos_suspended';
  end if;
  if private.hit_rate_limit('sos_hour', auth.uid()::text, public.cfg_num('sos_rate_limit_per_hour', 3)::int, interval '1 hour') then
    raise exception 'rate_limited';
  end if;

  select * into v_town from public.townships where id = public.my_township();
  select a.* into v_home from public.areas a join public.profiles p on p.home_area_id = a.id where p.id = auth.uid();
  if v_lat is null or v_lng is null
     or public.geo_distance_m(v_lat, v_lng, v_town.center_lat, v_town.center_lng) > 9000 then
    v_lat := coalesce(v_home.center_lat, v_town.center_lat);
    v_lng := coalesce(v_home.center_lng, v_town.center_lng);
    v_approx := true;
  end if;
  v_type := case when p_type in ('fire','medical','crime','flood','accident','other') then p_type::public.emergency_type
                 else 'unspecified' end;

  insert into public.emergencies (township_id, ref_no, client_id, reporter_id, type, lat, lng, approximate, area_id, cancel_until)
  values (v_town.id, 'pending', p_client_id, auth.uid(), v_type, v_lat, v_lng, v_approx,
          public.nearest_area(v_lat, v_lng),
          now() + make_interval(secs => public.cfg_num('sos_cancel_seconds', 120)::int))
  returning * into v_e;

  insert into public.emergency_events (emergency_id, status, note, actor_id)
  values (v_e.id, 'unconfirmed', case when v_approx then 'Sent with approximate location' end, auth.uid());
  perform public.alert_staff(
    'SOS ' || v_e.ref_no || ': ' || public.sos_type_word(v_type) || ' near ' ||
      coalesce((select name from public.areas where id = v_e.area_id), 'City of Elmina'),
    'A resident pressed SOS. Open the Urgent panel to see the exact location and contact.', '/admin/urgent');
  insert into public.audit_log (actor_id, action, target_table, target_id) values (auth.uid(), 'sos_trigger', 'emergencies', v_e.id);

  return jsonb_build_object('id', v_e.id, 'ref_no', v_e.ref_no, 'cancel_until', v_e.cancel_until,
    'approximate', v_approx, 'duplicate', false);
end;
$$;

-- Reporter adds what they know after the alert has gone out (location, type, details, photo).
create or replace function public.sos_update(
  p_id uuid, p_lat double precision default null, p_lng double precision default null,
  p_type text default null, p_description text default null, p_photo_path text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_e public.emergencies%rowtype; v_town public.townships%rowtype;
begin
  select * into v_e from public.emergencies where id = p_id and reporter_id = auth.uid() for update;
  if not found then raise exception 'not_found'; end if;
  if v_e.status in ('resolved', 'false_alarm', 'cancelled') then raise exception 'sos_closed'; end if;
  if p_photo_path is not null and p_photo_path not like auth.uid()::text || '/%' then raise exception 'bad_path'; end if;
  select * into v_town from public.townships where id = v_e.township_id;
  if p_lat is not null and p_lng is not null
     and public.geo_distance_m(p_lat, p_lng, v_town.center_lat, v_town.center_lng) <= 9000 then
    v_e.lat := p_lat; v_e.lng := p_lng; v_e.approximate := false; v_e.area_id := public.nearest_area(p_lat, p_lng);
  end if;
  update public.emergencies set
    lat = v_e.lat, lng = v_e.lng, approximate = v_e.approximate, area_id = v_e.area_id,
    type = case when p_type in ('fire','medical','crime','flood','accident','other') then p_type::public.emergency_type else type end,
    description = coalesce(nullif(trim(coalesce(p_description, '')), ''), description),
    photo_path = coalesce(p_photo_path, photo_path),
    updated_at = now()
  where id = p_id;
end;
$$;

-- Cancel within the window: logged as "Cancelled by reporter", no penalty.
create or replace function public.cancel_sos(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_e public.emergencies%rowtype;
begin
  select * into v_e from public.emergencies where id = p_id and reporter_id = auth.uid() for update;
  if not found then raise exception 'not_found'; end if;
  if v_e.status not in ('unconfirmed', 'community_confirmed') or now() > v_e.cancel_until then raise exception 'cancel_window_over'; end if;
  update public.emergencies set status = 'cancelled', closed_at = now(), updated_at = now() where id = p_id;
  insert into public.emergency_events (emergency_id, status, note, actor_id) values (p_id, 'cancelled', 'Cancelled by reporter', auth.uid());
  perform public.alert_staff('SOS ' || v_e.ref_no || ' cancelled', 'The resident cancelled this SOS within the cancel window.', '/admin/urgent');
end;
$$;

-- "I can see this too": once per user, not the reporter, nearby, account older than a day.
create or replace function public.confirm_sos(p_id uuid, p_lat double precision default null, p_lng double precision default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_e public.emergencies%rowtype; v_lat double precision := p_lat; v_lng double precision := p_lng; v_n int;
begin
  if not public.is_active_member() or public.auth_role() not in ('owner', 'sub_owner') then raise exception 'forbidden'; end if;
  select * into v_e from public.emergencies where id = p_id and township_id = public.my_township() for update;
  if not found then raise exception 'not_found'; end if;
  if v_e.reporter_id = auth.uid() then raise exception 'own_sos'; end if;
  if v_e.status not in ('unconfirmed', 'community_confirmed', 'mgmt_confirmed', 'responding') then raise exception 'sos_closed'; end if;
  if (select created_at from public.profiles where id = auth.uid())
       > now() - make_interval(hours => public.cfg_num('sos_confirm_min_account_hours', 24)::int) then
    raise exception 'account_too_new';
  end if;
  if v_lat is null or v_lng is null then
    select a.center_lat, a.center_lng into v_lat, v_lng from public.areas a join public.profiles p on p.home_area_id = a.id where p.id = auth.uid();
  end if;
  if v_lat is null or public.geo_distance_m(v_lat, v_lng, v_e.lat, v_e.lng) > public.cfg_num('sos_alert_radius_m', 1000) then
    raise exception 'too_far';
  end if;
  insert into public.emergency_confirmations (emergency_id, user_id) values (p_id, auth.uid())
  on conflict do nothing;
  if not found then raise exception 'already_confirmed'; end if;
  update public.emergencies set confirm_count = confirm_count + 1, updated_at = now() where id = p_id returning confirm_count into v_n;
  if v_e.status = 'unconfirmed' and v_n >= public.cfg_num('sos_community_confirms', 2) then
    update public.emergencies set status = 'community_confirmed' where id = p_id;
    insert into public.emergency_events (emergency_id, status, note) values (p_id, 'community_confirmed', v_n || ' neighbours can see it');
  end if;
  return v_n;
end;
$$;

-- Management and security desk lifecycle: Confirm, Responding, Resolved, False alarm.
create or replace function public.staff_sos_action(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_e public.emergencies%rowtype; v_new public.emergency_status; v_w int; v_word text;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if p_status not in ('mgmt_confirmed', 'responding', 'resolved', 'false_alarm') then raise exception 'bad_status'; end if;
  v_new := p_status::public.emergency_status;
  select * into v_e from public.emergencies where id = p_id and township_id = public.my_township() for update;
  if not found then raise exception 'not_found'; end if;
  if v_e.status in ('resolved', 'false_alarm', 'cancelled') then raise exception 'sos_closed'; end if;

  update public.emergencies set status = v_new, handled_by = auth.uid(),
    staff_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), staff_note), updated_at = now(),
    closed_at = case when v_new in ('resolved', 'false_alarm') then now() end
  where id = p_id;
  insert into public.emergency_events (emergency_id, status, note, by_staff, actor_id)
  values (p_id, v_new, nullif(trim(coalesce(p_note, '')), ''), true, auth.uid());

  v_word := case v_new when 'mgmt_confirmed' then 'Confirmed by the township team'
    when 'responding' then 'Help is on the way' when 'resolved' then 'Resolved' else 'Closed as a false alarm' end;
  perform public.notify_user(v_e.reporter_id, 'sos', 'Your SOS ' || v_e.ref_no || ': ' || v_word, p_note, '/app/sos/' || p_id);

  if v_new = 'false_alarm' then
    insert into private.sos_strikes as s (user_id, warnings) values (v_e.reporter_id, 1)
    on conflict (user_id) do update set warnings = s.warnings + 1, updated_at = now()
    returning warnings into v_w;
    if v_w >= public.cfg_num('sos_strikes_to_suspend', 2) then
      update private.sos_strikes set suspended = true where user_id = v_e.reporter_id;
    end if;
  end if;

  if v_new = 'mgmt_confirmed' then
    -- Tell neighbours whose home area is within the alert radius (never before staff confirm, so hoaxes don't spread)
    insert into public.notifications (user_id, kind, title, body, link)
    select p.id, 'sos', 'Confirmed emergency near you: ' || public.sos_type_word(v_e.type),
           'Township management confirmed an emergency near ' || coalesce((select name from public.areas where id = v_e.area_id), 'your area') || '. Keep clear and follow staff instructions.',
           '/app/map'
      from public.profiles p join public.profiles_private pp on pp.user_id = p.id join public.areas a on a.id = p.home_area_id
     where pp.status = 'active' and p.role in ('owner', 'sub_owner') and p.id <> v_e.reporter_id
       and public.geo_distance_m(a.center_lat, a.center_lng, v_e.lat, v_e.lng) <= public.cfg_num('sos_alert_radius_m', 1000);
  end if;
  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), 'sos_' || p_status, 'emergencies', p_id, jsonb_build_object('note', p_note));
end;
$$;

create or replace function public.lift_sos_suspension(p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  update private.sos_strikes set suspended = false, warnings = 0, updated_at = now() where user_id = p_user;
end;
$$;

-- What residents see: active only, rounded to about 100 m, never who reported it.
create or replace function public.active_emergencies()
returns table (id uuid, ref_no text, type public.emergency_type, status public.emergency_status,
  lat double precision, lng double precision, approximate boolean, area_name text, confirm_count int,
  i_confirmed boolean, is_mine boolean, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.ref_no, e.type, e.status,
         case when e.reporter_id = auth.uid() or public.is_staff() then e.lat
              else round(e.lat::numeric, public.cfg_num('sos_public_round_decimals', 3)::int)::double precision end,
         case when e.reporter_id = auth.uid() or public.is_staff() then e.lng
              else round(e.lng::numeric, public.cfg_num('sos_public_round_decimals', 3)::int)::double precision end,
         e.approximate, a.name, e.confirm_count,
         exists (select 1 from public.emergency_confirmations c where c.emergency_id = e.id and c.user_id = auth.uid()),
         e.reporter_id = auth.uid(), e.created_at, e.updated_at
    from public.emergencies e left join public.areas a on a.id = e.area_id
   where (public.is_active_member() or public.is_staff())
     and e.township_id = public.my_township()
     and e.status in ('unconfirmed', 'community_confirmed', 'mgmt_confirmed', 'responding')
     and e.created_at > now() - interval '24 hours'
   order by e.created_at desc
$$;

-- Reporter's own tracking screen (or staff): full record + timeline.
create or replace function public.sos_status(p_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id, 'ref_no', e.ref_no, 'type', e.type, 'status', e.status, 'lat', e.lat, 'lng', e.lng,
    'approximate', e.approximate, 'area_name', a.name, 'description', e.description, 'photo_path', e.photo_path,
    'cancel_until', e.cancel_until, 'confirm_count', e.confirm_count, 'created_at', e.created_at,
    'events', coalesce((select jsonb_agg(jsonb_build_object('status', v.status, 'note', v.note, 'by_staff', v.by_staff, 'at', v.at) order by v.at)
                         from public.emergency_events v where v.emergency_id = e.id), '[]'::jsonb))
    from public.emergencies e left join public.areas a on a.id = e.area_id
   where e.id = p_id and (e.reporter_id = auth.uid() or (public.is_staff() and e.township_id = public.my_township()))
$$;

-- Staff only: exact location and reporter contact.
create or replace function public.urgent_queue(p_include_closed boolean default false)
returns table (id uuid, ref_no text, type public.emergency_type, status public.emergency_status,
  lat double precision, lng double precision, approximate boolean, area_name text, description text, photo_path text,
  confirm_count int, reporter_id uuid, reporter_nickname text, reporter_name text, reporter_phone text, reporter_email text,
  reporter_warnings int, staff_note text, handled_by_nickname text, created_at timestamptz, updated_at timestamptz, cancel_until timestamptz)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.ref_no, e.type, e.status, e.lat, e.lng, e.approximate, a.name, e.description, e.photo_path,
         e.confirm_count, e.reporter_id, p.nickname, pp.full_name, pp.phone, pp.email,
         coalesce(s.warnings, 0), e.staff_note, h.nickname, e.created_at, e.updated_at, e.cancel_until
    from public.emergencies e
    left join public.areas a on a.id = e.area_id
    left join public.profiles p on p.id = e.reporter_id
    left join public.profiles_private pp on pp.user_id = e.reporter_id
    left join private.sos_strikes s on s.user_id = e.reporter_id
    left join public.profiles h on h.id = e.handled_by
   where public.is_staff() and e.township_id = public.my_township()
     and (p_include_closed or e.status in ('unconfirmed', 'community_confirmed', 'mgmt_confirmed', 'responding'))
     and (not p_include_closed or e.created_at > now() - interval '7 days')
   order by (e.status in ('unconfirmed', 'community_confirmed', 'mgmt_confirmed', 'responding')) desc, e.created_at desc
   limit 100
$$;

-- ---------------------------------------------------------------------------
-- Map presence: opt-in only. Home-precinct counts (avatars only at 5+ visible), and manual
-- check-ins rounded to about 100 m that expire. Ghost mode hides everything at once.
-- ---------------------------------------------------------------------------
create table public.presence_checkins (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  township_id uuid not null references public.townships(id),
  lat         double precision not null,
  lng         double precision not null,
  area_id     uuid references public.areas(id),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
alter table public.presence_checkins enable row level security;
create policy presence_own on public.presence_checkins for select to authenticated using (user_id = auth.uid());

create or replace function public.check_in(p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_p public.profiles%rowtype; v_town public.townships%rowtype; v_d int; v_exp timestamptz;
begin
  if not public.is_active_member() or public.auth_role() not in ('owner', 'sub_owner') then raise exception 'forbidden'; end if;
  select * into v_p from public.profiles where id = auth.uid();
  if v_p.map_visibility <> 'precinct' or v_p.ghost_mode then raise exception 'visibility_off'; end if;
  if private.hit_rate_limit('checkin_hour', auth.uid()::text, 20, interval '1 hour') then raise exception 'rate_limited'; end if;
  select * into v_town from public.townships where id = v_p.township_id;
  if public.geo_distance_m(p_lat, p_lng, v_town.center_lat, v_town.center_lng) > 9000 then raise exception 'outside_township'; end if;
  v_d := public.cfg_num('sos_public_round_decimals', 3)::int;
  v_exp := now() + make_interval(mins => public.cfg_num('presence_minutes', 30)::int);
  insert into public.presence_checkins (user_id, township_id, lat, lng, area_id, expires_at)
  values (auth.uid(), v_town.id, round(p_lat::numeric, v_d), round(p_lng::numeric, v_d), public.nearest_area(p_lat, p_lng), v_exp)
  on conflict (user_id) do update set lat = excluded.lat, lng = excluded.lng, area_id = excluded.area_id,
    expires_at = excluded.expires_at, created_at = now();
  return jsonb_build_object('expires_at', v_exp);
end;
$$;

create or replace function public.check_out()
returns void language sql security definer set search_path = ''
as $$ delete from public.presence_checkins where user_id = auth.uid() $$;

-- Ghost mode or hiding yourself also removes any live check-in straight away.
create or replace function public.trg_profile_privacy()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.ghost_mode or new.map_visibility <> 'precinct' then
    delete from public.presence_checkins where user_id = new.id;
  end if;
  return new;
end;
$$;
create trigger profiles_privacy after update of ghost_mode, map_visibility on public.profiles
  for each row execute function public.trg_profile_privacy();

create or replace function public.map_presence()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with visible as (
    select p.id, p.nickname, p.avatar_config, p.home_area_id
      from public.profiles p join public.profiles_private pp on pp.user_id = p.id
     where p.township_id = public.my_township() and pp.status = 'active' and p.role in ('owner', 'sub_owner')
       and p.map_visibility = 'precinct' and not p.ghost_mode
  ),
  per_area as (
    select a.id, a.name, a.center_lat, a.center_lng, count(v.id) n,
           case when count(v.id) >= 5 then jsonb_agg(jsonb_build_object(
             'nickname', v.nickname, 'avatar', v.avatar_config, 'is_me', v.id = auth.uid(),
             -- stable point inside the precinct, up to ~300 m from its centre
             'lat', a.center_lat + ((('x' || substr(md5(v.id::text), 1, 8))::bit(32)::int % 1000) / 1000.0) * 0.0027,
             'lng', a.center_lng + ((('x' || substr(md5(v.id::text), 9, 8))::bit(32)::int % 1000) / 1000.0) * 0.0027)) end avatars
      from public.areas a join visible v on v.home_area_id = a.id
     where a.center_lat is not null
     group by a.id
  )
  select jsonb_build_object(
    'areas', coalesce((select jsonb_agg(jsonb_build_object('area_id', id, 'name', name, 'lat', center_lat, 'lng', center_lng,
                        'count', n, 'avatars', avatars)) from per_area), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(jsonb_build_object('nickname', p.nickname, 'avatar', p.avatar_config,
                        'lat', c.lat, 'lng', c.lng, 'is_me', c.user_id = auth.uid(),
                        'minutes_left', ceil(extract(epoch from (c.expires_at - now())) / 60)))
                        from public.presence_checkins c join visible p on p.id = c.user_id
                       where c.expires_at > now()), '[]'::jsonb),
    'me', (select jsonb_build_object('map_visibility', map_visibility, 'ghost_mode', ghost_mode,
             'checked_in_until', (select expires_at from public.presence_checkins where user_id = auth.uid() and expires_at > now()))
             from public.profiles where id = auth.uid()))
   where public.is_active_member() or public.is_staff()
$$;

-- ---------------------------------------------------------------------------
-- The ordering view. One function puts every map/feed item in its tier so no client can
-- reorder them: 1 active emergencies (newest first), 2 safety notices (phase 4),
-- 3 everything else (open issues by live priority).
-- ---------------------------------------------------------------------------
create or replace function public.feed_ordered(p_limit int default 50)
returns table (kind text, id uuid, tier int, ref_no text, title text, area_name text,
  lat double precision, lng double precision, level text, status text, score numeric, created_at timestamptz, rank_no int)
language sql stable security definer set search_path = ''
as $$
  with items as (
    select 'emergency'::text kind, e.id, 1 tier, e.ref_no, public.sos_type_word(e.type) title, e.area_name,
           e.lat, e.lng, 'urgent'::text level, e.status::text status, null::numeric score, e.created_at
      from public.active_emergencies() e
    union all
    select 'issue', i.id, 3, i.ref_no, i.category, i.area_name, i.lat, i.lng,
           case when i.p >= 75 then 'urgent' when i.p >= 55 then 'high' when i.p >= 40 then 'medium' else 'low' end,
           i.status::text, i.p, i.created_at
      from public.issue_feed('open', 200) i
  )
  select kind, id, tier, ref_no, title, area_name, lat, lng, level, status, score, created_at,
         (row_number() over (order by tier, case when tier = 1 then extract(epoch from created_at) end desc nulls last,
                             score desc nulls last, created_at desc))::int
    from items
   order by 13
   limit greatest(1, least(p_limit, 200))
$$;

-- Grants
revoke execute on function public.trigger_sos(double precision, double precision, text, uuid),
  public.sos_update(uuid, double precision, double precision, text, text, text), public.cancel_sos(uuid),
  public.confirm_sos(uuid, double precision, double precision), public.staff_sos_action(uuid, text, text),
  public.lift_sos_suspension(uuid), public.active_emergencies(), public.sos_status(uuid), public.urgent_queue(boolean),
  public.check_in(double precision, double precision), public.check_out(), public.map_presence(), public.feed_ordered(int),
  public.nearest_area(double precision, double precision), public.alert_staff(text, text, text)
  from public, anon;
grant execute on function public.trigger_sos(double precision, double precision, text, uuid),
  public.sos_update(uuid, double precision, double precision, text, text, text), public.cancel_sos(uuid),
  public.confirm_sos(uuid, double precision, double precision), public.staff_sos_action(uuid, text, text),
  public.lift_sos_suspension(uuid), public.active_emergencies(), public.sos_status(uuid), public.urgent_queue(boolean),
  public.check_in(double precision, double precision), public.check_out(), public.map_presence(), public.feed_ordered(int)
  to authenticated;

-- Live updates: staff get every SOS row through RLS; reporters get their own.
alter publication supabase_realtime add table public.emergencies;
