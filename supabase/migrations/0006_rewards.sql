-- Jiran phase 5: XP ledger, levels, badges, weekly quests, community goal, leaderboard, avatar rules.
-- Rules (from the plan's abuse table):
--   * XP is only ever written by triggers and SECURITY DEFINER functions, never by the browser.
--   * A report earns XP only when management accepts it (first move out of "submitted").
--   * Daily caps per reason, and one ledger row per (reason, source, user) by a unique index.
--   * No XP for votes on your own report; votes never give the reporter XP; priority ignores XP.
--   * Emergencies and SOS confirmations never earn anything (CHECK + trigger).
--   * Rewards are cosmetic only. No streak-loss messages. Leaderboard is opt-out.

insert into public.app_config (key, value, description) values
  ('xp_rules', '{"report_accepted": 20, "fix_confirmed": 10, "upvote": 2, "post_shared": 5, "helpful_received": 3, "reply": 2, "event_checkin": 15, "event_hosted": 20, "newsletter_read": 5}',
   'XP per action'),
  ('xp_daily_caps', '{"upvote": 5, "post_shared": 1, "helpful_received": 5, "reply": 5}',
   'Most times per day each action earns XP (Malaysia time)'),
  ('community_goal_target', '8', 'Weekly township goal: reports fixed this week')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------------
create table public.point_ledger (
  id            bigserial primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  amount        int not null check (amount between -1000 and 100),
  reason        text not null check (reason ~ '^[a-z_]+$' and reason not like '%sos%' and reason not like '%emergenc%'),
  source_table  text not null check (source_table not in ('emergencies', 'emergency_confirmations', 'emergency_events')),
  source_id     uuid not null,
  note          text,
  created_at    timestamptz not null default now(),
  unique (reason, source_id, user_id)
);
create index on public.point_ledger (user_id, created_at desc);
create index on public.point_ledger (created_at);

create table public.leaderboard_optouts (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.point_ledger enable row level security;
alter table public.leaderboard_optouts enable row level security;
create policy "ledger own or staff" on public.point_ledger for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy "optout own" on public.leaderboard_optouts for select to authenticated using (user_id = auth.uid());

-- Midnight and Monday 00:00 in Malaysia time, as timestamptz
create or replace function private.myt_day_start()
returns timestamptz language sql stable set search_path = ''
as $$ select ((now() at time zone 'Asia/Kuala_Lumpur')::date)::timestamp at time zone 'Asia/Kuala_Lumpur' $$;
create or replace function private.myt_week_start()
returns timestamptz language sql stable set search_path = ''
as $$ select (date_trunc('week', now() at time zone 'Asia/Kuala_Lumpur'))::timestamp at time zone 'Asia/Kuala_Lumpur' $$;

-- The one way XP is written. Returns the amount awarded (0 when capped, duplicate, staff or unknown reason).
create or replace function private.award(p_user uuid, p_reason text, p_source_table text, p_source_id uuid, p_amount int default null)
returns int language plpgsql security definer set search_path = ''
as $$
declare
  v_amt int := coalesce(p_amount, (select (value ->> p_reason)::int from public.app_config where key = 'xp_rules'), 0);
  v_cap int := (select (value ->> p_reason)::int from public.app_config where key = 'xp_daily_caps');
  v_n int;
begin
  if p_user is null or p_source_id is null or v_amt = 0 then return 0; end if;
  if not exists (select 1 from public.profiles where id = p_user and role in ('owner', 'sub_owner')) then return 0; end if;
  if v_cap is not null and (select count(*) from public.point_ledger
                             where user_id = p_user and reason = p_reason and created_at >= private.myt_day_start()) >= v_cap then
    return 0;
  end if;
  insert into public.point_ledger (user_id, amount, reason, source_table, source_id)
  values (p_user, v_amt, p_reason, p_source_table, p_source_id)
  on conflict (reason, source_id, user_id) do nothing;
  get diagnostics v_n = row_count;
  return case when v_n > 0 then v_amt else 0 end;
end;
$$;

create or replace function public.level_for(p_xp int)
returns int language sql immutable set search_path = ''
as $$
  select coalesce(max(i), 1)::int from unnest(array[0, 40, 100, 200, 350, 550, 800, 1100, 1500, 2000]) with ordinality t(threshold, i)
   where coalesce(p_xp, 0) >= threshold
$$;

create or replace function private.user_xp(p_user uuid)
returns int language sql stable set search_path = ''
as $$ select coalesce(sum(amount), 0)::int from public.point_ledger where user_id = p_user $$;

-- ---------------------------------------------------------------------------
-- Triggers that award XP
-- ---------------------------------------------------------------------------
create or replace function public.trg_xp_issue_status()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- Accepted = management moved it on from "submitted" (not rejected, not merged as a duplicate)
  if old.status = 'submitted' and new.status in ('acknowledged', 'assigned', 'in_progress', 'resolved') then
    perform private.award(new.reporter_id, 'report_accepted', 'issues', new.id);
  end if;
  return null;
end;
$$;
create trigger xp_issue_status after update of status on public.issues
  for each row execute function public.trg_xp_issue_status();

create or replace function public.trg_xp_feedback()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.fixed then perform private.award(new.user_id, 'fix_confirmed', 'issues', new.issue_id); end if;
  return null;
end;
$$;
create trigger xp_feedback after insert on public.issue_feedback
  for each row execute function public.trg_xp_feedback();

create or replace function public.trg_xp_vote()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- Only the voter earns, never the reporter, and never for your own report
  if not exists (select 1 from public.issues where id = new.issue_id and reporter_id = new.user_id) then
    perform private.award(new.user_id, 'upvote', 'issues', new.issue_id);
  end if;
  return null;
end;
$$;
create trigger xp_vote after insert on public.issue_votes
  for each row execute function public.trg_xp_vote();

create or replace function public.trg_xp_post()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.moderation_state = 'visible' then perform private.award(new.author_id, 'post_shared', 'community_posts', new.id); end if;
  return null;
end;
$$;
create trigger xp_post after insert on public.community_posts
  for each row execute function public.trg_xp_post();

create or replace function public.trg_xp_helpful()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_author uuid := (select author_id from public.community_posts where id = new.post_id);
begin
  if v_author is distinct from new.user_id then
    -- source = the reaction itself (post + giver), so each neighbour's Helpful counts once
    perform private.award(v_author, 'helpful_received', 'post_reactions', md5(new.post_id::text || new.user_id::text)::uuid);
  end if;
  return null;
end;
$$;
create trigger xp_helpful after insert on public.post_reactions
  for each row execute function public.trg_xp_helpful();

create or replace function public.trg_xp_reply()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.community_posts where id = new.post_id and author_id = new.author_id) then
    perform private.award(new.author_id, 'reply', 'post_replies', new.id);
  end if;
  return null;
end;
$$;
create trigger xp_reply after insert on public.post_replies
  for each row execute function public.trg_xp_reply();

create or replace function public.trg_xp_checkin()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.award(new.user_id, 'event_checkin', 'events', new.event_id);
  return null;
end;
$$;
create trigger xp_checkin after insert on public.event_checkins
  for each row execute function public.trg_xp_checkin();

create or replace function public.trg_xp_event_approved()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind = 'community' and new.approval_state = 'approved' and old.approval_state is distinct from 'approved' then
    perform private.award(new.host_id, 'event_hosted', 'events', new.id);
  end if;
  return null;
end;
$$;
create trigger xp_event_approved after update of approval_state on public.events
  for each row execute function public.trg_xp_event_approved();

create or replace function public.trg_xp_newsletter()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.award(new.user_id, 'newsletter_read', 'newsletters', new.newsletter_id);
  return null;
end;
$$;
create trigger xp_newsletter after insert on public.newsletter_reads
  for each row execute function public.trg_xp_newsletter();

-- ---------------------------------------------------------------------------
-- Badges and weekly quests (definitions here; progress counted from the ledger at read time)
-- ---------------------------------------------------------------------------
create or replace function private.badge_defs()
returns table (slug text, reason text, target int, sort int) language sql immutable set search_path = ''
as $$ values
  ('first_report', 'report_accepted', 1, 1), ('fixer', 'report_accepted', 5, 2), ('confirmer', 'fix_confirmed', 3, 3),
  ('voice', 'upvote', 10, 4), ('good_neighbour', 'helpful_received', 5, 5), ('conversation', 'reply', 5, 6),
  ('event_goer', 'event_checkin', 3, 7), ('host', 'event_hosted', 1, 8), ('reader', 'newsletter_read', 3, 9)
$$;

create or replace function private.quest_pool()
returns table (slug text, reason text, target int, bonus int, n int) language sql immutable set search_path = ''
as $$ values
  ('upvote3', 'upvote', 3, 10, 0), ('read_newsletter', 'newsletter_read', 1, 10, 1), ('checkin1', 'event_checkin', 1, 15, 2),
  ('reply2', 'reply', 2, 10, 3), ('share1', 'post_shared', 1, 10, 4), ('confirm1', 'fix_confirmed', 1, 15, 5)
$$;

-- Three quests a week, rotating through the pool; no server job needed.
create or replace function private.week_quests()
returns table (slug text, reason text, target int, bonus int) language sql stable set search_path = ''
as $$
  with w as (select (floor(extract(epoch from private.myt_week_start()) / 604800))::int k)
  select q.slug, q.reason, q.target, q.bonus from private.quest_pool() q, w
   where q.n in (w.k % 6, (w.k + 1) % 6, (w.k + 2) % 6)
   order by (q.n - w.k % 6 + 6) % 6
$$;

create or replace function public.my_rewards()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_me uuid := auth.uid(); v_xp int; v_lvl int; r jsonb;
  v_th int[] := array[0, 40, 100, 200, 350, 550, 800, 1100, 1500, 2000];
begin
  if not public.is_active_member() then raise exception 'forbidden'; end if;
  v_xp := private.user_xp(v_me);
  v_lvl := public.level_for(v_xp);
  select jsonb_build_object(
    'xp', v_xp, 'level', v_lvl, 'level_floor', v_th[v_lvl], 'next_at', case when v_lvl < 10 then v_th[v_lvl + 1] end,
    'week_xp', (select coalesce(sum(amount), 0) from public.point_ledger where user_id = v_me and created_at >= private.myt_week_start()),
    'badges', (select jsonb_agg(jsonb_build_object('slug', b.slug, 'target', b.target,
                 'progress', least(b.target, (select count(*) from public.point_ledger l where l.user_id = v_me and l.reason = b.reason))) order by b.sort)
                 from private.badge_defs() b),
    'quests', (select jsonb_agg(jsonb_build_object('slug', q.slug, 'target', q.target, 'bonus', q.bonus,
                 'progress', least(q.target, (select count(*) from public.point_ledger l where l.user_id = v_me and l.reason = q.reason
                                                                                  and l.created_at >= private.myt_week_start())),
                 'claimed', exists (select 1 from public.point_ledger l where l.user_id = v_me and l.reason = 'quest_bonus'
                                     and l.source_id = md5(q.slug || ':' || private.myt_week_start()::text)::uuid)))
                 from private.week_quests() q),
    'goal', jsonb_build_object('target', public.cfg_num('community_goal_target', 8)::int,
                 'progress', (select count(*) from public.issues i where i.township_id = public.my_township()
                                and i.status = 'resolved' and i.resolved_at >= private.myt_week_start())),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('amount', amount, 'reason', reason, 'at', created_at, 'note', note) order by created_at desc), '[]')
                  from (select * from public.point_ledger where user_id = v_me order by created_at desc limit 15) h),
    'opted_out', exists (select 1 from public.leaderboard_optouts where user_id = v_me),
    'week_ends', private.myt_week_start() + interval '7 days'
  ) into r;
  return r;
