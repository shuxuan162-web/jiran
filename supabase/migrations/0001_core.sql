-- Jiran · 0001_core
-- Identity, township geography, owner verification, sub-owner invites,
-- simulated email outbox, app config and audit log.
-- Every table has RLS on. Client writes go through RPCs or narrow column grants.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Private schema: never exposed through the API
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.secrets (
  key   text primary key,
  value text not null
);
insert into private.secrets (key, value)
values ('id_salt', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

-- Salted hash of an identity number. The raw number is never stored.
create or replace function private.hash_id(p_type text, p_number text)
returns text
language sql
stable
set search_path = ''
as $$
  select encode(
    extensions.digest(
      (select value from private.secrets where key = 'id_salt')
        || lower(p_type) || ':'
        || upper(regexp_replace(p_number, '[^0-9A-Za-z]', '', 'g')),
      'sha256'),
    'hex');
$$;

-- Simple per-key rate limiter (signup attempts, invites, later SOS)
create table private.rate_events (
  id      bigserial primary key,
  bucket  text not null,
  subject text not null,
  at      timestamptz not null default now()
);
create index on private.rate_events (bucket, subject, at desc);

create or replace function private.hit_rate_limit(p_bucket text, p_subject text, p_max int, p_window interval)
returns boolean   -- true = over the limit (caller should refuse)
language plpgsql
set search_path = ''
as $$
declare n int;
begin
  select count(*) into n from private.rate_events
   where bucket = p_bucket and subject = p_subject and at > now() - p_window;
  if n >= p_max then return true; end if;
  insert into private.rate_events (bucket, subject) values (p_bucket, p_subject);
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('owner', 'sub_owner', 'management', 'security');
create type public.verification_status as enum ('submitted', 'under_review', 'verified', 'rejected');
create type public.invite_status as enum ('invited', 'active', 'revoked');

-- ---------------------------------------------------------------------------
-- Geography
-- ---------------------------------------------------------------------------
create table public.townships (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  center_lat  double precision,
  center_lng  double precision,
  created_at  timestamptz not null default now()
);

create table public.areas (
  id           uuid primary key default gen_random_uuid(),
  township_id  uuid not null references public.townships(id) on delete cascade,
  parent_id    uuid references public.areas(id),
  slug         text not null,
  name         text not null,
  kind         text not null check (kind in ('estate', 'precinct', 'park', 'commercial', 'business')),
  residential  boolean not null default true,
  center_lat   double precision,
  center_lng   double precision,
  boundary     jsonb,                       -- GeoJSON Polygon, traced in phase 3
  verified     boolean not null default false,
  source_note  text,
  sort_order   int not null default 0,
  unique (township_id, slug)
);

create table public.units (
  id           uuid primary key default gen_random_uuid(),
  township_id  uuid not null references public.townships(id) on delete cascade,
  area_id      uuid not null references public.areas(id),
  label        text not null,               -- e.g. "Elmina Green 4 · No. 12"
  street       text,
  unit_no      text,
  lat          double precision,
  lng          double precision,
  synthetic    boolean not null default true,  -- demo placeholder, not a real address
  unique (township_id, label)
);
create index on public.units (area_id);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
-- Public face of a person: what other residents may see.
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  township_id     uuid not null references public.townships(id),
  role            public.user_role not null,
  nickname        text not null check (char_length(nickname) between 3 and 24),
  avatar_config   jsonb not null default '{}'::jsonb,
  home_area_id    uuid references public.areas(id),
  map_visibility  text not null default 'unset' check (map_visibility in ('unset', 'precinct', 'hidden')),
  ghost_mode      boolean not null default false,
  language        text not null default 'en' check (language in ('en', 'bm')),
  created_at      timestamptz not null default now()
);
create unique index profiles_nickname_unique on public.profiles (township_id, lower(nickname));

-- Private details: only the person and management.
create table public.profiles_private (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  full_name       text not null,
  email           text not null,
  phone           text,
  id_type         text check (id_type in ('nric', 'passport')),
  id_last4        text,
  id_hash         text,
  unit_id         uuid references public.units(id),
  owner_id        uuid references public.profiles(id),   -- set for sub-owners
  status          text not null default 'active'
                  check (status in ('pending', 'active', 'suspended', 'revoked')),
  resident_since  date not null default current_date
);
create index on public.profiles_private (unit_id);
create index on public.profiles_private (owner_id);
create unique index profiles_private_id_hash on public.profiles_private (id_hash) where id_hash is not null;

