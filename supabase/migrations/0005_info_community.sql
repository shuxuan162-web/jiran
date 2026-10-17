-- Jiran phase 4: notices (announcements), area follows, community posts, events, newsletter, analytics-lite.
-- Every rule lives here. Residents reach these tables only through the SECURITY DEFINER functions below,
-- so anonymous authors, check-in codes and private details never travel to the browser.

insert into public.app_config (key, value, description) values
  ('area_follow_max', '4', 'Most extra areas a resident can follow for notices'),
  ('post_reports_to_hold', '3', 'Reports from different residents before a post is held for review'),
  ('warning_days', '14', 'How long a moderation warning holds new posts for review'),
  ('event_checkin_radius_m', '300', 'How close a resident must be to check in to an event without the code'),
  ('analytics_baseline', '{"ack_hours": null, "resolve_days": null, "followups": null, "source": "Fill in from the resident survey before the pitch"}',
   'Before-Jiran numbers for the analytics comparison. Never invented: left empty until the survey is done.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Areas a resident gets notices for: home area, its estate, and up to 4 followed areas (plus their precincts)
-- ---------------------------------------------------------------------------
create table public.area_follows (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  area_id     uuid not null references public.areas(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, area_id)
);

create or replace function public.trg_area_follow_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.area_follows where user_id = new.user_id) >= public.cfg_num('area_follow_max', 4) then
    raise exception 'follow_limit';
  end if;
  return new;
end;
$$;
create trigger area_follows_limit before insert on public.area_follows
  for each row execute function public.trg_area_follow_limit();

alter table public.area_follows enable row level security;
create policy "follows own read" on public.area_follows for select to authenticated using (user_id = auth.uid());
create policy "follows own insert" on public.area_follows for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_member());
create policy "follows own delete" on public.area_follows for delete to authenticated using (user_id = auth.uid());

create or replace function private.area_set(p_user uuid)
returns uuid[] language sql stable set search_path = ''
as $$
  select coalesce(array_agg(distinct x) filter (where x is not null), '{}') from (
    select p.home_area_id x from public.profiles p where p.id = p_user
    union all select a.parent_id from public.profiles p join public.areas a on a.id = p.home_area_id where p.id = p_user
    union all select f.area_id from public.area_follows f where f.user_id = p_user
    union all select a.parent_id from public.area_follows f join public.areas a on a.id = f.area_id where f.user_id = p_user
    union all select c.id from public.area_follows f join public.areas c on c.parent_id = f.area_id where f.user_id = p_user
  ) s
$$;

-- ---------------------------------------------------------------------------
-- Announcements (official notices). Live = published, not withdrawn, not ended.
-- ---------------------------------------------------------------------------
create table public.announcements (
  id               uuid primary key default gen_random_uuid(),
  township_id      uuid not null references public.townships(id),
  category         text not null check (category in ('safety', 'maintenance', 'general', 'event', 'community')),
  source_label     text not null default 'Township management' check (char_length(source_label) between 2 and 60),
  title            text not null check (char_length(title) between 4 and 120),
  body             text not null check (char_length(body) between 10 and 4000),
  target_kind      text not null default 'township' check (target_kind in ('township', 'areas')),
  target_area_ids  uuid[] not null default '{}',
  lat              double precision,
  lng              double precision,
  pinned           boolean not null default false,
  publish_at       timestamptz not null default now(),
  starts_at        timestamptz,
  ends_at          timestamptz,
  withdrawn_at     timestamptz,
  notified_at      timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  is_demo          boolean not null default false,
  check (target_kind = 'township' or cardinality(target_area_ids) > 0),
  check (ends_at is null or ends_at > publish_at)
);
create index on public.announcements (township_id, publish_at desc);

create table public.announcement_reads (
  announcement_id  uuid not null references public.announcements(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  read_at          timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
-- Staff read everything directly (admin screens, realtime). Residents use my_announcements().
create policy "announcements staff read" on public.announcements for select to authenticated using (public.is_staff());
create policy "announcement reads own" on public.announcement_reads for select to authenticated using (user_id = auth.uid());

create or replace function private.announcement_live(a public.announcements)
returns boolean language sql stable set search_path = ''
as $$ select a.withdrawn_at is null and a.publish_at <= now() and (a.ends_at is null or a.ends_at > now()) $$;

create or replace function private.announcement_targets(a public.announcements, p_user uuid)
returns boolean language sql stable set search_path = ''
as $$ select a.target_kind = 'township' or a.target_area_ids && private.area_set(p_user) $$;

-- Active residents an announcement reaches.
create or replace function private.announcement_audience(p_id uuid)
returns setof uuid language sql stable set search_path = ''
as $$
  select p.id from public.announcements a
    join public.profiles p on p.township_id = a.township_id
    join public.profiles_private pp on pp.user_id = p.id
   where a.id = p_id and p.role in ('owner', 'sub_owner') and pp.status = 'active'
     and private.announcement_targets(a, p.id)
$$;

-- Bell (and simulated email for safety notices) for every announcement whose time has come.
-- Called when anyone reads notices, so scheduled publishing needs no server job.
create or replace function private.flush_due_announcements()
returns int language plpgsql security definer set search_path = ''
as $$
declare a public.announcements%rowtype; n int := 0;
begin
  for a in select * from public.announcements
            where notified_at is null and withdrawn_at is null and publish_at <= now()
              and (ends_at is null or ends_at > now())
            for update skip locked loop
    insert into public.notifications (user_id, kind, title, body, link)
    select u, 'announcement', a.source_label || ': ' || a.title, left(a.body, 140), '/app/announcements/' || a.id
      from private.announcement_audience(a.id) u;
    if a.category = 'safety' then
      insert into public.email_outbox (kind, recipient_user_id, to_email, subject, body, link)
      select 'announcement', u, pp.email, a.source_label || ': ' || a.title, a.body, '/app/announcements/' || a.id
        from private.announcement_audience(a.id) u join public.profiles_private pp on pp.user_id = u;
    end if;
    update public.announcements set notified_at = now() where id = a.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.my_announcements(p_id uuid default null, p_limit int default 50)
returns table (id uuid, category text, source_label text, title text, body text, target_kind text, area_names text[],
  lat double precision, lng double precision, pinned boolean, publish_at timestamptz, starts_at timestamptz,
  ends_at timestamptz, expired boolean, is_read boolean)
language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.is_active_member() or public.is_staff()) then raise exception 'forbidden'; end if;
  perform private.flush_due_announcements();
  return query
  select a.id, a.category, a.source_label, a.title, a.body, a.target_kind,
         (select coalesce(array_agg(ar.name order by ar.sort_order), '{}') from public.areas ar where ar.id = any(a.target_area_ids)),
         a.lat, a.lng, a.pinned, a.publish_at, a.starts_at, a.ends_at,
         not private.announcement_live(a),
         exists (select 1 from public.announcement_reads r where r.announcement_id = a.id and r.user_id = auth.uid())
    from public.announcements a
   where a.township_id = public.my_township()
     and a.withdrawn_at is null and a.publish_at <= now()
     and (public.is_staff() or private.announcement_targets(a, auth.uid()))
     and case when p_id is null then (a.ends_at is null or a.ends_at > now()) else a.id = p_id end
   order by a.pinned desc, a.publish_at desc
   limit least(greatest(p_limit, 1), 100);
end;
$$;

create or replace function public.mark_announcement_read(p_id uuid)
returns void language sql security definer set search_path = ''
as $$
  insert into public.announcement_reads (announcement_id, user_id)
  select p_id, auth.uid() where public.is_active_member()
  on conflict do nothing;
$$;

create or replace function public.publish_announcement(
  p_category text, p_source text, p_title text, p_body text, p_target_kind text, p_area_ids uuid[],
  p_publish_at timestamptz default null, p_starts_at timestamptz default null, p_ends_at timestamptz default null,
  p_pinned boolean default false, p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_n int;
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  if p_target_kind = 'areas' and exists (
       select 1 from unnest(coalesce(p_area_ids, '{}')) x
        where not exists (select 1 from public.areas a where a.id = x and a.township_id = public.my_township())) then
    raise exception 'invalid_area';
  end if;
  insert into public.announcements (township_id, category, source_label, title, body, target_kind, target_area_ids,
                                    lat, lng, pinned, publish_at, starts_at, ends_at, created_by)
  values (public.my_township(), p_category, coalesce(nullif(trim(p_source), ''), 'Township management'), trim(p_title), trim(p_body),
          p_target_kind, case when p_target_kind = 'areas' then coalesce(p_area_ids, '{}') else '{}' end,
          p_lat, p_lng, coalesce(p_pinned, false), coalesce(p_publish_at, now()), p_starts_at, p_ends_at, auth.uid())
  returning id into v_id;
  perform private.flush_due_announcements();
  select count(*) into v_n from private.announcement_audience(v_id);
  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), 'announcement_published', 'announcements', v_id, jsonb_build_object('category', p_category, 'audience', v_n));
  return jsonb_build_object('id', v_id, 'audience', v_n,
    'scheduled', coalesce(p_publish_at, now()) > now());