end;
$$;

create or replace function public.claim_quest(p_slug text)
returns int language plpgsql security definer set search_path = ''
as $$
declare q record; v_done int;
begin
  if not public.is_active_member() then raise exception 'forbidden'; end if;
  select * into q from private.week_quests() w where w.slug = p_slug;
  if not found then raise exception 'quest_not_this_week'; end if;
  select count(*) into v_done from public.point_ledger
   where user_id = auth.uid() and reason = q.reason and created_at >= private.myt_week_start();
  if v_done < q.target then raise exception 'quest_not_done'; end if;
  return private.award(auth.uid(), 'quest_bonus', 'quests', md5(q.slug || ':' || private.myt_week_start()::text)::uuid, q.bonus);
end;
$$;

-- Leaderboard: opted-in active residents only, nickname and avatar only. Week = since Monday (Malaysia time).
create or replace function public.leaderboard(p_scope text default 'township', p_period text default 'week')
returns table (rank int, nickname text, avatar jsonb, level int, xp int, area_name text, is_me boolean)
language sql stable security definer set search_path = ''
as $$
  with pts as (
    select l.user_id, sum(l.amount)::int xp from public.point_ledger l
     where p_period <> 'week' or l.created_at >= private.myt_week_start()
     group by l.user_id
  ), me as (select home_area_id from public.profiles where id = auth.uid())
  select (rank() over (order by pts.xp desc))::int, p.nickname, p.avatar_config, public.level_for(private.user_xp(p.id)), pts.xp,
         ar.name, p.id = auth.uid()
    from pts join public.profiles p on p.id = pts.user_id
    join public.profiles_private pp on pp.user_id = p.id
    left join public.areas ar on ar.id = p.home_area_id
   where (public.is_active_member() or public.is_staff())
     and p.township_id = public.my_township() and p.role in ('owner', 'sub_owner') and pp.status = 'active'
     and pts.xp > 0
     and not exists (select 1 from public.leaderboard_optouts o where o.user_id = p.id)
     and (p_scope <> 'area' or p.home_area_id = (select home_area_id from me))
   order by pts.xp desc, p.nickname
   limit 20
