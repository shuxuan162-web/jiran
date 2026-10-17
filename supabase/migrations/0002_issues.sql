-- Jiran · 0002_issues
-- Issues (complaints), upvotes, priority queue, status history, comments,
-- resolution feedback and in-app notifications.
-- Priority P = 0.40·S + 0.25·U + 0.20·A + 0.15·T, each 0-100, weights in app_config.
-- T is computed at read time, so scores stay current without any scheduler.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Great-circle distance in metres (no PostGIS needed at this scale)
create or replace function public.geo_distance_m(lat1 double precision, lng1 double precision,
                                                 lat2 double precision, lng2 double precision)
returns double precision
language sql immutable parallel safe set search_path = ''
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

create or replace function public.cfg_num(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = ''
as $$ select coalesce((select (value #>> '{}')::numeric from public.app_config where key = p_key), p_default) $$;

-- ---------------------------------------------------------------------------
-- Categories and severity rules
-- ---------------------------------------------------------------------------
create table public.issue_categories (
  slug           text primary key,
  name_en        text not null,
  name_bm        text not null,
  base_severity  int  not null check (base_severity between 0 and 100),
  icon           text not null default 'alert',
  sort_order     int  not null default 0
);

insert into public.issue_categories (slug, name_en, name_bm, base_severity, icon, sort_order) values
 ('drain_flood',  'Drain or flooding',            'Longkang / banjir',        70, 'drop',   1),
 ('road',         'Road or pothole',              'Jalan / lubang',           55, 'road',   2),
 ('streetlight',  'Street light',                 'Lampu jalan',              50, 'bulb',   3),
 ('water',        'Water supply',                 'Bekalan air',              65, 'tap',    4),
 ('electrical',   'Electrical or exposed wires',  'Elektrik / wayar terdedah', 85, 'bolt', 5),
 ('tree',         'Fallen tree or branch',        'Pokok tumbang',            60, 'tree',   6),
 ('waste',        'Rubbish or illegal dumping',   'Sampah / pembuangan haram', 40, 'trash', 7),
 ('park',         'Park or playground',           'Taman / taman permainan',  35, 'park',   8),
 ('security',     'Security concern',             'Keselamatan',              60, 'shield', 9),
 ('pest',         'Pests or mosquitoes',          'Serangga / nyamuk',        50, 'bug',   10),
 ('noise',        'Noise',                        'Bunyi bising',             25, 'sound', 11),
 ('other',        'Something else',               'Lain-lain',                30, 'dots',  12)
on conflict (slug) do update set name_en = excluded.name_en, name_bm = excluded.name_bm,
  base_severity = excluded.base_severity, icon = excluded.icon, sort_order = excluded.sort_order;

-- Keyword boosts: each matching rule adds its boost once; result capped at 100.
create table public.severity_keywords (
  pattern  text primary key,   -- case-insensitive regex
  boost    int  not null
);
insert into public.severity_keywords (pattern, boost) values
 ('spark|exposed|live wire|wayar|electrocut|renjatan', 20),
 ('fire|smoke|api|asap|burn', 20),
 ('flood|banjir|overflow|melimpah|rising water', 15),
 ('child|children|kids|kanak|budak|school|sekolah', 10),
 ('injur|hurt|accident|cedera|kemalangan|fell|jatuh', 15),
 ('danger|dangerous|bahaya|urgent|segera', 10),
 ('aedes|dengue|denggi|stagnant|bertakung', 15),
 ('dark|gelap|no light', 5),
 ('elderly|warga emas|wheelchair|kerusi roda|oku', 10)
on conflict (pattern) do update set boost = excluded.boost;

-- Pure, immutable twin of src/lib/scoring/severity.ts (kept in sync by tests)
create or replace function public.issue_severity(p_category text, p_text text, p_reopened int default 0)
returns int
language sql stable security definer set search_path = ''
as $$
  select least(100,
    coalesce((select base_severity from public.issue_categories where slug = p_category), 30)
    + coalesce((select sum(boost) from public.severity_keywords where coalesce(p_text, '') ~* pattern), 0)
    + 15 * greatest(coalesce(p_reopened, 0), 0))::int;
$$;

-- Pure twin of src/lib/scoring/priority.ts
create or replace function public.priority_from(
  p_severity numeric, p_votes numeric, p_max_votes numeric,
  p_affected numeric, p_max_affected numeric, p_age_hours numeric,
  w_s numeric default 0.40, w_u numeric default 0.25, w_a numeric default 0.20, w_t numeric default 0.15,
  p_cap_days numeric default 14)
returns numeric
language sql immutable parallel safe set search_path = ''
as $$
  select round(
      w_s * least(100, greatest(0, p_severity))
    + w_u * (case when coalesce(p_max_votes, 0) <= 0 then 0 else least(100, 100 * p_votes / p_max_votes) end)
    + w_a * (case when coalesce(p_max_affected, 0) <= 0 then 0 else least(100, 100 * p_affected / p_max_affected) end)
    + w_t * least(100, 100 * greatest(0, p_age_hours) / (p_cap_days * 24))
  , 1);
$$;

-- ---------------------------------------------------------------------------
-- Issues
-- ---------------------------------------------------------------------------
create type public.issue_status as enum
  ('submitted', 'acknowledged', 'assigned', 'in_progress', 'resolved', 'rejected', 'duplicate');

create sequence public.issue_ref_seq;

create table public.issues (
  id              uuid primary key default gen_random_uuid(),
  township_id     uuid not null references public.townships(id),
  ref_no          text not null unique,
  reporter_id     uuid references public.profiles(id) on delete set null,
  anonymous       boolean not null default false,
  category        text not null references public.issue_categories(slug),
  description     text not null check (char_length(description) between 10 and 1000),
  lat             double precision not null,
  lng             double precision not null,
  area_id         uuid references public.areas(id),
  address_text    text,
  photo_paths     text[] not null default '{}',
  status          public.issue_status not null default 'submitted',
  severity        int not null default 30,
  upvote_count    int not null default 0,
  affected_units  int not null default 0,
  priority_score  numeric not null default 0,      -- snapshot; issue_scores() is the live truth
  assigned_team   text,
  merged_into     uuid references public.issues(id),
  reopened_count  int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  is_demo         boolean not null default false
);
create index on public.issues (status);
create index on public.issues (category, status);
create index on public.issues (reporter_id);
create index issues_desc_trgm on public.issues using gin (description extensions.gin_trgm_ops);

create table public.issue_votes (
  issue_id    uuid not null references public.issues(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (issue_id, user_id)          -- one vote per user per issue, enforced here
);
create index on public.issue_votes (user_id);

create table public.issue_status_history (
  id          bigserial primary key,
  issue_id    uuid not null references public.issues(id) on delete cascade,
  status      public.issue_status not null,
  note        text,
  team        text,
  actor_id    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on public.issue_status_history (issue_id, created_at);

create table public.issue_comments (
  id          uuid primary key default gen_random_uuid(),
  issue_id    uuid not null references public.issues(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null check (char_length(body) between 1 and 600),
  photo_path  text,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on public.issue_comments (issue_id, created_at);

create table public.issue_feedback (
  issue_id    uuid not null references public.issues(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  fixed       boolean not null,
  rating      int check (rating between 1 and 5),
  comment     text check (char_length(comment) <= 500),
  created_at  timestamptz not null default now(),
  primary key (issue_id, user_id, created_at)
);

-- In-app notifications (bell). Created only by triggers/RPCs.
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,              -- issue_update, comment, verification, ...
  title       text not null,
  body        text,
  link        text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Live scores (read time). Open = not resolved/rejected/duplicate.
-- ---------------------------------------------------------------------------
create or replace function public.issue_scores()
returns table (issue_id uuid, s numeric, u numeric, a numeric, t numeric, p numeric, queue_rank int)
language sql stable security definer set search_path = ''
as $$
  with cfg as (
    select coalesce((select value from public.app_config where key = 'priority_weights'),
                    '{"severity":0.40,"upvotes":0.25,"affected":0.20,"waiting":0.15}'::jsonb) w,
           public.cfg_num('priority_waiting_cap_days', 14) cap
  ), open_i as (
    select i.* from public.issues i
     where i.status in ('submitted', 'acknowledged', 'assigned', 'in_progress')
  ), mx as (
    select greatest(max(upvote_count), 0) mv, greatest(max(affected_units), 0) ma from open_i
  ), scored as (
    select o.id,
           o.severity::numeric s,
           case when mx.mv = 0 then 0 else round(100.0 * o.upvote_count / mx.mv, 1) end u,
           case when mx.ma = 0 then 0 else round(100.0 * o.affected_units / mx.ma, 1) end a,
           round(least(100, 100 * extract(epoch from now() - o.created_at) / 3600 / (cfg.cap * 24))::numeric, 1) t,
           public.priority_from(o.severity, o.upvote_count, mx.mv, o.affected_units, mx.ma,
             (extract(epoch from now() - o.created_at) / 3600)::numeric,
             (cfg.w->>'severity')::numeric, (cfg.w->>'upvotes')::numeric,
             (cfg.w->>'affected')::numeric, (cfg.w->>'waiting')::numeric, cfg.cap) p
      from open_i o cross join mx cross join cfg
  )
  select id, s, u, a, t, p, (rank() over (order by p desc, id))::int from scored;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.trg_issue_before_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.ref_no := 'JRN-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYMM') || '-'
                || lpad(nextval('public.issue_ref_seq')::text, 4, '0');
  new.severity := public.issue_severity(new.category, new.description, new.reopened_count);
  -- nearest area centre
  select a.id into new.area_id from public.areas a
   where a.township_id = new.township_id and a.center_lat is not null
   order by public.geo_distance_m(new.lat, new.lng, a.center_lat, a.center_lng) limit 1;
  -- A: distinct units (never people) within the configured radius
  select count(*) into new.affected_units from public.units u
   where u.township_id = new.township_id and u.lat is not null
     and public.geo_distance_m(new.lat, new.lng, u.lat, u.lng) <= public.cfg_num('affected_radius_m', 200);
  return new;
end;
$$;
create trigger issues_before_insert before insert on public.issues
  for each row execute function public.trg_issue_before_insert();

create or replace function public.refresh_issue_priority(p_issue uuid)
returns void language sql security definer set search_path = ''
as $$
  update public.issues i set priority_score = coalesce((select p from public.issue_scores() s where s.issue_id = i.id), 0)
   where i.id = p_issue;
$$;

create or replace function public.notify_user(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select p_user, p_kind, p_title, p_body, p_link where p_user is not null;
$$;

create or replace function public.resident_status_word(p public.issue_status)
returns text language sql immutable set search_path = ''
as $$
  select case p when 'submitted' then 'Received' when 'acknowledged' then 'Seen' when 'assigned' then 'Assigned'
    when 'in_progress' then 'In progress' when 'resolved' then 'Fixed' when 'rejected' then 'Closed'
    when 'duplicate' then 'Merged' end;
$$;

create or replace function public.trg_issue_after_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.issue_status_history (issue_id, status, actor_id, note)
  values (new.id, new.status, new.reporter_id, 'Report received');
  perform public.refresh_issue_priority(new.id);
  insert into public.audit_log (actor_id, action, target_table, target_id)
  values (new.reporter_id, 'issue_reported', 'issues', new.id);
  return null;
end;
$$;
create trigger issues_after_insert after insert on public.issues
  for each row execute function public.trg_issue_after_insert();

-- Status changes notify the reporter and everyone who upvoted
create or replace function public.trg_issue_status_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_word text := public.resident_status_word(new.status);
begin
  if new.status is distinct from old.status then
    new.updated_at := now();
    new.resolved_at := case when new.status = 'resolved' then now() else null end;
    perform public.notify_user(u, 'issue_update', new.ref_no || ': ' || v_word,
              case new.status when 'resolved' then 'Marked as fixed. Is it really fixed? Tell us.'
                              when 'in_progress' then 'Work has started.'
                              when 'assigned' then coalesce('Assigned to ' || new.assigned_team || '.', 'A team has been assigned.')
                              when 'acknowledged' then 'Township management has seen it.'
                              else 'Status changed to ' || v_word || '.' end,
              '/app/issues/' || new.id)
       from (select new.reporter_id u union select user_id from public.issue_votes where issue_id = new.id) x;
  end if;
  return new;
end;
$$;
create trigger issues_status_change before update of status on public.issues
  for each row execute function public.trg_issue_status_change();

create or replace function public.trg_vote_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_issue uuid := coalesce(new.issue_id, old.issue_id);
begin
  update public.issues set upvote_count = greatest(0, upvote_count + case when tg_op = 'INSERT' then 1 else -1 end)
   where id = v_issue;
  perform public.refresh_issue_priority(v_issue);
  return null;
end;
$$;
create trigger issue_votes_change after insert or delete on public.issue_votes
  for each row execute function public.trg_vote_change();

create or replace function public.trg_comment_notify()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_issue public.issues%rowtype; v_nick text;
begin
  select * into v_issue from public.issues where id = new.issue_id;
  select nickname into v_nick from public.profiles where id = new.author_id;
  if v_issue.reporter_id is distinct from new.author_id then
    perform public.notify_user(v_issue.reporter_id, 'comment', v_nick || ' commented on ' || v_issue.ref_no,
                               left(new.body, 120), '/app/issues/' || new.issue_id);
  end if;
  return null;
end;
$$;
create trigger issue_comments_notify after insert on public.issue_comments
  for each row execute function public.trg_comment_notify();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.issue_categories      enable row level security;
alter table public.severity_keywords     enable row level security;
alter table public.issues                enable row level security;
alter table public.issue_votes           enable row level security;
alter table public.issue_status_history  enable row level security;
alter table public.issue_comments        enable row level security;
alter table public.issue_feedback        enable row level security;
alter table public.notifications         enable row level security;

create policy "categories readable" on public.issue_categories for select to anon, authenticated using (true);
create policy "keywords readable"   on public.severity_keywords for select to authenticated using (true);

-- Base table: reporter and staff only. Residents read issues through issue_feed()/issue_detail(),
-- which hide the reporter of anonymous reports.
create policy "issues own or staff" on public.issues for select to authenticated
  using (reporter_id = auth.uid() or public.is_staff());

create policy "votes own" on public.issue_votes for select to authenticated using (user_id = auth.uid());
create policy "votes delete own" on public.issue_votes for delete to authenticated using (user_id = auth.uid());

create policy "history readable" on public.issue_status_history for select to authenticated
  using (public.is_active_member() or public.is_staff());

create policy "comments readable" on public.issue_comments for select to authenticated
  using ((not hidden and public.is_active_member()) or public.is_staff());

create policy "feedback own or staff" on public.issue_feedback for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy "notifications own" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications mark read" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Vote rate limit (60/hour) runs inside the insert policy through this wrapper
revoke all on function private.hit_rate_limit(text, text, int, interval) from public;
create or replace function public.vote_rate_ok()
returns boolean language sql volatile security definer set search_path = ''
as $$ select not private.hit_rate_limit('vote', auth.uid()::text, 60, interval '1 hour') $$;

-- Residents can't read other people's issue rows directly, so the vote check runs as definer.
-- No self-votes, and only open issues in your own township.
create or replace function public.can_vote(p_issue uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.issues i where i.id = p_issue
                  and i.township_id = public.my_township()
                  and i.reporter_id is distinct from auth.uid()
                  and i.status in ('submitted', 'acknowledged', 'assigned', 'in_progress'));
$$;
revoke execute on function public.can_vote(uuid) from public, anon;
grant execute on function public.can_vote(uuid) to authenticated;

create policy "votes insert own" on public.issue_votes for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_member() and public.can_vote(issue_id) and public.vote_rate_ok());

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
-- Feed for residents and staff. Reporter shown as nickname, or null when anonymous.
create or replace function public.issue_feed(p_scope text default 'open', p_limit int default 50)
returns table (
  id uuid, ref_no text, category text, description text, lat double precision, lng double precision,
  area_id uuid, area_name text, address_text text, photo_paths text[], status public.issue_status,
  severity int, upvote_count int, affected_units int, created_at timestamptz, updated_at timestamptz,
  resolved_at timestamptz, reporter_nickname text, is_mine boolean, i_voted boolean,
  s numeric, u numeric, a numeric, t numeric, p numeric, queue_rank int)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.ref_no, i.category, i.description, i.lat, i.lng, i.area_id, ar.name, i.address_text,
         i.photo_paths, i.status, i.severity, i.upvote_count, i.affected_units, i.created_at, i.updated_at,
         i.resolved_at,
         case when i.anonymous and i.reporter_id is distinct from auth.uid() and not public.is_staff() then null else pr.nickname end,
         i.reporter_id = auth.uid(),
         exists (select 1 from public.issue_votes v where v.issue_id = i.id and v.user_id = auth.uid()),
         sc.s, sc.u, sc.a, sc.t, coalesce(sc.p, i.priority_score), sc.queue_rank
    from public.issues i
    left join public.issue_scores() sc on sc.issue_id = i.id
    left join public.areas ar on ar.id = i.area_id
    left join public.profiles pr on pr.id = i.reporter_id
   where (public.is_active_member() or public.is_staff())
     and i.township_id = public.my_township()
     and case p_scope
           when 'open' then i.status in ('submitted', 'acknowledged', 'assigned', 'in_progress')
           when 'mine' then i.reporter_id = auth.uid()
           when 'voted' then exists (select 1 from public.issue_votes v where v.issue_id = i.id and v.user_id = auth.uid())
           when 'closed' then i.status in ('resolved', 'rejected', 'duplicate')
           else true end
   order by (sc.queue_rank is null), sc.queue_rank, i.created_at desc
   limit least(greatest(p_limit, 1), 200);
$$;

create or replace function public.issue_detail(p_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when not (public.is_active_member() or public.is_staff()) then null else
  jsonb_build_object(
    'issue', (select to_jsonb(f) from public.issue_feed('all', 200) f where f.id = p_id),
    'history', coalesce((select jsonb_agg(jsonb_build_object('status', h.status, 'note', h.note, 'team', h.team,
                   'at', h.created_at, 'by_staff', coalesce(pr.role in ('management','security'), false))
                   order by h.created_at)
                from public.issue_status_history h left join public.profiles pr on pr.id = h.actor_id
               where h.issue_id = p_id), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'photo_path', c.photo_path,
                   'at', c.created_at, 'nickname', pr.nickname, 'avatar', pr.avatar_config,
                   'staff', pr.role in ('management','security'), 'mine', c.author_id = auth.uid())
                   order by c.created_at)
                from public.issue_comments c left join public.profiles pr on pr.id = c.author_id
               where c.issue_id = p_id and (not c.hidden or public.is_staff())), '[]'::jsonb),
    'my_feedback', (select to_jsonb(fb) from public.issue_feedback fb
                     where fb.issue_id = p_id and fb.user_id = auth.uid() order by fb.created_at desc limit 1),
    'team', (select assigned_team from public.issues where id = p_id),
    'merged_into', (select m.ref_no from public.issues i join public.issues m on m.id = i.merged_into where i.id = p_id)
  ) end;
$$;

-- Duplicate suggestions: same category nearby, or similar words nearby
create or replace function public.similar_issues(p_category text, p_lat double precision, p_lng double precision, p_text text)
returns table (id uuid, ref_no text, category text, description text, status public.issue_status,
               upvote_count int, distance_m int, similarity real, i_voted boolean, is_mine boolean)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.ref_no, i.category, i.description, i.status, i.upvote_count,
         public.geo_distance_m(p_lat, p_lng, i.lat, i.lng)::int,
         extensions.similarity(i.description, coalesce(p_text, '')),
         exists (select 1 from public.issue_votes v where v.issue_id = i.id and v.user_id = auth.uid()),
         i.reporter_id = auth.uid()
    from public.issues i
   where public.is_active_member()
     and i.status in ('submitted', 'acknowledged', 'assigned', 'in_progress')
     and public.geo_distance_m(p_lat, p_lng, i.lat, i.lng) <= greatest(public.cfg_num('duplicate_radius_m', 100), 50) * 2
     and (
       (i.category = p_category and public.geo_distance_m(p_lat, p_lng, i.lat, i.lng) <= public.cfg_num('duplicate_radius_m', 100))
       or extensions.similarity(i.description, coalesce(p_text, '')) >= 0.25
     )
   order by (i.category = p_category) desc, public.geo_distance_m(p_lat, p_lng, i.lat, i.lng)
   limit 5;
$$;

create or replace function public.report_issue(
  p_category text, p_description text, p_lat double precision, p_lng double precision,
  p_photo_paths text[] default '{}', p_anonymous boolean default false, p_address text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_town public.townships%rowtype; v_id uuid; v_ref text;
begin
  if not public.is_active_member() or public.auth_role() not in ('owner', 'sub_owner') then raise exception 'forbidden'; end if;
  if private.hit_rate_limit('report_hour', auth.uid()::text, 5, interval '1 hour')
     or private.hit_rate_limit('report_day', auth.uid()::text, 20, interval '1 day') then
    raise exception 'rate_limited';
  end if;
  if not exists (select 1 from public.issue_categories where slug = p_category) then raise exception 'bad_category'; end if;
  if char_length(coalesce(trim(p_description), '')) < 10 then raise exception 'description_short'; end if;
  select * into v_town from public.townships where id = public.my_township();
  if public.geo_distance_m(p_lat, p_lng, v_town.center_lat, v_town.center_lng) > 9000 then raise exception 'outside_township'; end if;
  if exists (select 1 from unnest(coalesce(p_photo_paths, '{}')) x where x not like auth.uid()::text || '/%') then
    raise exception 'bad_path';
  end if;

  insert into public.issues (township_id, ref_no, reporter_id, anonymous, category, description, lat, lng,
                             photo_paths, address_text)
  values (v_town.id, 'pending', auth.uid(), coalesce(p_anonymous, false), p_category, trim(p_description),
          p_lat, p_lng, (coalesce(p_photo_paths, '{}'))[1:3], nullif(trim(coalesce(p_address, '')), ''))
  returning id, ref_no into v_id, v_ref;

  return jsonb_build_object('id', v_id, 'ref_no', v_ref,
    'queue_rank', (select queue_rank from public.issue_scores() where issue_id = v_id),
    'open_count', (select count(*) from public.issue_scores()));
end;
$$;

-- Upvote toggle. Returns the new rank so the UI can show "moved from #9 to #6".
create or replace function public.toggle_upvote(p_issue uuid)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare v_before int; v_after int; v_voted boolean;
begin
  select queue_rank into v_before from public.issue_scores() where issue_id = p_issue;
  if exists (select 1 from public.issue_votes where issue_id = p_issue and user_id = auth.uid()) then
    delete from public.issue_votes where issue_id = p_issue and user_id = auth.uid();
    v_voted := false;
  else
    insert into public.issue_votes (issue_id, user_id) values (p_issue, auth.uid());
    v_voted := true;
  end if;
  select queue_rank into v_after from public.issue_scores() where issue_id = p_issue;
  return jsonb_build_object('voted', v_voted, 'rank_before', v_before, 'rank_after', v_after,
    'upvote_count', (select upvote_count from public.issue_feed('all', 200) where id = p_issue));
end;
$$;

create or replace function public.add_issue_comment(p_issue uuid, p_body text, p_photo_path text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not (public.is_active_member() or public.is_staff()) then raise exception 'forbidden'; end if;
  if private.hit_rate_limit('comment', auth.uid()::text, 20, interval '1 hour') then raise exception 'rate_limited'; end if;
  if p_photo_path is not null and p_photo_path not like auth.uid()::text || '/%' then raise exception 'bad_path'; end if;
  if not exists (select 1 from public.issues where id = p_issue and township_id = public.my_township()) then
    raise exception 'not_found';
  end if;
  insert into public.issue_comments (issue_id, author_id, body, photo_path)
  values (p_issue, auth.uid(), trim(p_body), p_photo_path) returning id into v_id;
  return v_id;
end;
$$;

-- Reporter confirms the fix, or says it isn't fixed (reopens with higher severity)
create or replace function public.confirm_resolution(p_issue uuid, p_fixed boolean, p_rating int default null, p_comment text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_issue public.issues%rowtype;
begin
  select * into v_issue from public.issues where id = p_issue for update;
  if not found or v_issue.reporter_id is distinct from auth.uid() then raise exception 'forbidden'; end if;
  if v_issue.status <> 'resolved' then raise exception 'not_resolved'; end if;
  insert into public.issue_feedback (issue_id, user_id, fixed, rating, comment)
  values (p_issue, auth.uid(), p_fixed, p_rating, nullif(trim(coalesce(p_comment, '')), ''));
  if not p_fixed then
    update public.issues
       set reopened_count = reopened_count + 1,
           severity = public.issue_severity(category, description, reopened_count + 1),
           status = 'acknowledged'
     where id = p_issue;
    insert into public.issue_status_history (issue_id, status, actor_id, note)
    values (p_issue, 'acknowledged', auth.uid(), 'Reopened: reporter says it is not fixed');
    perform public.refresh_issue_priority(p_issue);
    -- tell management
    perform public.notify_user(pr.id, 'issue_update', v_issue.ref_no || ' reopened',
                               'The reporter says it is not fixed.', '/admin/issues')
       from public.profiles pr where pr.role = 'management' and pr.township_id = v_issue.township_id;
  end if;
end;
$$;

-- Management: bulk status update with optional note to reporters and team assignment
create or replace function public.update_issue_status(p_ids uuid[], p_status public.issue_status,
                                                      p_note text default null, p_team text default null,
                                                      p_merge_into uuid default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; n int := 0;
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  if p_status = 'duplicate' and p_merge_into is null then raise exception 'merge_target_required'; end if;
  foreach v_id in array p_ids loop
    update public.issues
       set status = p_status,
           assigned_team = coalesce(nullif(trim(coalesce(p_team, '')), ''), assigned_team),
           merged_into = case when p_status = 'duplicate' then p_merge_into else merged_into end
     where id = v_id and township_id = public.my_township();
    if found then
      n := n + 1;
      insert into public.issue_status_history (issue_id, status, note, team, actor_id)
      values (v_id, p_status, nullif(trim(coalesce(p_note, '')), ''), nullif(trim(coalesce(p_team, '')), ''), auth.uid());
      if nullif(trim(coalesce(p_note, '')), '') is not null then
        perform public.notify_user(reporter_id, 'issue_update', ref_no || ': note from township management',
                                   trim(p_note), '/app/issues/' || id)
           from public.issues where id = v_id;
      end if;
      -- duplicates pass their votes on to the main report
      if p_status = 'duplicate' then
        insert into public.issue_votes (issue_id, user_id)
        select p_merge_into, v.user_id from public.issue_votes v where v.issue_id = v_id
        on conflict do nothing;
      end if;
      perform public.refresh_issue_priority(v_id);
      insert into public.audit_log (actor_id, action, target_table, target_id, data)
      values (auth.uid(), 'issue_status', 'issues', v_id, jsonb_build_object('status', p_status, 'team', p_team));
    end if;
  end loop;
  return n;
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = ''
as $$
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
$$;

-- Grants
revoke execute on function public.issue_feed(text, int), public.issue_detail(uuid),
  public.similar_issues(text, double precision, double precision, text),
  public.report_issue(text, text, double precision, double precision, text[], boolean, text),
  public.toggle_upvote(uuid), public.add_issue_comment(uuid, text, text),
  public.confirm_resolution(uuid, boolean, int, text),
  public.update_issue_status(uuid[], public.issue_status, text, text, uuid),
  public.mark_notifications_read(uuid[]), public.issue_scores(), public.refresh_issue_priority(uuid),
  public.notify_user(uuid, text, text, text, text), public.vote_rate_ok(), public.cfg_num(text, numeric)
  from public, anon;
grant execute on function public.issue_feed(text, int), public.issue_detail(uuid),
  public.similar_issues(text, double precision, double precision, text),
  public.report_issue(text, text, double precision, double precision, text[], boolean, text),
  public.toggle_upvote(uuid), public.add_issue_comment(uuid, text, text),
  public.confirm_resolution(uuid, boolean, int, text),
  public.update_issue_status(uuid[], public.issue_status, text, text, uuid),
  public.mark_notifications_read(uuid[]), public.issue_scores(), public.vote_rate_ok(),
  public.cfg_num(text, numeric)
  to authenticated;
revoke execute on function public.refresh_issue_priority(uuid), public.notify_user(uuid, text, text, text, text) from authenticated;

-- Realtime for the live parts of the app
alter publication supabase_realtime add table public.issues, public.notifications;

-- Verification decisions now also land in the bell
create or replace function public.trg_verification_notify()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('verified', 'rejected') then
    perform public.notify_user(new.user_id, 'verification',
      case when new.status = 'verified' then 'You are verified' else 'Your documents need another look' end,
      case when new.status = 'verified' then 'Welcome to Jiran.' else new.reason end,
      case when new.status = 'verified' then '/app/map' else '/verification' end);
  end if;
  return new;
end;
$$;
create trigger verification_notify after update on public.ownership_verifications
  for each row execute function public.trg_verification_notify();