-- ---------------------------------------------------------------------------
-- Helper functions used by policies
-- ---------------------------------------------------------------------------
create or replace function public.auth_role()
returns public.user_role language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_management()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select role = 'management' from public.profiles where id = auth.uid()), false) $$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select role in ('management', 'security') from public.profiles where id = auth.uid()), false) $$;

create or replace function public.my_township()
returns uuid language sql stable security definer set search_path = ''
as $$ select township_id from public.profiles where id = auth.uid() $$;

create or replace function public.my_unit_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select unit_id from public.profiles_private where user_id = auth.uid() $$;

create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select status = 'active' from public.profiles_private where user_id = auth.uid()), false) $$;

revoke execute on function public.auth_role(), public.is_management(), public.is_staff(),
  public.my_township(), public.my_unit_id(), public.is_active_member() from public, anon;
grant execute on function public.auth_role(), public.is_management(), public.is_staff(),
  public.my_township(), public.my_unit_id(), public.is_active_member() to authenticated;

-- ---------------------------------------------------------------------------
-- Onboarding
-- ---------------------------------------------------------------------------
create table public.ownership_verifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  unit_id       uuid not null references public.units(id),
  status        public.verification_status not null default 'submitted',
  doc_paths     text[] not null default '{}',
  reason        text,
  submitted_at  timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references public.profiles(id)
);
create index on public.ownership_verifications (status, submitted_at);
create index on public.ownership_verifications (user_id);