$$;

create or replace function public.set_leaderboard_optout(p_out boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then raise exception 'forbidden'; end if;
  if p_out then insert into public.leaderboard_optouts (user_id) values (auth.uid()) on conflict do nothing;
  else delete from public.leaderboard_optouts where user_id = auth.uid(); end if;
end;
$$;

-- Management can take XP back (for example after removing a spam post). Logged and the resident is told.
create or replace function public.revoke_xp(p_user uuid, p_amount int, p_note text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 500 then raise exception 'invalid_amount'; end if;
  if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'reason_required'; end if;
  if not exists (select 1 from public.profiles where id = p_user and township_id = public.my_township() and role in ('owner', 'sub_owner')) then
    raise exception 'not_found';
  end if;
  insert into public.point_ledger (user_id, amount, reason, source_table, source_id, note)
  values (p_user, -p_amount, 'revoked', 'profiles', gen_random_uuid(), trim(p_note));
  perform public.notify_user(p_user, 'moderation', p_amount || ' XP removed by township management', trim(p_note), '/app/rewards');
  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), 'xp_revoked', 'profiles', p_user, jsonb_build_object('amount', p_amount, 'note', p_note));
end;
$$;

-- Public level for any resident (nickname-level information only)
create or replace function public.levels_for(p_nicknames text[])
returns table (nickname text, level int) language sql stable security definer set search_path = ''
as $$
  select p.nickname, public.level_for(private.user_xp(p.id)) from public.profiles p
   where p.township_id = public.my_township() and p.nickname = any(p_nicknames) and (public.is_active_member() or public.is_staff())