end;
$$;

create or replace function public.withdraw_announcement(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  update public.announcements set withdrawn_at = now() where id = p_id and township_id = public.my_township();
  insert into public.audit_log (actor_id, action, target_table, target_id) values (auth.uid(), 'announcement_withdrawn', 'announcements', p_id);
end;
$$;

create or replace function public.admin_announcements()
returns table (id uuid, category text, source_label text, title text, body text, target_kind text, area_names text[],
  pinned boolean, publish_at timestamptz, starts_at timestamptz, ends_at timestamptz, withdrawn_at timestamptz,
  state text, audience int, reads int, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.category, a.source_label, a.title, a.body, a.target_kind,
         (select coalesce(array_agg(ar.name order by ar.sort_order), '{}') from public.areas ar where ar.id = any(a.target_area_ids)),
         a.pinned, a.publish_at, a.starts_at, a.ends_at, a.withdrawn_at,
         case when a.withdrawn_at is not null then 'withdrawn' when a.publish_at > now() then 'scheduled'
              when a.ends_at is not null and a.ends_at <= now() then 'ended' else 'live' end,
         (select count(*)::int from private.announcement_audience(a.id)),
         (select count(*)::int from public.announcement_reads r where r.announcement_id = a.id),
         a.created_at
    from public.announcements a
   where public.is_staff() and a.township_id = public.my_township()
   order by a.publish_at desc
   limit 200
$$;

-- ---------------------------------------------------------------------------
-- Community posts, flat replies, "Helpful", reports, warnings
-- ---------------------------------------------------------------------------
create table public.community_posts (
  id               uuid primary key default gen_random_uuid(),
  township_id      uuid not null references public.townships(id),
  author_id        uuid references public.profiles(id) on delete cascade,
  type             text not null check (type in ('general', 'question', 'lost_found', 'recommendation', 'safety_tip')),
  body             text not null check (char_length(body) between 3 and 500),
  photo_path       text,
  area_id          uuid references public.areas(id),
  lat              double precision,
  lng              double precision,
  anonymous        boolean not null default false,
  bubble_until     timestamptz,
  moderation_state text not null default 'visible' check (moderation_state in ('visible', 'held', 'hidden')),
  held_reason      text,
  helpful_count    int not null default 0,
  reply_count      int not null default 0,
  report_count     int not null default 0,
  created_at       timestamptz not null default now(),
  is_demo          boolean not null default false
);
create index on public.community_posts (township_id, created_at desc);
create index on public.community_posts (author_id);

create table public.post_replies (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.community_posts(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 400),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on public.post_replies (post_id, created_at);

create table public.post_reactions (
  post_id     uuid not null references public.community_posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.content_reports (
  id           uuid primary key default gen_random_uuid(),
  township_id  uuid not null references public.townships(id),
  target_kind  text not null check (target_kind in ('post', 'reply')),
  target_id    uuid not null,
  reporter_id  uuid not null references public.profiles(id) on delete cascade,
  reason       text not null check (reason in ('spam', 'rude', 'unsafe', 'private_info', 'other')),
  note         text check (char_length(note) <= 300),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles(id) on delete set null,
  outcome      text,
  unique (target_kind, target_id, reporter_id)
);

create table public.user_warnings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  reason      text not null check (char_length(reason) between 3 and 300),
  issued_by   uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index on public.user_warnings (user_id, expires_at);

alter table public.community_posts enable row level security;
alter table public.post_replies    enable row level security;
alter table public.post_reactions  enable row level security;
alter table public.content_reports enable row level security;
alter table public.user_warnings   enable row level security;
-- Residents never read these tables directly (anonymous authors stay hidden); staff can.
create policy "posts staff read"    on public.community_posts for select to authenticated using (public.is_staff());
create policy "replies staff read"  on public.post_replies    for select to authenticated using (public.is_staff());
create policy "reports staff read"  on public.content_reports for select to authenticated using (public.is_staff());
create policy "warnings own or staff" on public.user_warnings for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- IC numbers and phone numbers in public posts are held so nobody's private details go out by accident.
create or replace function private.looks_private(p text)
returns boolean language sql immutable set search_path = ''
as $$
  select p ~ '\d{6}\s?-?\s?\d{2}\s?-?\s?\d{4}'                     -- MyKad number
      or p ~ '(\+?6?0)1\d[\s-]?\d{3,4}[\s-]?\d{4}'                  -- Malaysian mobile
$$;

create or replace function private.has_active_warning(p_user uuid)
returns boolean language sql stable set search_path = ''
as $$ select exists (select 1 from public.user_warnings w where w.user_id = p_user and w.expires_at > now()) $$;

create or replace function public.create_post(
  p_type text, p_body text, p_photo_path text default null, p_area_id uuid default null,
  p_lat double precision default null, p_lng double precision default null,
  p_anonymous boolean default false, p_bubble boolean default true)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_state text := 'visible'; v_reason text; v_area uuid := p_area_id;
begin
  if not public.is_active_member() or public.auth_role() not in ('owner', 'sub_owner') then raise exception 'forbidden'; end if;
  if private.hit_rate_limit('post_hour', auth.uid()::text, 6, interval '1 hour')
     or private.hit_rate_limit('post_day', auth.uid()::text, 30, interval '1 day') then raise exception 'rate_limited'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 3 then raise exception 'post_too_short'; end if;
  if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> auth.uid()::text then raise exception 'forbidden'; end if;
  if p_lat is not null and (p_lat not between 3.13 and 3.225 or p_lng not between 101.46 and 101.535) then
    raise exception 'outside_township';
  end if;
  if v_area is not null and not exists (select 1 from public.areas where id = v_area and township_id = public.my_township()) then
    raise exception 'invalid_area';
  end if;
  if v_area is null and p_lat is not null then v_area := public.nearest_area(p_lat, p_lng); end if;
  if v_area is null then v_area := (select home_area_id from public.profiles where id = auth.uid()); end if;

  if private.looks_private(p_body) then v_state := 'held'; v_reason := 'private_info';
  elsif private.has_active_warning(auth.uid()) then v_state := 'held'; v_reason := 'warning';
  end if;

  insert into public.community_posts (township_id, author_id, type, body, photo_path, area_id, lat, lng, anonymous,
                                      bubble_until, moderation_state, held_reason)
  values (public.my_township(), auth.uid(), p_type, trim(p_body), p_photo_path, v_area, p_lat, p_lng, coalesce(p_anonymous, false),
          case when coalesce(p_bubble, false) and v_state = 'visible' and p_lat is not null
               then now() + make_interval(hours => public.cfg_num('bubble_hours', 24)::int) end,
          v_state, v_reason)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'state', v_state, 'held_reason', v_reason);
end;
$$;

create or replace function public.community_feed(p_filter text default 'all', p_limit int default 50, p_id uuid default null)
returns table (id uuid, type text, body text, photo_path text, area_id uuid, area_name text, lat double precision,
  lng double precision, nickname text, avatar jsonb, is_mine boolean, anonymous boolean, state text, held_reason text,
  helpful_count int, reply_count int, i_helpful boolean, bubble_active boolean, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.type, c.body, c.photo_path, c.area_id, ar.name, c.lat, c.lng,
         case when c.anonymous and c.author_id is distinct from auth.uid() then null else p.nickname end,
         case when c.anonymous and c.author_id is distinct from auth.uid() then null else p.avatar_config end,
         c.author_id = auth.uid(), c.anonymous, c.moderation_state, c.held_reason, c.helpful_count, c.reply_count,
         exists (select 1 from public.post_reactions r where r.post_id = c.id and r.user_id = auth.uid()),
         coalesce(c.bubble_until > now(), false), c.created_at
    from public.community_posts c
    left join public.profiles p on p.id = c.author_id
    left join public.areas ar on ar.id = c.area_id
   where (public.is_active_member() or public.is_staff())
     and c.township_id = public.my_township()
     and (c.moderation_state = 'visible' or (c.author_id = auth.uid() and c.moderation_state = 'held') or public.is_staff())
     and case when p_id is not null then c.id = p_id
              when p_filter = 'neighbours' then c.area_id = any(private.area_set(auth.uid()))
              when p_filter = 'mine' then c.author_id = auth.uid()
              else true end
   order by c.created_at desc
   limit least(greatest(p_limit, 1), 100)
$$;

create or replace function public.post_replies_for(p_post uuid)
returns table (id uuid, body text, nickname text, avatar jsonb, is_mine boolean, is_staff boolean, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.body, p.nickname, p.avatar_config, r.author_id = auth.uid(), p.role in ('management', 'security'), r.created_at
    from public.post_replies r
    join public.community_posts c on c.id = r.post_id
    left join public.profiles p on p.id = r.author_id
   where r.post_id = p_post and not r.hidden and c.township_id = public.my_township()
     and (public.is_active_member() or public.is_staff())
     and (c.moderation_state = 'visible' or c.author_id = auth.uid() or public.is_staff())
   order by r.created_at
$$;

create or replace function public.reply_post(p_post uuid, p_body text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; c public.community_posts%rowtype;
begin
  if not (public.is_active_member() or public.is_staff()) then raise exception 'forbidden'; end if;
  if private.hit_rate_limit('reply', auth.uid()::text, 20, interval '1 hour') then raise exception 'rate_limited'; end if;
  select * into c from public.community_posts where id = p_post and township_id = public.my_township();
  if not found or c.moderation_state <> 'visible' then raise exception 'not_found'; end if;
  if private.looks_private(p_body) then raise exception 'private_info'; end if;
  insert into public.post_replies (post_id, author_id, body) values (p_post, auth.uid(), trim(p_body)) returning id into v_id;
  update public.community_posts set reply_count = reply_count + 1 where id = p_post;
  if c.author_id is distinct from auth.uid() then
    perform public.notify_user(c.author_id, 'post_reply',
      coalesce((select nickname from public.profiles where id = auth.uid()), 'A neighbour') || ' replied to your post',
      left(trim(p_body), 140), '/app/community/' || p_post);
  end if;
  return v_id;
end;
$$;

create or replace function public.toggle_helpful(p_post uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_on boolean; v_n int; c public.community_posts%rowtype;
begin
  if not public.is_active_member() then raise exception 'forbidden'; end if;
  select * into c from public.community_posts where id = p_post and township_id = public.my_township() and moderation_state = 'visible';
  if not found then raise exception 'not_found'; end if;
  if c.author_id = auth.uid() then raise exception 'own_post'; end if;
  delete from public.post_reactions where post_id = p_post and user_id = auth.uid();
  if found then v_on := false;
  else
    if private.hit_rate_limit('helpful', auth.uid()::text, 60, interval '1 hour') then raise exception 'rate_limited'; end if;
    insert into public.post_reactions (post_id, user_id) values (p_post, auth.uid());
    v_on := true;
  end if;
  update public.community_posts set helpful_count = (select count(*) from public.post_reactions where post_id = p_post)
   where id = p_post returning helpful_count into v_n;
  return jsonb_build_object('helpful', v_on, 'count', v_n);
end;
$$;

create or replace function public.delete_own_post(p_post uuid)
returns void language sql security definer set search_path = ''
as $$ update public.community_posts set moderation_state = 'hidden', held_reason = 'deleted_by_author', bubble_until = null
       where id = p_post and author_id = auth.uid() $$;

create or replace function public.report_content(p_kind text, p_id uuid, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_post uuid; v_n int; v_held boolean := false;
begin
  if not public.is_active_member() then raise exception 'forbidden'; end if;
  if private.hit_rate_limit('report', auth.uid()::text, 20, interval '1 day') then raise exception 'rate_limited'; end if;
  if p_kind = 'post' then v_post := p_id;
  else select post_id into v_post from public.post_replies where id = p_id; end if;
  if not exists (select 1 from public.community_posts where id = v_post and township_id = public.my_township()) then
    raise exception 'not_found';
  end if;
  insert into public.content_reports (township_id, target_kind, target_id, reporter_id, reason, note)
  values (public.my_township(), p_kind, p_id, auth.uid(), p_reason, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (target_kind, target_id, reporter_id) do nothing;
  if p_kind = 'post' then
    update public.community_posts
       set report_count = (select count(*) from public.content_reports r where r.target_kind = 'post' and r.target_id = p_id and r.resolved_at is null)
     where id = p_id returning report_count into v_n;
    if v_n >= public.cfg_num('post_reports_to_hold', 3) then
      update public.community_posts set moderation_state = 'held', held_reason = 'reports', bubble_until = null
       where id = p_id and moderation_state = 'visible';
      v_held := found;
      if v_held then
        insert into public.notifications (user_id, kind, title, body, link)
        select p.id, 'moderation', 'A post was held after ' || v_n || ' reports', 'Review it in Moderation.', '/admin/moderation'
          from public.profiles p join public.profiles_private pp on pp.user_id = p.id
         where p.role = 'management' and pp.status = 'active' and p.township_id = public.my_township();
      end if;
    end if;
  end if;
  return jsonb_build_object('held', v_held);
end;
$$;

create or replace function public.moderation_queue()
returns table (kind text, id uuid, post_id uuid, body text, author_id uuid, author_nickname text, anonymous boolean,
  state text, held_reason text, open_reports int, reasons text[], notes text[], author_warned boolean, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select 'post', c.id, c.id, c.body, c.author_id, p.nickname, c.anonymous, c.moderation_state, c.held_reason,
         (select count(*)::int from public.content_reports r where r.target_kind = 'post' and r.target_id = c.id and r.resolved_at is null),
         (select coalesce(array_agg(r.reason), '{}') from public.content_reports r where r.target_kind = 'post' and r.target_id = c.id and r.resolved_at is null),
         (select coalesce(array_agg(r.note) filter (where r.note is not null), '{}') from public.content_reports r where r.target_kind = 'post' and r.target_id = c.id and r.resolved_at is null),
         private.has_active_warning(c.author_id), c.created_at
    from public.community_posts c left join public.profiles p on p.id = c.author_id
   where public.is_management() and c.township_id = public.my_township()
     and (c.moderation_state = 'held'
          or exists (select 1 from public.content_reports r where r.target_kind = 'post' and r.target_id = c.id and r.resolved_at is null))
  union all
  select 'reply', r.id, r.post_id, r.body, r.author_id, p.nickname, false, case when r.hidden then 'hidden' else 'visible' end, null,
         (select count(*)::int from public.content_reports x where x.target_kind = 'reply' and x.target_id = r.id and x.resolved_at is null),
         (select coalesce(array_agg(x.reason), '{}') from public.content_reports x where x.target_kind = 'reply' and x.target_id = r.id and x.resolved_at is null),
         (select coalesce(array_agg(x.note) filter (where x.note is not null), '{}') from public.content_reports x where x.target_kind = 'reply' and x.target_id = r.id and x.resolved_at is null),
         private.has_active_warning(r.author_id), r.created_at
    from public.post_replies r left join public.profiles p on p.id = r.author_id
    join public.community_posts c on c.id = r.post_id
   where public.is_management() and c.township_id = public.my_township()
     and exists (select 1 from public.content_reports x where x.target_kind = 'reply' and x.target_id = r.id and x.resolved_at is null)
  order by 14 desc
$$;

-- hide = take down and tell the author; release = put back and close reports; dismiss = close reports only.
create or replace function public.moderate_content(p_kind text, p_id uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_author uuid; v_post uuid;
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  if p_action not in ('hide', 'release', 'dismiss') then raise exception 'invalid_action'; end if;
  if p_kind = 'post' then
    select author_id, id into v_author, v_post from public.community_posts where id = p_id and township_id = public.my_township();
  else
    select r.author_id, r.post_id into v_author, v_post from public.post_replies r
      join public.community_posts c on c.id = r.post_id where r.id = p_id and c.township_id = public.my_township();
  end if;
  if v_post is null then raise exception 'not_found'; end if;
  if p_action = 'hide' then
    if p_kind = 'post' then update public.community_posts set moderation_state = 'hidden', bubble_until = null where id = p_id;
    else update public.post_replies set hidden = true where id = p_id;
         update public.community_posts set reply_count = greatest(reply_count - 1, 0) where id = v_post; end if;
    perform public.notify_user(v_author, 'moderation', 'Your ' || p_kind || ' was removed',
      coalesce(nullif(trim(coalesce(p_note, '')), ''), 'It did not meet the community guidelines.'), '/app/community');
  elsif p_action = 'release' and p_kind = 'post' then
    update public.community_posts set moderation_state = 'visible', held_reason = null, report_count = 0 where id = p_id;
    perform public.notify_user(v_author, 'moderation', 'Your post is now visible', 'Township management reviewed it.', '/app/community/' || p_id);
  end if;
  update public.content_reports set resolved_at = now(), resolved_by = auth.uid(), outcome = p_action
   where target_kind = p_kind and target_id = p_id and resolved_at is null;
  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), 'moderation_' || p_action, case p_kind when 'post' then 'community_posts' else 'post_replies' end, p_id,
          jsonb_build_object('note', p_note));
end;
$$;

create or replace function public.warn_user(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.profiles where id = p_user and township_id = public.my_township() and role in ('owner', 'sub_owner')) then
    raise exception 'not_found';
  end if;
  insert into public.user_warnings (user_id, reason, issued_by, expires_at)
  values (p_user, trim(p_reason), auth.uid(), now() + make_interval(days => public.cfg_num('warning_days', 14)::int));
  perform public.notify_user(p_user, 'moderation', 'A note from township management',
    trim(p_reason) || ' For the next ' || public.cfg_num('warning_days', 14)::int || ' days your new posts are checked before they appear.', '/app/community');
  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), 'user_warned', 'profiles', p_user, jsonb_build_object('reason', p_reason));
end;
$$;

-- Speech bubbles on the map: visible posts with a pin, for 24 h. Anonymous ones carry no name.
create or replace function public.map_bubbles()
returns table (id uuid, type text, snippet text, nickname text, avatar jsonb, lat double precision, lng double precision,
  is_mine boolean, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.type, left(c.body, 80),
         case when c.anonymous and c.author_id is distinct from auth.uid() then null else p.nickname end,
         case when c.anonymous and c.author_id is distinct from auth.uid() then null else p.avatar_config end,
         round(c.lat::numeric, 4)::double precision, round(c.lng::numeric, 4)::double precision,
         c.author_id = auth.uid(), c.created_at
    from public.community_posts c left join public.profiles p on p.id = c.author_id
   where (public.is_active_member() or public.is_staff()) and c.township_id = public.my_township()
     and c.moderation_state = 'visible' and c.bubble_until > now() and c.lat is not null
   order by c.created_at desc limit 60
$$;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create table public.events (
  id              uuid primary key default gen_random_uuid(),
  township_id     uuid not null references public.townships(id),
  title           text not null check (char_length(title) between 4 and 100),
  description     text not null check (char_length(description) between 10 and 2000),
  kind            text not null default 'community' check (kind in ('community', 'official')),
  host_id         uuid references public.profiles(id) on delete set null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  location_name   text not null check (char_length(location_name) between 2 and 120),
  lat             double precision not null,
  lng             double precision not null,
  area_id         uuid references public.areas(id),
  capacity        int check (capacity is null or capacity between 2 and 2000),
  approval_state  text not null default 'pending' check (approval_state in ('pending', 'approved', 'rejected', 'cancelled')),
  reject_reason   text,
  decided_by      uuid references public.profiles(id) on delete set null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  is_demo         boolean not null default false,
  check (ends_at > starts_at)
);
create index on public.events (township_id, starts_at);

create table private.event_codes (
  event_id  uuid primary key references public.events(id) on delete cascade,
  code      text not null
);

create table public.rsvps (
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  status      text not null check (status in ('going', 'interested')),
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.event_checkins (
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  method      text not null check (method in ('distance', 'code')),
  at          timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.events          enable row level security;
alter table public.rsvps           enable row level security;
alter table public.event_checkins  enable row level security;
create policy "events readable" on public.events for select to authenticated
  using (township_id = public.my_township()
         and ((approval_state = 'approved' and public.is_active_member()) or host_id = auth.uid() or public.is_staff()));
create policy "rsvps own or staff" on public.rsvps for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy "checkins own or staff" on public.event_checkins for select to authenticated using (user_id = auth.uid() or public.is_staff());

create or replace function private.new_event_code(p_event uuid)
returns text language plpgsql set search_path = ''
as $$
declare v text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  insert into private.event_codes (event_id, code) values (p_event, v)
  on conflict (event_id) do update set code = excluded.code;
  return v;
end;
$$;

create or replace function public.events_list(p_scope text default 'upcoming', p_id uuid default null)
returns table (id uuid, title text, description text, kind text, starts_at timestamptz, ends_at timestamptz,
  location_name text, lat double precision, lng double precision, area_name text, capacity int,
  going_count int, interested_count int, checked_in_count int, my_rsvp text, checked_in boolean,
  host_nickname text, host_avatar jsonb, is_host boolean, approval_state text, reject_reason text, is_full boolean)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.title, e.description, e.kind, e.starts_at, e.ends_at, e.location_name, e.lat, e.lng, ar.name, e.capacity,
         (select count(*)::int from public.rsvps r where r.event_id = e.id and r.status = 'going'),
         (select count(*)::int from public.rsvps r where r.event_id = e.id and r.status = 'interested'),
         (select count(*)::int from public.event_checkins c where c.event_id = e.id),
         (select r.status from public.rsvps r where r.event_id = e.id and r.user_id = auth.uid()),
         exists (select 1 from public.event_checkins c where c.event_id = e.id and c.user_id = auth.uid()),
         case when e.kind = 'official' then 'Township management' else p.nickname end,
         case when e.kind = 'official' then null else p.avatar_config end,
         e.host_id = auth.uid(), e.approval_state, e.reject_reason,
         e.capacity is not null and (select count(*) from public.rsvps r where r.event_id = e.id and r.status = 'going') >= e.capacity
    from public.events e
    left join public.profiles p on p.id = e.host_id
    left join public.areas ar on ar.id = e.area_id
   where e.township_id = public.my_township()
     and (public.is_active_member() or public.is_staff())
     and (e.approval_state = 'approved' or e.host_id = auth.uid() or public.is_staff())
     and case when p_id is not null then e.id = p_id
              when p_scope = 'upcoming' then e.approval_state = 'approved' and e.ends_at > now()
              when p_scope = 'past' then e.approval_state = 'approved' and e.ends_at <= now()
              when p_scope = 'mine' then e.host_id = auth.uid()
                     or exists (select 1 from public.rsvps r where r.event_id = e.id and r.user_id = auth.uid())
              when p_scope = 'pending' then e.approval_state = 'pending'
              else true end
   order by case when p_scope = 'past' then extract(epoch from e.starts_at) * -1 else extract(epoch from e.starts_at) end
   limit 100
$$;

create or replace function public.create_event(
  p_title text, p_description text, p_starts_at timestamptz, p_ends_at timestamptz, p_location_name text,
  p_lat double precision, p_lng double precision, p_capacity int default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_staff boolean := public.is_management(); v_state text; v_code text;
begin
  if not (public.is_active_member() and (v_staff or public.auth_role() in ('owner', 'sub_owner'))) then raise exception 'forbidden'; end if;
  if private.hit_rate_limit('event_day', auth.uid()::text, 3, interval '1 day') and not v_staff then raise exception 'rate_limited'; end if;
  if p_starts_at < now() + interval '1 hour' then raise exception 'event_too_soon'; end if;
  if p_starts_at > now() + interval '90 days' then raise exception 'event_too_far'; end if;
  if p_ends_at <= p_starts_at or p_ends_at > p_starts_at + interval '12 hours' then raise exception 'event_bad_end'; end if;
  if p_lat not between 3.13 and 3.225 or p_lng not between 101.46 and 101.535 then raise exception 'outside_township'; end if;
  -- Residents' events wait for management unless event_approval_required is switched off
  v_state := case when v_staff or coalesce((select value #>> '{}' from public.app_config where key = 'event_approval_required'), 'true') = 'false'
                  then 'approved' else 'pending' end;
  insert into public.events (township_id, title, description, kind, host_id, starts_at, ends_at, location_name, lat, lng,
                             area_id, capacity, approval_state, decided_at)
  values (public.my_township(), trim(p_title), trim(p_description), case when v_staff then 'official' else 'community' end,
          auth.uid(), p_starts_at, p_ends_at, trim(p_location_name), p_lat, p_lng, public.nearest_area(p_lat, p_lng),
          p_capacity, v_state, case when v_state = 'approved' then now() end)
  returning id into v_id;
  if v_state = 'approved' then
    v_code := private.new_event_code(v_id);
    insert into public.rsvps (event_id, user_id, status) values (v_id, auth.uid(), 'going') on conflict do nothing;
  else
    insert into public.notifications (user_id, kind, title, body, link)
    select p.id, 'event_pending', 'New event waiting for approval', trim(p_title), '/admin/events'
      from public.profiles p join public.profiles_private pp on pp.user_id = p.id
     where p.role = 'management' and pp.status = 'active' and p.township_id = public.my_township();
  end if;
  return jsonb_build_object('id', v_id, 'approval_state', v_state);
end;
$$;

-- p_status: 'going', 'interested', or null to remove
create or replace function public.rsvp_event(p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare e public.events%rowtype; v_going int;
begin
  if not public.is_active_member() then raise exception 'forbidden'; end if;
  select * into e from public.events where id = p_id and township_id = public.my_township() for update;
  if not found or e.approval_state <> 'approved' then raise exception 'not_found'; end if;
  if e.ends_at <= now() then raise exception 'event_over'; end if;
  if p_status is null then
    delete from public.rsvps where event_id = p_id and user_id = auth.uid();
  else
    if p_status = 'going' and e.capacity is not null
       and (select count(*) from public.rsvps where event_id = p_id and status = 'going' and user_id <> auth.uid()) >= e.capacity then
      raise exception 'event_full';
    end if;
    insert into public.rsvps (event_id, user_id, status) values (p_id, auth.uid(), p_status)
    on conflict (event_id, user_id) do update set status = excluded.status, created_at = now();
  end if;
  select count(*) into v_going from public.rsvps where event_id = p_id and status = 'going';
  return jsonb_build_object('my_rsvp', p_status, 'going_count', v_going);
end;
$$;

-- Check-in window: 30 minutes before the start until the end. Near enough, or the 6-digit code from the host.
create or replace function public.check_in_event(p_id uuid, p_lat double precision default null, p_lng double precision default null,
                                                 p_code text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare e public.events%rowtype; v_method text; v_dist numeric;
begin
  if not public.is_active_member() then raise exception 'forbidden'; end if;
  if private.hit_rate_limit('event_checkin', auth.uid()::text, 10, interval '10 minutes') then raise exception 'rate_limited'; end if;
  select * into e from public.events where id = p_id and township_id = public.my_township();
  if not found or e.approval_state <> 'approved' then raise exception 'not_found'; end if;
  if now() < e.starts_at - interval '30 minutes' then raise exception 'checkin_not_open'; end if;
  if now() > e.ends_at then raise exception 'event_over'; end if;
  if exists (select 1 from public.event_checkins where event_id = p_id and user_id = auth.uid()) then
    return jsonb_build_object('method', 'already');
  end if;
  if nullif(trim(coalesce(p_code, '')), '') is not null then
    if not exists (select 1 from private.event_codes where event_id = p_id and code = trim(p_code)) then raise exception 'wrong_code'; end if;
    v_method := 'code';
  elsif p_lat is not null then
    v_dist := public.geo_distance_m(p_lat, p_lng, e.lat, e.lng);
    if v_dist > public.cfg_num('event_checkin_radius_m', 300) then raise exception 'too_far_checkin'; end if;
    v_method := 'distance';
  else
    raise exception 'checkin_need_location';
  end if;
  insert into public.event_checkins (event_id, user_id, method) values (p_id, auth.uid(), v_method);
  insert into public.rsvps (event_id, user_id, status) values (p_id, auth.uid(), 'going')
  on conflict (event_id, user_id) do update set status = 'going';
  return jsonb_build_object('method', v_method);
end;
$$;

create or replace function public.event_code(p_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select c.code from private.event_codes c join public.events e on e.id = c.event_id
   where c.event_id = p_id and e.township_id = public.my_township()
     and (e.host_id = auth.uid() or public.is_staff())
$$;

create or replace function public.decide_event(p_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare e public.events%rowtype;
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  update public.events set approval_state = case when p_approve then 'approved' else 'rejected' end,
         reject_reason = case when p_approve then null else nullif(trim(coalesce(p_reason, '')), '') end,
         decided_by = auth.uid(), decided_at = now()
   where id = p_id and township_id = public.my_township() and approval_state = 'pending'
  returning * into e;
  if not found then raise exception 'not_found'; end if;
  if p_approve then
    perform private.new_event_code(p_id);
    insert into public.rsvps (event_id, user_id, status) values (p_id, e.host_id, 'going') on conflict do nothing;
  end if;
  perform public.notify_user(e.host_id, 'event_decision',
    case when p_approve then 'Your event is approved: ' || e.title else 'Your event was not approved: ' || e.title end,
    case when p_approve then 'It is now on the map and in Events. Your check-in code is on the event page.'
         else coalesce(e.reject_reason, 'Township management could not approve it this time.') end,
    '/app/events/' || p_id);
  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), case when p_approve then 'event_approved' else 'event_rejected' end, 'events', p_id, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.cancel_event(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare e public.events%rowtype;
begin
  select * into e from public.events where id = p_id and township_id = public.my_township();
  if not found or not (e.host_id = auth.uid() or public.is_management()) then raise exception 'forbidden'; end if;
  if e.approval_state = 'cancelled' then return; end if;
  update public.events set approval_state = 'cancelled', reject_reason = nullif(trim(coalesce(p_reason, '')), '') where id = p_id;
  insert into public.notifications (user_id, kind, title, body, link)
  select r.user_id, 'event_cancelled', 'Event cancelled: ' || e.title, coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'The organiser cancelled it.'),
         '/app/events/' || p_id
    from public.rsvps r where r.event_id = p_id and r.user_id is distinct from auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Weekly newsletter: built from what actually happened, reviewed by management, then sent
-- ---------------------------------------------------------------------------
create table public.newsletters (
  id            uuid primary key default gen_random_uuid(),
  township_id   uuid not null references public.townships(id),
  week_start    date not null,
  title         text not null check (char_length(title) between 4 and 120),
  intro         text check (char_length(intro) <= 1000),
  sections      jsonb not null default '{}'::jsonb,
  status        text not null default 'draft' check (status in ('draft', 'published')),
  published_at  timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (township_id, week_start)
);

create table public.newsletter_reads (
  newsletter_id  uuid not null references public.newsletters(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  read_at        timestamptz not null default now(),
  primary key (newsletter_id, user_id)
);

alter table public.newsletters      enable row level security;
alter table public.newsletter_reads enable row level security;
create policy "newsletters readable" on public.newsletters for select to authenticated
  using (township_id = public.my_township() and ((status = 'published' and public.is_active_member()) or public.is_staff()));
create policy "newsletter reads own" on public.newsletter_reads for select to authenticated using (user_id = auth.uid());

create or replace function private.build_newsletter(p_town uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'announcements', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'source', a.source_label, 'category', a.category) order by a.publish_at desc)
        from public.announcements a where a.township_id = p_town and a.withdrawn_at is null and a.category not in ('maintenance')
         and a.publish_at between p_from and p_to), '[]'::jsonb),
    'maintenance', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'source', a.source_label, 'starts_at', a.starts_at, 'ends_at', a.ends_at) order by a.publish_at desc)
        from public.announcements a where a.township_id = p_town and a.withdrawn_at is null and a.category = 'maintenance'
         and (a.publish_at between p_from and p_to or (a.starts_at between p_to and p_to + interval '14 days'))), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'location', e.location_name) order by e.starts_at)
        from public.events e where e.township_id = p_town and e.approval_state = 'approved'
         and e.starts_at between p_to and p_to + interval '14 days'), '[]'::jsonb),
    'resolved', jsonb_build_object(
        'count', (select count(*) from public.issues i where i.township_id = p_town and i.status = 'resolved' and i.resolved_at between p_from and p_to),
        'items', coalesce((select jsonb_agg(x order by x->>'resolved_at' desc) from (
            select jsonb_build_object('id', i.id, 'ref_no', i.ref_no, 'category', i.category,
                   'area', (select name from public.areas where id = i.area_id), 'resolved_at', i.resolved_at) x
              from public.issues i where i.township_id = p_town and i.status = 'resolved' and i.resolved_at between p_from and p_to
             order by i.resolved_at desc limit 5) s), '[]'::jsonb)),
    'top_posts', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('id', c.id, 'snippet', left(c.body, 120), 'helpful', c.helpful_count, 'replies', c.reply_count,
               'nickname', case when c.anonymous then null else (select nickname from public.profiles where id = c.author_id) end) x
          from public.community_posts c where c.township_id = p_town and c.moderation_state = 'visible'
           and c.created_at between p_from and p_to
         order by c.helpful_count desc, c.reply_count desc, c.created_at desc limit 3) s), '[]'::jsonb),
    'from', p_from, 'to', p_to)
$$;

create or replace function public.draft_newsletter()
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_week date := date_trunc('week', now() at time zone 'Asia/Kuala_Lumpur')::date; v_id uuid; v_status text;
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  select id, status into v_id, v_status from public.newsletters where township_id = public.my_township() and week_start = v_week;
  if v_status = 'published' then raise exception 'already_published'; end if;
  insert into public.newsletters (township_id, week_start, title, intro, sections, created_by)
  values (public.my_township(), v_week, 'This week in City of Elmina',
          'Here is what happened around the township this week, and what is coming up.',
          private.build_newsletter(public.my_township(), now() - interval '7 days', now()), auth.uid())
  on conflict (township_id, week_start) do update set sections = excluded.sections
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_newsletter(p_id uuid, p_title text, p_intro text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  update public.newsletters set title = trim(p_title), intro = nullif(trim(coalesce(p_intro, '')), '')
   where id = p_id and township_id = public.my_township() and status = 'draft';
  if not found then raise exception 'not_found'; end if;
end;
$$;

create or replace function public.publish_newsletter(p_id uuid)
returns int language plpgsql security definer set search_path = ''
as $$
declare n public.newsletters%rowtype; v_count int;
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  update public.newsletters set status = 'published', published_at = now()
   where id = p_id and township_id = public.my_township() and status = 'draft' returning * into n;
  if not found then raise exception 'not_found'; end if;
  with aud as (
    select p.id, pp.email from public.profiles p join public.profiles_private pp on pp.user_id = p.id
     where p.township_id = n.township_id and p.role in ('owner', 'sub_owner') and pp.status = 'active'),
  bell as (
    insert into public.notifications (user_id, kind, title, body, link)
    select id, 'newsletter', n.title, coalesce(n.intro, 'The weekly newsletter is out.'), '/app/newsletter/' || n.id from aud
    returning 1),
  mail as (
    insert into public.email_outbox (kind, recipient_user_id, to_email, subject, body, link)
    select 'newsletter', id, email, n.title,
           coalesce(n.intro, '') || E'\n\n' ||
           'Announcements: ' || jsonb_array_length(n.sections->'announcements') || E'\n' ||
           'Maintenance: ' || jsonb_array_length(n.sections->'maintenance') || E'\n' ||
           'Coming up: ' || jsonb_array_length(n.sections->'events') || ' events' || E'\n' ||
           'Fixed this week: ' || coalesce(n.sections->'resolved'->>'count', '0') || ' reports',
           '/app/newsletter/' || n.id from aud
    returning 1)
  select count(*) into v_count from bell;
  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), 'newsletter_published', 'newsletters', p_id, jsonb_build_object('recipients', v_count));
  return v_count;
end;
$$;

create or replace function public.newsletters_for_me()
returns table (id uuid, week_start date, title text, intro text, sections jsonb, status text, published_at timestamptz,
  is_read boolean, readers int, audience int)
language sql stable security definer set search_path = ''
as $$
  select n.id, n.week_start, n.title, n.intro, n.sections, n.status, n.published_at,
         exists (select 1 from public.newsletter_reads r where r.newsletter_id = n.id and r.user_id = auth.uid()),
         case when public.is_staff() then (select count(*)::int from public.newsletter_reads r where r.newsletter_id = n.id) end,
         case when public.is_staff() then (select count(*)::int from public.profiles p join public.profiles_private pp on pp.user_id = p.id
                                           where p.township_id = n.township_id and p.role in ('owner', 'sub_owner') and pp.status = 'active') end
    from public.newsletters n
   where n.township_id = public.my_township()
     and ((n.status = 'published' and public.is_active_member()) or public.is_staff())
   order by n.week_start desc
   limit 20
$$;

create or replace function public.mark_newsletter_read(p_id uuid)
returns void language sql security definer set search_path = ''
as $$
  insert into public.newsletter_reads (newsletter_id, user_id)
  select p_id, auth.uid() where public.is_active_member()
     and exists (select 1 from public.newsletters where id = p_id and status = 'published' and township_id = public.my_township())
  on conflict do nothing;
$$;

-- ---------------------------------------------------------------------------
-- Analytics-lite: the outcome numbers the pitch needs (fewer follow-ups, faster resolution)
-- ---------------------------------------------------------------------------
create or replace function public.analytics_summary(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_from timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365))); v_town uuid := public.my_township(); r jsonb;
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  with iss as (
    select i.*,
           (select min(h.created_at) from public.issue_status_history h where h.issue_id = i.id and h.status <> 'submitted') ack_at,
           (select count(*) from public.issue_comments c join public.profiles p on p.id = c.author_id
             where c.issue_id = i.id and p.role in ('owner', 'sub_owner')) resident_comments
      from public.issues i where i.township_id = v_town and i.created_at >= v_from and i.merged_into is null
  ), sos as (
    select e.*, (select min(ev.at) from public.emergency_events ev where ev.emergency_id = e.id and ev.by_staff) first_staff
      from public.emergencies e where e.township_id = v_town and e.created_at >= v_from
  )
  select jsonb_build_object(
    'days', p_days,
    'issues', (select jsonb_build_object(
        'reported', count(*),
        'resolved', count(*) filter (where status = 'resolved'),
        'open', (select count(*) from public.issues where township_id = v_town and status in ('submitted', 'acknowledged', 'assigned', 'in_progress')),
        'median_ack_hours', round((percentile_cont(0.5) within group (order by extract(epoch from ack_at - created_at) / 3600)
                                    filter (where ack_at is not null))::numeric, 1),
        'median_resolve_days', round((percentile_cont(0.5) within group (order by extract(epoch from resolved_at - created_at) / 86400)
                                    filter (where status = 'resolved'))::numeric, 1),
        'followups_per_issue', round(coalesce(avg(resident_comments), 0)::numeric, 2),
        'reopened', count(*) filter (where reopened_count > 0),
        'avg_rating', (select round(avg(f.rating)::numeric, 1) from public.issue_feedback f join iss on iss.id = f.issue_id where f.rating is not null),
        'confirmed_fixed', (select count(*) from public.issue_feedback f join iss on iss.id = f.issue_id where f.fixed),
        'not_fixed', (select count(*) from public.issue_feedback f join iss on iss.id = f.issue_id where not f.fixed)
      ) from iss),
    'by_category', coalesce((select jsonb_agg(x order by (x->>'reported')::int desc) from (
        select jsonb_build_object('category', category, 'reported', count(*), 'resolved', count(*) filter (where status = 'resolved'),
               'median_resolve_days', round((percentile_cont(0.5) within group (order by extract(epoch from resolved_at - created_at) / 86400)
                                             filter (where status = 'resolved'))::numeric, 1)) x
          from iss group by category) s), '[]'::jsonb),
    'weekly', coalesce((select jsonb_agg(jsonb_build_object('week', w::date,
        'reported', (select count(*) from public.issues i where i.township_id = v_town and i.created_at >= w and i.created_at < w + interval '7 days'),
        'resolved', (select count(*) from public.issues i where i.township_id = v_town and i.resolved_at >= w and i.resolved_at < w + interval '7 days'))
        order by w)
        from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '7 days') w), '[]'::jsonb),
    'sos', (select jsonb_build_object(
        'total', count(*),
        'false_alarms', count(*) filter (where status = 'false_alarm'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'median_minutes_to_staff', round((percentile_cont(0.5) within group (order by extract(epoch from first_staff - created_at) / 60)
                                          filter (where first_staff is not null))::numeric, 1)) from sos),
    'community', jsonb_build_object(
        'posts', (select count(*) from public.community_posts where township_id = v_town and created_at >= v_from and moderation_state <> 'hidden'),
        'replies', (select count(*) from public.post_replies r join public.community_posts c on c.id = r.post_id
                     where c.township_id = v_town and r.created_at >= v_from and not r.hidden),
        'held', (select count(*) from public.community_posts where township_id = v_town and moderation_state = 'held'),
        'events', (select count(*) from public.events where township_id = v_town and approval_state = 'approved' and starts_at >= v_from),
        'rsvps', (select count(*) from public.rsvps r join public.events e on e.id = r.event_id where e.township_id = v_town and r.created_at >= v_from),
        'checkins', (select count(*) from public.event_checkins c join public.events e on e.id = c.event_id where e.township_id = v_town and c.at >= v_from),
        'active_residents', (select count(distinct u) from (
            select reporter_id u from public.issues where township_id = v_town and created_at >= v_from
            union select v.user_id from public.issue_votes v join public.issues i on i.id = v.issue_id where i.township_id = v_town and v.created_at >= v_from
            union select author_id from public.community_posts where township_id = v_town and created_at >= v_from
            union select r.user_id from public.rsvps r join public.events e on e.id = r.event_id where e.township_id = v_town and r.created_at >= v_from) z
            where u is not null),
        'residents', (select count(*) from public.profiles p join public.profiles_private pp on pp.user_id = p.id
                       where p.township_id = v_town and p.role in ('owner', 'sub_owner') and pp.status = 'active')),
    'newsletter', (select jsonb_build_object('title', n.title, 'published_at', n.published_at,
        'reads', (select count(*) from public.newsletter_reads r where r.newsletter_id = n.id))
        from public.newsletters n where n.township_id = v_town and n.status = 'published' order by n.published_at desc limit 1),
    'baseline', (select value from public.app_config where key = 'analytics_baseline'),
    'demo_share', (select count(*) filter (where is_demo) from public.issues where township_id = v_town and created_at >= v_from)
  ) into r;
  return r;
