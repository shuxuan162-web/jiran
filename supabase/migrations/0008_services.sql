-- Jiran phase 7: visitor passes (with QR), service requests, car plates, billing reminders (view only), app feedback.
-- Same rules as before: residents act only through functions or own-row policies; staff see what their job needs.

-- ---------------------------------------------------------------------------
-- Visitor passes. The QR holds only a random token; the guard's scan looks it up.
-- ---------------------------------------------------------------------------
create table public.visitor_passes (
  id            uuid primary key default gen_random_uuid(),
  township_id   uuid not null references public.townships(id),
  host_id       uuid not null references public.profiles(id) on delete cascade,
  unit_id       uuid references public.units(id),
  visitor_name  text not null check (char_length(visitor_name) between 2 and 60),
  plate         text check (plate is null or plate ~ '^[A-Z0-9 ]{2,12}$'),
  visit_date    date not null,
  token         text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  status        text not null default 'active' check (status in ('active', 'arrived', 'cancelled')),
  arrived_at    timestamptz,
  checked_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on public.visitor_passes (host_id, visit_date desc);
alter table public.visitor_passes enable row level security;
create policy "passes own" on public.visitor_passes for select to authenticated using (host_id = auth.uid());

create or replace function public.create_visitor_pass(p_name text, p_plate text, p_date date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v public.visitor_passes%rowtype; v_plate text := nullif(upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9 ]', '', 'g')), '');
begin
  if not public.is_active_member() or public.auth_role() not in ('owner', 'sub_owner') then raise exception 'forbidden'; end if;
  if private.hit_rate_limit('pass_day', auth.uid()::text, 10, interval '1 day') then raise exception 'rate_limited'; end if;
  if p_date < (now() at time zone 'Asia/Kuala_Lumpur')::date or p_date > (now() at time zone 'Asia/Kuala_Lumpur')::date + 30 then
    raise exception 'pass_bad_date';
  end if;
  insert into public.visitor_passes (township_id, host_id, unit_id, visitor_name, plate, visit_date)
  values (public.my_township(), auth.uid(), public.my_unit_id(), trim(p_name), trim(v_plate), p_date)
  returning * into v;
  return jsonb_build_object('id', v.id, 'token', v.token);
end;
$$;

create or replace function public.cancel_visitor_pass(p_id uuid)
returns void language sql security definer set search_path = ''
as $$ update public.visitor_passes set status = 'cancelled' where id = p_id and host_id = auth.uid() and status = 'active' $$;

-- Guard scan: valid only on the visit date (Malaysia time). Shows what the guard needs: visitor, plate, host unit.
create or replace function public.verify_visitor_pass(p_token text, p_mark_arrived boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v public.visitor_passes%rowtype; v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date; v_state text;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select * into v from public.visitor_passes where token = lower(trim(p_token)) and township_id = public.my_township();
  if not found then return jsonb_build_object('valid', false, 'reason', 'unknown'); end if;
  v_state := case when v.status = 'cancelled' then 'cancelled' when v.visit_date < v_today then 'expired'
                  when v.visit_date > v_today then 'not_yet' when v.status = 'arrived' then 'already_arrived' else 'ok' end;
  if v_state = 'ok' and p_mark_arrived then
    update public.visitor_passes set status = 'arrived', arrived_at = now(), checked_by = auth.uid() where id = v.id;
    perform public.notify_user(v.host_id, 'visitor', 'Your visitor has arrived', v.visitor_name || ' was checked in at the guardhouse.', '/app/services/visitors');
    insert into public.audit_log (actor_id, action, target_table, target_id) values (auth.uid(), 'visitor_arrived', 'visitor_passes', v.id);
  end if;
  return jsonb_build_object('valid', v_state in ('ok', 'already_arrived'), 'state', case when v_state = 'ok' and p_mark_arrived then 'arrived_now' else v_state end,
    'visitor', v.visitor_name, 'plate', v.plate, 'visit_date', v.visit_date,
    'unit', (select label from public.units where id = v.unit_id),
    'host', (select nickname from public.profiles where id = v.host_id), 'arrived_at', coalesce(v.arrived_at, case when p_mark_arrived and v_state = 'ok' then now() end));
end;
$$;

-- ---------------------------------------------------------------------------
-- Service requests (inside the home or the strata area)
-- ---------------------------------------------------------------------------
create sequence public.service_ref_seq;
create table public.service_requests (
  id              uuid primary key default gen_random_uuid(),
  township_id     uuid not null references public.townships(id),
  ref_no          text not null unique,
  requester_id    uuid references public.profiles(id) on delete set null,
  unit_id         uuid references public.units(id),
  category        text not null check (category in ('aircond', 'plumbing', 'electrical', 'pest', 'landscape', 'renovation', 'access_card', 'other')),
  description     text not null check (char_length(description) between 10 and 1000),
  preferred_time  text check (char_length(preferred_time) <= 80),
  photo_paths     text[] not null default '{}',
  status          text not null default 'submitted' check (status in ('submitted', 'scheduled', 'in_progress', 'done', 'cancelled')),
  scheduled_for   timestamptz,
  staff_note      text check (char_length(staff_note) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.service_requests (township_id, status, created_at desc);
create index on public.service_requests (unit_id);
alter table public.service_requests enable row level security;
-- Everyone in the same unit (owner and sub-owners) sees the unit's requests; management sees all.
create policy "service own unit or management" on public.service_requests for select to authenticated
  using ((unit_id is not null and unit_id = public.my_unit_id() and public.is_active_member())
         or requester_id = auth.uid() or (public.is_management() and township_id = public.my_township()));

create or replace function public.create_service_request(p_category text, p_description text, p_preferred text, p_photo_paths text[] default '{}')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_ref text;
begin
  if not public.is_active_member() or public.auth_role() not in ('owner', 'sub_owner') then raise exception 'forbidden'; end if;
  if private.hit_rate_limit('service_day', auth.uid()::text, 5, interval '1 day') then raise exception 'rate_limited'; end if;
  if char_length(trim(coalesce(p_description, ''))) < 10 then raise exception 'description_short'; end if;
  if exists (select 1 from unnest(coalesce(p_photo_paths, '{}')) x where split_part(x, '/', 1) <> auth.uid()::text) then raise exception 'forbidden'; end if;
  v_ref := 'SR-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYMM') || '-' || lpad(nextval('public.service_ref_seq')::text, 4, '0');
  insert into public.service_requests (township_id, ref_no, requester_id, unit_id, category, description, preferred_time, photo_paths)
  values (public.my_township(), v_ref, auth.uid(), public.my_unit_id(), p_category, trim(p_description),
          nullif(trim(coalesce(p_preferred, '')), ''), coalesce(p_photo_paths[1:3], '{}'))
  returning id into v_id;
  insert into public.notifications (user_id, kind, title, body, link)
  select p.id, 'service', 'New service request ' || v_ref, left(trim(p_description), 120), '/admin/services'
    from public.profiles p join public.profiles_private pp on pp.user_id = p.id
   where p.role = 'management' and pp.status = 'active' and p.township_id = public.my_township();
  return jsonb_build_object('id', v_id, 'ref_no', v_ref);
end;
$$;

create or replace function public.update_service_request(p_id uuid, p_status text, p_note text default null, p_scheduled timestamptz default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.service_requests%rowtype;
begin
  if p_status = 'cancelled' and exists (select 1 from public.service_requests where id = p_id and requester_id = auth.uid() and status = 'submitted') then
    update public.service_requests set status = 'cancelled', updated_at = now() where id = p_id;
    return;
  end if;
  if not public.is_management() then raise exception 'forbidden'; end if;
  update public.service_requests set status = p_status, staff_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), staff_note),
         scheduled_for = coalesce(p_scheduled, scheduled_for), updated_at = now()
   where id = p_id and township_id = public.my_township() returning * into r;
  if not found then raise exception 'not_found'; end if;
  perform public.notify_user(r.requester_id, 'service', r.ref_no || ': ' || case p_status when 'scheduled' then 'scheduled' when 'in_progress' then 'in progress'
      when 'done' then 'done' when 'cancelled' then 'cancelled' else p_status end,
    coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Township management updated your request.'), '/app/services/requests');
  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), 'service_' || p_status, 'service_requests', p_id, jsonb_build_object('note', p_note));
end;
$$;

-- ---------------------------------------------------------------------------
-- Car plates (own rows only, up to 5)
-- ---------------------------------------------------------------------------
create table public.car_plates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  plate       text not null check (plate ~ '^[A-Z0-9 ]{2,12}$'),
  label       text check (char_length(label) <= 40),
  created_at  timestamptz not null default now(),
  unique (user_id, plate)
);
alter table public.car_plates enable row level security;
create policy "plates own read" on public.car_plates for select to authenticated using (user_id = auth.uid());
create policy "plates own insert" on public.car_plates for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_member() and (select count(*) from public.car_plates c where c.user_id = auth.uid()) < 5);
create policy "plates own update" on public.car_plates for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "plates own delete" on public.car_plates for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Billing reminders: view only, owners only, no payment in Jiran
-- ---------------------------------------------------------------------------
create table public.billing_reminders (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.units(id) on delete cascade,
  kind        text not null check (kind in ('maintenance_fee', 'sinking_fund', 'quit_rent', 'assessment', 'water')),
  period      text not null,
  amount      numeric(10, 2) not null check (amount >= 0),
  due_date    date not null,
  paid_at     date,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on public.billing_reminders (unit_id, due_date desc);
alter table public.billing_reminders enable row level security;
create policy "billing owner of unit" on public.billing_reminders for select to authenticated
  using (unit_id = public.my_unit_id() and public.auth_role() = 'owner' and public.is_active_member());

-- Demo bills for the seeded owners' units (labelled demo; amounts are placeholders, not real SDP charges)
insert into public.billing_reminders (unit_id, kind, period, amount, due_date, paid_at, is_demo)
select pp.unit_id, x.kind, x.period, x.amount, (now() at time zone 'Asia/Kuala_Lumpur')::date + x.due_in, x.paid, true
  from public.profiles_private pp join public.profiles p on p.id = pp.user_id
  cross join (values
    ('maintenance_fee', 'This quarter (demo)', 450.00, 12, null::date),
    ('sinking_fund', 'This quarter (demo)', 45.00, 12, null::date),
    ('quit_rent', 'This year (demo)', 120.00, -5, null::date),
    ('maintenance_fee', 'Last quarter (demo)', 450.00, -80, (now() at time zone 'Asia/Kuala_Lumpur')::date - 85)
  ) x(kind, period, amount, due_in, paid)
 where p.role = 'owner' and pp.unit_id is not null and p.id in
   ('00000000-0000-0000-0000-0000000d0011', '00000000-0000-0000-0000-0000000d0012', '00000000-0000-0000-0000-0000000d0014')
   and not exists (select 1 from public.billing_reminders b where b.unit_id = pp.unit_id and b.is_demo);

-- ---------------------------------------------------------------------------
-- App feedback (the Feedback tile): a rating and a message for township management
-- ---------------------------------------------------------------------------
create table public.app_feedback (
  id          uuid primary key default gen_random_uuid(),
  township_id uuid not null references public.townships(id),
  user_id     uuid references public.profiles(id) on delete set null,
  topic       text not null check (topic in ('app', 'township', 'security', 'cleanliness', 'facilities', 'other')),
  rating      int not null check (rating between 1 and 5),
  message     text check (char_length(message) <= 1000),
  anonymous   boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.app_feedback enable row level security;
create policy "feedback own" on public.app_feedback for select to authenticated using (user_id = auth.uid());

create or replace function public.send_feedback(p_topic text, p_rating int, p_message text, p_anonymous boolean default false)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then raise exception 'forbidden'; end if;
  if private.hit_rate_limit('feedback_day', auth.uid()::text, 5, interval '1 day') then raise exception 'rate_limited'; end if;
  insert into public.app_feedback (township_id, user_id, topic, rating, message, anonymous)
  values (public.my_township(), auth.uid(), p_topic, p_rating, nullif(trim(coalesce(p_message, '')), ''), coalesce(p_anonymous, false));
end;
$$;

-- Management view: anonymous feedback never shows who sent it
create or replace function public.feedback_list(p_days int default 90)
returns table (id uuid, topic text, rating int, message text, nickname text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select f.id, f.topic, f.rating, f.message, case when f.anonymous then null else p.nickname end, f.created_at
    from public.app_feedback f left join public.profiles p on p.id = f.user_id
   where public.is_management() and f.township_id = public.my_township() and f.created_at >= now() - make_interval(days => p_days)
   order by f.created_at desc limit 300
$$;

-- Event check-in by QR: the event's QR carries its id and the 6-digit code; this is the same check as typing the code.
-- (No new function needed: the app calls check_in_event(id, null, null, code).)

revoke execute on function public.create_visitor_pass(text, text, date), public.cancel_visitor_pass(uuid),
  public.verify_visitor_pass(text, boolean), public.create_service_request(text, text, text, text[]),
  public.update_service_request(uuid, text, text, timestamptz), public.send_feedback(text, int, text, boolean),
  public.feedback_list(int) from public, anon;
grant execute on function public.create_visitor_pass(text, text, date), public.cancel_visitor_pass(uuid),
  public.verify_visitor_pass(text, boolean), public.create_service_request(text, text, text, text[]),
  public.update_service_request(uuid, text, text, timestamptz), public.send_feedback(text, int, text, boolean),
  public.feedback_list(int) to authenticated;