$$;

-- ---------------------------------------------------------------------------
-- Avatar rules: shape of avatar_config, and level-locked cosmetic items (checked on save, not just in the UI)
-- Head coverings (tudung, songkok) are never locked.
-- ---------------------------------------------------------------------------
create or replace function public.trg_profile_avatar()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare c jsonb := new.avatar_config; v_lvl int;
begin
  if c is not distinct from old.avatar_config or coalesce((c ->> 'v')::int, 0) <> 1 then return new; end if;
  if jsonb_typeof(c) <> 'object'
     or (c ->> 'skin')::int not between 0 and 5
     or (c ->> 'hairColor')::int not between 0 and 5
     or (c ->> 'top')::int not between 0 and 7
     or (c ->> 'hair') not in ('short', 'long', 'bun', 'curly', 'buzz', 'tudung', 'none')
     or (c ->> 'acc') not in ('none', 'glasses', 'songkok', 'cap', 'flower', 'headphones', 'shades', 'crown')
     or (c ->> 'ring') not in ('red', 'orange', 'amber', 'green', 'blue', 'purple', 'teal', 'gold') then
    raise exception 'invalid_avatar';
  end if;
  v_lvl := public.level_for(private.user_xp(new.id));
  if (c ->> 'acc' = 'cap' and v_lvl < 2) or (c ->> 'acc' = 'flower' and v_lvl < 2)
     or (c ->> 'acc' = 'headphones' and v_lvl < 3) or (c ->> 'acc' = 'shades' and v_lvl < 4)
     or (c ->> 'acc' = 'crown' and v_lvl < 6)
     or (c ->> 'ring' = 'purple' and v_lvl < 3) or (c ->> 'ring' = 'teal' and v_lvl < 4) or (c ->> 'ring' = 'gold' and v_lvl < 5) then
    raise exception 'item_locked';
  end if;
  return new;