create table public.sub_owner_invites (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles(id) on delete cascade,
  unit_id           uuid not null references public.units(id),
  name              text not null check (char_length(name) between 2 and 80),
  email             text not null,
  token_hash        text not null unique,
  status            public.invite_status not null default 'invited',
  expires_at        timestamptz not null default now() + interval '72 hours',
  accepted_user_id  uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index on public.sub_owner_invites (owner_id);

-- Simulated PRIME membership register (demo only)
create table public.prime_members (
  id        uuid primary key default gen_random_uuid(),
  id_type   text not null check (id_type in ('nric', 'passport')),
  id_hash   text not null unique,
  user_id   uuid references public.profiles(id) on delete cascade,
  note      text not null default 'Simulated PRIME record for the hackathon demo'
);

-- ---------------------------------------------------------------------------
-- Simulated email, config, audit
-- ---------------------------------------------------------------------------
create table public.email_outbox (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  kind               text not null,          -- invite, verification, newsletter, ...
  sender_id          uuid references public.profiles(id) on delete set null,
  recipient_user_id  uuid references public.profiles(id) on delete cascade,
  to_email           text not null,
  subject            text not null,
  body               text not null,
  link               text
);
create index on public.email_outbox (recipient_user_id, created_at desc);
create index on public.email_outbox (sender_id, created_at desc);

create table public.app_config (
  key          text primary key,
  value        jsonb not null,
  description  text
);

create table public.audit_log (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  actor_id      uuid references public.profiles(id) on delete set null,
  action        text not null,
  target_table  text,
  target_id     uuid,
  data          jsonb not null default '{}'::jsonb
);
create index on public.audit_log (at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.townships               enable row level security;
alter table public.areas                   enable row level security;
alter table public.units                   enable row level security;
alter table public.profiles                enable row level security;
alter table public.profiles_private        enable row level security;
alter table public.ownership_verifications enable row level security;
alter table public.sub_owner_invites       enable row level security;
alter table public.prime_members           enable row level security;
alter table public.email_outbox            enable row level security;
alter table public.app_config              enable row level security;
alter table public.audit_log               enable row level security;

-- Geography is public (needed by the sign-up unit picker before login)
create policy "townships readable" on public.townships for select to anon, authenticated using (true);
create policy "areas readable"     on public.areas     for select to anon, authenticated using (true);
create policy "units readable"     on public.units     for select to anon, authenticated using (true);
create policy "areas managed"      on public.areas     for all to authenticated using (public.is_management()) with check (public.is_management());

-- Profiles: nickname/avatar/area are visible inside the township
create policy "profiles readable in township" on public.profiles
  for select to authenticated using (township_id = public.my_township());
create policy "profiles self update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (nickname, avatar_config, home_area_id, map_visibility, ghost_mode, language)
  on public.profiles to authenticated;

-- Private details: self and management only
create policy "private self read" on public.profiles_private
  for select to authenticated using (user_id = auth.uid() or public.is_management());
create policy "private self update" on public.profiles_private
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.profiles_private from authenticated;
grant update (phone) on public.profiles_private to authenticated;

create policy "verification own or management" on public.ownership_verifications
  for select to authenticated using (user_id = auth.uid() or public.is_management());

create policy "invites own or management" on public.sub_owner_invites
  for select to authenticated using (owner_id = auth.uid() or public.is_management());

-- prime_members: no client policies at all (RPC only)

create policy "outbox sender, recipient or management" on public.email_outbox
  for select to authenticated
  using (sender_id = auth.uid() or recipient_user_id = auth.uid() or public.is_management());

create policy "config readable" on public.app_config
  for select to authenticated using (true);
create policy "config managed" on public.app_config
  for update to authenticated using (public.is_management()) with check (public.is_management());

create policy "audit management" on public.audit_log
  for select to authenticated using (public.is_management());

-- ---------------------------------------------------------------------------
-- RPCs: service-role only (called from Edge Functions)
-- ---------------------------------------------------------------------------
create or replace function public.check_signup_allowed(p_ip text, p_email text, p_id_type text, p_id_number text, p_nickname text, p_unit_id uuid)
returns text   -- null = ok, otherwise a user-facing reason code
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_township uuid;
begin
  if private.hit_rate_limit('signup', coalesce(p_ip, 'unknown'), 5, interval '1 hour') then
    return 'rate_limited';
  end if;
  if exists (select 1 from auth.users where lower(email) = lower(p_email)) then
    return 'email_taken';
  end if;
  select township_id into v_township from public.units where id = p_unit_id;
  if v_township is null then return 'unit_unknown'; end if;
  if exists (select 1 from public.profiles where township_id = v_township and lower(nickname) = lower(p_nickname)) then
    return 'nickname_taken';
  end if;
  if exists (select 1 from public.profiles_private where id_hash = private.hash_id(p_id_type, p_id_number)) then
    return 'id_taken';
  end if;
  return null;
end;
$$;

create or replace function public.register_owner_profile(
  p_user_id uuid, p_email text, p_full_name text, p_id_type text, p_id_number text,
  p_unit_id uuid, p_nickname text, p_phone text)
returns uuid   -- verification id
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.units%rowtype;
  v_ver  uuid;
  v_clean text := upper(regexp_replace(p_id_number, '[^0-9A-Za-z]', '', 'g'));
begin
  select * into v_unit from public.units where id = p_unit_id;
  if not found then raise exception 'unit_unknown'; end if;

  insert into public.profiles (id, township_id, role, nickname, home_area_id)
  values (p_user_id, v_unit.township_id, 'owner', trim(p_nickname), v_unit.area_id);

  insert into public.profiles_private (user_id, full_name, email, phone, id_type, id_last4, id_hash, unit_id, status)
  values (p_user_id, trim(p_full_name), lower(p_email), p_phone, p_id_type, right(v_clean, 4),
          private.hash_id(p_id_type, p_id_number), p_unit_id, 'pending');

  insert into public.ownership_verifications (user_id, unit_id)
  values (p_user_id, p_unit_id) returning id into v_ver;

  insert into public.email_outbox (kind, recipient_user_id, to_email, subject, body)
  values ('verification', p_user_id, lower(p_email),
          'Welcome to Jiran: we are checking your ownership',
          'Thanks for signing up. Township management will review your certificate of ownership, usually within 2 working days. You can track it on the Verification screen.');

  insert into public.audit_log (actor_id, action, target_table, target_id)
  values (p_user_id, 'owner_registered', 'ownership_verifications', v_ver);
  return v_ver;
end;
$$;

create or replace function public.invite_for_token(p_token text)
returns table (id uuid, name text, email text, status public.invite_status, expires_at timestamptz, unit_id uuid, owner_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.name, i.email, i.status, i.expires_at, i.unit_id, i.owner_id
    from public.sub_owner_invites i
   where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

create or replace function public.accept_invite_profile(p_token text, p_user_id uuid, p_nickname text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv record;
  v_unit public.units%rowtype;
begin
  select * into v_inv from public.invite_for_token(p_token);
  if not found then raise exception 'invite_unknown'; end if;
  if v_inv.status <> 'invited' then raise exception 'invite_used'; end if;
  if v_inv.expires_at < now() then raise exception 'invite_expired'; end if;
  select * into v_unit from public.units where id = v_inv.unit_id;

  insert into public.profiles (id, township_id, role, nickname, home_area_id)
  values (p_user_id, v_unit.township_id, 'sub_owner', trim(p_nickname), v_unit.area_id);

  insert into public.profiles_private (user_id, full_name, email, unit_id, owner_id, status)
  values (p_user_id, v_inv.name, lower(v_inv.email), v_inv.unit_id, v_inv.owner_id, 'active');

  update public.sub_owner_invites
     set status = 'active', accepted_user_id = p_user_id
   where id = v_inv.id;

  insert into public.audit_log (actor_id, action, target_table, target_id)
  values (p_user_id, 'sub_owner_joined', 'sub_owner_invites', v_inv.id);
end;
$$;

revoke execute on function public.check_signup_allowed(text, text, text, text, text, uuid),
  public.register_owner_profile(uuid, text, text, text, text, uuid, text, text),
  public.accept_invite_profile(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.check_signup_allowed(text, text, text, text, text, uuid),
  public.register_owner_profile(uuid, text, text, text, text, uuid, text, text),
  public.accept_invite_profile(text, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- RPCs: callable from the app
-- ---------------------------------------------------------------------------
-- Public: what the invite page shows before the sub-owner has an account
create or replace function public.lookup_invite(p_token text)
returns table (name text, email text, state text, owner_nickname text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.name, i.email,
         case when i.status <> 'invited' then i.status::text
              when i.expires_at < now() then 'expired'
              else 'invited' end,
         p.nickname
    from public.invite_for_token(p_token) i
    join public.profiles p on p.id = i.owner_id;
$$;
revoke execute on function public.invite_for_token(text) from public, anon, authenticated;
grant execute on function public.lookup_invite(text) to anon, authenticated;

-- Owner attaches (or replaces) certificate files and (re)submits
create or replace function public.submit_verification_docs(p_paths text[], p_unit_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_ver public.ownership_verifications%rowtype;
begin
  select * into v_ver from public.ownership_verifications
   where user_id = auth.uid() order by submitted_at desc limit 1;
  if not found then raise exception 'no_verification'; end if;
  if v_ver.status = 'verified' then raise exception 'already_verified'; end if;
  if exists (select 1 from unnest(p_paths) p where p not like auth.uid()::text || '/%') then
    raise exception 'bad_path';
  end if;
  if p_unit_id is not null then
    update public.profiles_private set unit_id = p_unit_id where user_id = auth.uid();
    update public.profiles set home_area_id = (select area_id from public.units where id = p_unit_id) where id = auth.uid();
  end if;
  update public.ownership_verifications
     set doc_paths = p_paths, status = 'submitted', reason = null, submitted_at = now(),
         unit_id = coalesce(p_unit_id, unit_id), decided_at = null, decided_by = null
   where id = v_ver.id;
end;
$$;

-- Management decides
create or replace function public.decide_verification(p_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_ver public.ownership_verifications%rowtype; v_email text;
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select * into v_ver from public.ownership_verifications where id = p_id for update;
  if not found then raise exception 'not_found'; end if;

  update public.ownership_verifications
     set status = case when p_approve then 'verified' else 'rejected' end::public.verification_status,
         reason = case when p_approve then null else trim(p_reason) end,
         decided_at = now(), decided_by = auth.uid()
   where id = p_id;

  update public.profiles_private
     set status = case when p_approve then 'active' else 'pending' end
   where user_id = v_ver.user_id;

  select email into v_email from public.profiles_private where user_id = v_ver.user_id;
  insert into public.email_outbox (kind, sender_id, recipient_user_id, to_email, subject, body)
  values ('verification', auth.uid(), v_ver.user_id, v_email,
          case when p_approve then 'You are verified: welcome to Jiran' else 'We need another look at your documents' end,
          case when p_approve then 'Your ownership is confirmed. Open Jiran to see what is happening around City of Elmina.'
               else 'Reason: ' || trim(p_reason) || '. Open Jiran and tap "Fix and resubmit".' end);

  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), case when p_approve then 'verification_approved' else 'verification_rejected' end,
          'ownership_verifications', p_id, jsonb_build_object('reason', p_reason));
end;
$$;

-- Owner invites a family member or tenant
create or replace function public.create_sub_owner_invite(p_name text, p_email text, p_origin text)
returns text   -- the invite link (also written to the simulated email log)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_unit uuid; v_link text; v_owner_nick text; v_id uuid;
begin
  if public.auth_role() <> 'owner' or not public.is_active_member() then raise exception 'forbidden'; end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email'; end if;
  if private.hit_rate_limit('invite', auth.uid()::text, 10, interval '1 day') then raise exception 'rate_limited'; end if;
  if (select count(*) from public.sub_owner_invites
       where owner_id = auth.uid() and status in ('invited', 'active')) >= 6 then
    raise exception 'too_many_sub_owners';
  end if;
  if exists (select 1 from auth.users where lower(email) = lower(p_email)) then raise exception 'email_taken'; end if;

  select unit_id into v_unit from public.profiles_private where user_id = auth.uid();
  select nickname into v_owner_nick from public.profiles where id = auth.uid();
  v_link := rtrim(coalesce(p_origin, ''), '/') || '/invite/' || v_token;

  insert into public.sub_owner_invites (owner_id, unit_id, name, email, token_hash)
  values (auth.uid(), v_unit, trim(p_name), lower(trim(p_email)), encode(extensions.digest(v_token, 'sha256'), 'hex'))
  returning id into v_id;

  insert into public.email_outbox (kind, sender_id, to_email, subject, body, link)
  values ('invite', auth.uid(), lower(trim(p_email)),
          v_owner_nick || ' invited you to Jiran',
          'Hi ' || trim(p_name) || ', ' || v_owner_nick || ' added you to their home on Jiran, the City of Elmina residents app. Open the link within 72 hours to set your password.',
          v_link);

  insert into public.audit_log (actor_id, action, target_table, target_id)
  values (auth.uid(), 'sub_owner_invited', 'sub_owner_invites', v_id);
  return v_link;
end;
$$;

create or replace function public.revoke_sub_owner(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_inv public.sub_owner_invites%rowtype;
begin
  select * into v_inv from public.sub_owner_invites where id = p_invite_id;
  if not found or v_inv.owner_id <> auth.uid() then raise exception 'forbidden'; end if;
  update public.sub_owner_invites set status = 'revoked' where id = p_invite_id;
  if v_inv.accepted_user_id is not null then
    update public.profiles_private set status = 'revoked' where user_id = v_inv.accepted_user_id;
  end if;
  insert into public.audit_log (actor_id, action, target_table, target_id)
  values (auth.uid(), 'sub_owner_revoked', 'sub_owner_invites', p_invite_id);
end;
$$;

-- Health check for /health (no data returned)
create or replace function public.health_ping()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'db', true,
    'at', now(),
    'township', (select name from public.townships order by created_at limit 1),
    'areas', (select count(*) from public.areas));
$$;

revoke execute on function public.submit_verification_docs(text[], uuid), public.decide_verification(uuid, boolean, text),
  public.create_sub_owner_invite(text, text, text), public.revoke_sub_owner(uuid) from public, anon;
grant execute on function public.submit_verification_docs(text[], uuid), public.decide_verification(uuid, boolean, text),
  public.create_sub_owner_invite(text, text, text), public.revoke_sub_owner(uuid) to authenticated;
grant execute on function public.health_ping() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('ownership-docs', 'ownership-docs', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('public-media', 'public-media', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Ownership documents: owner writes into their own folder; owner + management read
create policy "own docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'ownership-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own docs read" on storage.objects for select to authenticated
  using (bucket_id = 'ownership-docs'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_management()));

-- Public media (issue/post/event photos): authenticated upload into own folder, public read via URL
create policy "media upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-media' and (storage.foldername(name))[1] = auth.uid()::text);