end;
$$;

create or replace function public.set_analytics_baseline(p jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  update public.app_config set value = jsonb_build_object(
      'ack_hours', p->'ack_hours', 'resolve_days', p->'resolve_days', 'followups', p->'followups',
      'source', coalesce(nullif(trim(p->>'source'), ''), 'Not stated'))
   where key = 'analytics_baseline';
  insert into public.audit_log (actor_id, action, target_table, data) values (auth.uid(), 'analytics_baseline', 'app_config', p);
end;
$$;

-- ---------------------------------------------------------------------------
-- The ordered feed now has all three tiers:
--   1 active emergencies, newest first
--   2 live safety and maintenance notices for my areas, pinned first then newest
--   3 open issues by priority, then the next week's events
-- ---------------------------------------------------------------------------
create or replace function public.feed_ordered(p_limit int default 50)
returns table (kind text, id uuid, tier int, ref_no text, title text, area_name text,
  lat double precision, lng double precision, level text, status text, score numeric, created_at timestamptz, rank_no int)
language sql stable security definer set search_path = ''
as $$
  with items as (
    select 'emergency'::text kind, e.id, 1 tier, e.ref_no, public.sos_type_word(e.type) title, e.area_name,
           e.lat, e.lng, 'urgent'::text level, e.status::text status, null::numeric score, e.created_at, 0 sub
      from public.active_emergencies() e
    union all
    select 'notice', a.id, 2, a.category, a.title,
           (select string_agg(ar.name, ', ' order by ar.sort_order) from public.areas ar where ar.id = any(a.target_area_ids)),
           a.lat, a.lng, case when a.category = 'safety' then 'high' else 'medium' end, a.category,
           null, a.publish_at, case when a.pinned then 0 else 1 end
      from public.announcements a
     where a.township_id = public.my_township() and a.category in ('safety', 'maintenance')
       and private.announcement_live(a)
       and (public.is_staff() or private.announcement_targets(a, auth.uid()))
    union all
    select 'issue', i.id, 3, i.ref_no, i.category, i.area_name, i.lat, i.lng,
           case when i.p >= 75 then 'urgent' when i.p >= 55 then 'high' when i.p >= 40 then 'medium' else 'low' end,
           i.status::text, i.p, i.created_at, 0
      from public.issue_feed('open', 200) i
    union all
    select 'event', e.id, 3, to_char(e.starts_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'), e.title, e.location_name,
           e.lat, e.lng, 'low', e.kind, null, e.starts_at, 1
      from public.events e
     where e.township_id = public.my_township() and e.approval_state = 'approved'
       and e.ends_at > now() and e.starts_at < now() + interval '7 days'
       and (public.is_active_member() or public.is_staff())
  )
  select kind, id, tier, ref_no, title, area_name, lat, lng, level, status, score, created_at,
         (row_number() over (order by tier, sub,
                             case when tier in (1, 2) then extract(epoch from created_at) end desc nulls last,
                             score desc nulls last,
                             case when kind = 'event' then extract(epoch from created_at) end asc nulls last,
                             created_at desc))::int
    from items
   order by 13
   limit greatest(1, least(p_limit, 200))
$$;

-- ---------------------------------------------------------------------------
-- Grants. Everything above is called by signed-in users; helpers in private are never exposed.
-- ---------------------------------------------------------------------------
revoke all on function private.area_set(uuid), private.announcement_live(public.announcements),
  private.announcement_targets(public.announcements, uuid), private.announcement_audience(uuid),
  private.flush_due_announcements(), private.looks_private(text), private.has_active_warning(uuid),
  private.new_event_code(uuid), private.build_newsletter(uuid, timestamptz, timestamptz) from public, anon, authenticated;

revoke execute on function public.my_announcements(uuid, int), public.mark_announcement_read(uuid),
  public.publish_announcement(text, text, text, text, text, uuid[], timestamptz, timestamptz, timestamptz, boolean, double precision, double precision),
  public.withdraw_announcement(uuid), public.admin_announcements(),
  public.create_post(text, text, text, uuid, double precision, double precision, boolean, boolean),
  public.community_feed(text, int, uuid), public.post_replies_for(uuid), public.reply_post(uuid, text), public.toggle_helpful(uuid),
  public.delete_own_post(uuid), public.report_content(text, uuid, text, text), public.moderation_queue(),
  public.moderate_content(text, uuid, text, text), public.warn_user(uuid, text), public.map_bubbles(),
  public.events_list(text, uuid), public.create_event(text, text, timestamptz, timestamptz, text, double precision, double precision, int),
  public.rsvp_event(uuid, text), public.check_in_event(uuid, double precision, double precision, text), public.event_code(uuid),
  public.decide_event(uuid, boolean, text), public.cancel_event(uuid, text),
  public.draft_newsletter(), public.update_newsletter(uuid, text, text), public.publish_newsletter(uuid),
  public.newsletters_for_me(), public.mark_newsletter_read(uuid),
  public.analytics_summary(int), public.set_analytics_baseline(jsonb), public.trg_area_follow_limit()
  from public, anon;
grant execute on function public.my_announcements(uuid, int), public.mark_announcement_read(uuid),
  public.publish_announcement(text, text, text, text, text, uuid[], timestamptz, timestamptz, timestamptz, boolean, double precision, double precision),
  public.withdraw_announcement(uuid), public.admin_announcements(),
  public.create_post(text, text, text, uuid, double precision, double precision, boolean, boolean),
  public.community_feed(text, int, uuid), public.post_replies_for(uuid), public.reply_post(uuid, text), public.toggle_helpful(uuid),
  public.delete_own_post(uuid), public.report_content(text, uuid, text, text), public.moderation_queue(),
  public.moderate_content(text, uuid, text, text), public.warn_user(uuid, text), public.map_bubbles(),
  public.events_list(text, uuid), public.create_event(text, text, timestamptz, timestamptz, text, double precision, double precision, int),
  public.rsvp_event(uuid, text), public.check_in_event(uuid, double precision, double precision, text), public.event_code(uuid),
  public.decide_event(uuid, boolean, text), public.cancel_event(uuid, text),
  public.draft_newsletter(), public.update_newsletter(uuid, text, text), public.publish_newsletter(uuid),
  public.newsletters_for_me(), public.mark_newsletter_read(uuid),
  public.analytics_summary(int), public.set_analytics_baseline(jsonb)
  to authenticated;

-- Live updates: staff see new posts/reports/notices at once; residents poll (their reads go through functions).
alter publication supabase_realtime add table public.announcements, public.community_posts, public.events;