end;
$$;
create trigger profile_avatar before update of avatar_config on public.profiles
  for each row execute function public.trg_profile_avatar();

-- ---------------------------------------------------------------------------
-- Backfill: credit what residents already did (demo history), without daily caps, at the original time
-- ---------------------------------------------------------------------------
insert into public.point_ledger (user_id, amount, reason, source_table, source_id, created_at)
select i.reporter_id, 20, 'report_accepted', 'issues', i.id, coalesce(
         (select min(h.created_at) from public.issue_status_history h where h.issue_id = i.id and h.status <> 'submitted'), i.updated_at)
  from public.issues i join public.profiles p on p.id = i.reporter_id and p.role in ('owner', 'sub_owner')
 where i.status in ('acknowledged', 'assigned', 'in_progress', 'resolved')
on conflict do nothing;
insert into public.point_ledger (user_id, amount, reason, source_table, source_id, created_at)
select v.user_id, 2, 'upvote', 'issues', v.issue_id, v.created_at
  from public.issue_votes v join public.issues i on i.id = v.issue_id and i.reporter_id is distinct from v.user_id
  join public.profiles p on p.id = v.user_id and p.role in ('owner', 'sub_owner')
on conflict do nothing;
insert into public.point_ledger (user_id, amount, reason, source_table, source_id, created_at)
select f.user_id, 10, 'fix_confirmed', 'issues', f.issue_id, min(f.created_at)
  from public.issue_feedback f join public.profiles p on p.id = f.user_id and p.role in ('owner', 'sub_owner')
 where f.fixed group by f.user_id, f.issue_id
on conflict do nothing;
insert into public.point_ledger (user_id, amount, reason, source_table, source_id, created_at)
select c.author_id, 5, 'post_shared', 'community_posts', c.id, c.created_at
  from public.community_posts c join public.profiles p on p.id = c.author_id and p.role in ('owner', 'sub_owner')
 where c.moderation_state = 'visible'
on conflict do nothing;
insert into public.point_ledger (user_id, amount, reason, source_table, source_id, created_at)
select c.author_id, 3, 'helpful_received', 'post_reactions', md5(r.post_id::text || r.user_id::text)::uuid, r.created_at
  from public.post_reactions r join public.community_posts c on c.id = r.post_id and c.author_id is distinct from r.user_id
  join public.profiles p on p.id = c.author_id and p.role in ('owner', 'sub_owner')
on conflict do nothing;
insert into public.point_ledger (user_id, amount, reason, source_table, source_id, created_at)
select r.author_id, 2, 'reply', 'post_replies', r.id, r.created_at
  from public.post_replies r join public.community_posts c on c.id = r.post_id and c.author_id is distinct from r.author_id
  join public.profiles p on p.id = r.author_id and p.role in ('owner', 'sub_owner')
 where not r.hidden
on conflict do nothing;
insert into public.point_ledger (user_id, amount, reason, source_table, source_id, created_at)
select c.user_id, 15, 'event_checkin', 'events', c.event_id, c.at
  from public.event_checkins c join public.profiles p on p.id = c.user_id and p.role in ('owner', 'sub_owner')
on conflict do nothing;
insert into public.point_ledger (user_id, amount, reason, source_table, source_id, created_at)
select e.host_id, 20, 'event_hosted', 'events', e.id, coalesce(e.decided_at, e.created_at)
  from public.events e join public.profiles p on p.id = e.host_id and p.role in ('owner', 'sub_owner')
 where e.kind = 'community' and e.approval_state = 'approved'
on conflict do nothing;
insert into public.point_ledger (user_id, amount, reason, source_table, source_id, created_at)
select r.user_id, 5, 'newsletter_read', 'newsletters', r.newsletter_id, r.read_at
  from public.newsletter_reads r join public.profiles p on p.id = r.user_id and p.role in ('owner', 'sub_owner')
on conflict do nothing;

-- Demo characters for the seeded residents (placeholders; residents change them in the character editor)
update public.profiles set avatar_config = x.cfg from (values
  ('00000000-0000-0000-0000-0000000d0011'::uuid, '{"v":1,"skin":2,"hair":"tudung","hairColor":3,"top":1,"acc":"none","ring":"green"}'::jsonb),
  ('00000000-0000-0000-0000-0000000d0012'::uuid, '{"v":1,"skin":3,"hair":"short","hairColor":0,"top":4,"acc":"glasses","ring":"orange"}'::jsonb),
  ('00000000-0000-0000-0000-0000000d0013'::uuid, '{"v":1,"skin":1,"hair":"curly","hairColor":1,"top":6,"acc":"none","ring":"blue"}'::jsonb),
  ('00000000-0000-0000-0000-0000000d0014'::uuid, '{"v":1,"skin":4,"hair":"bun","hairColor":5,"top":2,"acc":"none","ring":"amber"}'::jsonb)
) x(id, cfg) where profiles.id = x.id and coalesce((profiles.avatar_config ->> 'v')::int, 0) <> 1;

-- ---------------------------------------------------------------------------
-- Grants and live updates
-- ---------------------------------------------------------------------------
revoke all on function private.award(uuid, text, text, uuid, int), private.user_xp(uuid), private.myt_day_start(),
  private.myt_week_start(), private.badge_defs(), private.quest_pool(), private.week_quests() from public, anon, authenticated;
revoke execute on function public.my_rewards(), public.claim_quest(text), public.leaderboard(text, text),
  public.set_leaderboard_optout(boolean), public.revoke_xp(uuid, int, text), public.levels_for(text[]),
  public.trg_xp_issue_status(), public.trg_xp_feedback(), public.trg_xp_vote(), public.trg_xp_post(), public.trg_xp_helpful(),
  public.trg_xp_reply(), public.trg_xp_checkin(), public.trg_xp_event_approved(), public.trg_xp_newsletter(), public.trg_profile_avatar()
  from public, anon;
grant execute on function public.my_rewards(), public.claim_quest(text), public.leaderboard(text, text),
  public.set_leaderboard_optout(boolean), public.revoke_xp(uuid, int, text), public.levels_for(text[]), public.level_for(int)
  to authenticated;

-- Residents get their own new ledger rows live (RLS: own rows only) for the "+XP" toast
alter publication supabase_realtime add table public.point_ledger;
