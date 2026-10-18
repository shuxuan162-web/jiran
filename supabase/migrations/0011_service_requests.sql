-- Jiran phase 9B: service requests and enquiries, reworked.
-- Different from complaints: private to the requester's unit and management, no upvotes, no priority score.
-- Categories are a table management can edit; the starting set is a proposal waiting for confirmation.
-- Status history and resident notifications come from a trigger on every status change.

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table public.service_categories (
  id           uuid primary key default gen_random_uuid(),
  township_id  uuid not null references public.townships(id) on delete cascade,
  name         text not null check (char_length(name) between 2 and 40),
  active       boolean not null default true,
  proposed     boolean not null default false,   -- true until management confirms it
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  unique (township_id, name)
);
alter table public.service_categories enable row level security;
create policy "service categories read" on public.service_categories for select to authenticated
  using (township_id = public.my_township());

insert into public.service_categories (township_id, name, proposed, sort_order)
select t.id, x.name, true, x.ord from public.townships t
 cross join (values ('General enquiry', 1), ('Maintenance request', 2), ('Facilities', 3), ('Other', 4)) x(name, ord)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Requests: new fields, new status flow (old rows mapped across)
-- ---------------------------------------------------------------------------
alter table public.service_requests
  add column kind              text not null default 'service' check (kind in ('enquiry', 'service')),
  add column category_id       uuid references public.service_categories(id),
  add column preferred_date    date,
  add column preferred_window  text check (preferred_window in ('morning', 'afternoon', 'evening', 'any')),
  add column contact_pref      text not null default 'app' check (contact_pref in ('app', 'phone', 'email')),
  add column assigned_to       uuid references public.profiles(id) on delete set null,
  add column last_note         text check (char_length(last_note) <= 500),
  add column rating            int check (rating between 1 and 5),
  add column rating_comment    text check (char_length(rating_comment) <= 500),
  add column rated_at          timestamptz;

update public.service_requests r
   set category_id = (select c.id from public.service_categories c where c.township_id = r.township_id and c.name =
       case r.category when 'other' then 'Other' when 'access_card' then 'General enquiry' else 'Maintenance request' end);
alter table public.service_requests drop constraint if exists service_requests_category_check;
alter table public.service_requests drop column category, drop column preferred_time, drop column staff_note;
alter table public.service_requests alter column category_id set not null;

alter table public.service_requests drop constraint if exists service_requests_status_check;
update public.service_requests set status = 'assigned' where status = 'scheduled';
update public.service_requests set status = 'completed' where status = 'done';
alter table public.service_requests add constraint service_requests_status_check
  check (status in ('submitted', 'acknowledged', 'assigned', 'in_progress', 'completed', 'cancelled'));
alter table public.service_requests add constraint service_requests_rating_done check (rating is null or status = 'completed');
create index if not exists service_requests_assigned on public.service_requests (assigned_to);

-- Requester always; the unit's owner sees everything for the unit; sub-owners see only their own. Management sees all.
drop policy if exists "service own unit or management" on public.service_requests;
create policy "service requester owner or management" on public.service_requests for select to authenticated
  using (requester_id = auth.uid()
         or (public.auth_role() = 'owner' and public.is_active_member() and unit_id is not null and unit_id = public.my_unit_id())
         or (public.is_management() and township_id = public.my_township()));

-- ---------------------------------------------------------------------------
-- Status history (visible with the request) and internal notes (management only)
-- ---------------------------------------------------------------------------
create table public.service_request_history (
  id          bigserial primary key,
  request_id  uuid not null references public.service_requests(id) on delete cascade,
  status      text not null,
  note        text,
  actor_id    uuid references public.profiles(id) on delete set null,
  handler_id  uuid references public.profiles(id) on delete set null,
  at          timestamptz not null default now()
);
create index on public.service_request_history (request_id, at);
alter table public.service_request_history enable row level security;
create policy "service history follows request" on public.service_request_history for select to authenticated
  using (exists (select 1 from public.service_requests r where r.id = request_id));

create table public.service_request_notes (
  id          bigserial primary key,
  request_id  uuid not null references public.service_requests(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null check (char_length(body) between 1 and 1000),
  at          timestamptz not null default now()
);
create index on public.service_request_notes (request_id, at);
alter table public.service_request_notes enable row level security;
create policy "service notes management" on public.service_request_notes for select to authenticated
  using (public.is_management() and exists (select 1 from public.service_requests r where r.id = request_id and r.township_id = public.my_township()));

-- Backfill history for rows that existed before this migration
insert into public.service_request_history (request_id, status, at)
select id, 'submitted', created_at from public.service_requests;
insert into public.service_request_history (request_id, status, at)
select id, status, updated_at from public.service_requests where status <> 'submitted';

create or replace function private.service_word(p text)
returns text language sql immutable set search_path = ''
as $$
  select case p when 'submitted' then 'Submitted' when 'acknowledged' then 'Acknowledged' when 'assigned' then 'Assigned'
    when 'in_progress' then 'In progress' when 'completed' then 'Completed' when 'cancelled' then 'Cancelled' else p end
$$;

create or replace function public.trg_service_history()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.service_request_history (request_id, status, actor_id) values (new.id, new.status, auth.uid());
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.service_request_history (request_id, status, note, actor_id, handler_id)
    values (new.id, new.status, new.last_note, auth.uid(), new.assigned_to);
    -- Tell the requester (unless they made the change themselves), if they want service updates
    if new.requester_id is not null and new.requester_id is distinct from auth.uid() and private.wants(new.requester_id, 'service') then
      perform public.notify_user(new.requester_id, 'service', new.ref_no || ': ' || private.service_word(new.status),
        coalesce(new.last_note, case new.status when 'acknowledged' then 'Management has seen your request.'
          when 'assigned' then 'Someone has been assigned to your request.' when 'in_progress' then 'Work on your request has started.'
          when 'completed' then 'Your request is complete. You can rate how it went.' when 'cancelled' then 'Your request was cancelled.' else null end),
        '/app/services/requests/' || new.id);
    end if;
  elsif new.assigned_to is distinct from old.assigned_to then
    insert into public.service_request_history (request_id, status, note, actor_id, handler_id)
    values (new.id, new.status, coalesce(new.last_note, 'Handled by someone else now'), auth.uid(), new.assigned_to);
  end if;
  return new;
end;
$$;
create trigger service_history after insert or update on public.service_requests
  for each row execute function public.trg_service_history();

-- ---------------------------------------------------------------------------
-- Resident functions
-- ---------------------------------------------------------------------------
drop function if exists public.create_service_request(text, text, text, text[]);
drop function if exists public.update_service_request(uuid, text, text, timestamptz);

create or replace function public.create_service_request(p_kind text, p_category uuid, p_description text, p_preferred_date date,
  p_preferred_window text, p_contact text, p_photo_paths text[] default '{}')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_ref text;
begin
  if not public.is_active_member() or public.auth_role() not in ('owner', 'sub_owner') then raise exception 'forbidden'; end if;
  if private.hit_rate_limit('service_day', auth.uid()::text, 5, interval '1 day') then raise exception 'rate_limited'; end if;
  if p_kind not in ('enquiry', 'service') or coalesce(p_contact, 'app') not in ('app', 'phone', 'email')
     or (p_preferred_window is not null and p_preferred_window not in ('morning', 'afternoon', 'evening', 'any')) then raise exception 'bad_input'; end if;
  if not exists (select 1 from public.service_categories where id = p_category and township_id = public.my_township() and active) then raise exception 'bad_input'; end if;
  if char_length(trim(coalesce(p_description, ''))) < 10 then raise exception 'description_short'; end if;
  if p_preferred_date is not null and (p_preferred_date < private.myt_today() or p_preferred_date > private.myt_today() + 90) then raise exception 'bad_input'; end if;
  if exists (select 1 from unnest(coalesce(p_photo_paths, '{}')) x where split_part(x, '/', 1) <> auth.uid()::text) then raise exception 'forbidden'; end if;
  v_ref := 'SR-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYMM') || '-' || lpad(nextval('public.service_ref_seq')::text, 4, '0');
  insert into public.service_requests (township_id, ref_no, requester_id, unit_id, kind, category_id, description,
                                       preferred_date, preferred_window, contact_pref, photo_paths)
  values (public.my_township(), v_ref, auth.uid(), public.my_unit_id(), p_kind, p_category, trim(p_description),
          p_preferred_date, case when p_preferred_date is null then null else coalesce(p_preferred_window, 'any') end,
          coalesce(p_contact, 'app'), coalesce(p_photo_paths[1:3], '{}'))
  returning id into v_id;
  insert into public.notifications (user_id, kind, title, body, link)
  select p.id, 'service', case p_kind when 'enquiry' then 'New enquiry ' else 'New service request ' end || v_ref,
         left(trim(p_description), 120), '/admin/services?id=' || v_id
    from public.profiles p join public.profiles_private pp on pp.user_id = p.id
   where p.role = 'management' and pp.status = 'active' and p.township_id = public.my_township();
  return jsonb_build_object('id', v_id, 'ref_no', v_ref);
end;
$$;

-- List of requests the caller may see (RLS decides), newest first
create or replace function public.my_service_requests()
returns table (id uuid, ref_no text, kind text, category text, description text, status text, created_at timestamptz,
               updated_at timestamptz, mine boolean, requester text)
language sql stable security invoker set search_path = ''
as $$
  select r.id, r.ref_no, r.kind, c.name, r.description, r.status, r.created_at, r.updated_at, r.requester_id = auth.uid(),
         (select nickname from public.profiles where id = r.requester_id)
    from public.service_requests r join public.service_categories c on c.id = r.category_id
   where r.requester_id = auth.uid()
      or (public.auth_role() = 'owner' and public.is_active_member() and r.unit_id = public.my_unit_id())
   order by r.created_at desc limit 200
$$;

-- One request with its timeline. Internal notes only for management. Handler shown by nickname and role, never contact details.
create or replace function public.service_request_detail(p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare r public.service_requests%rowtype; v jsonb;
begin
  select * into r from public.service_requests where id = p_id;   -- RLS applies
  if not found then raise exception 'not_found'; end if;
  v := jsonb_build_object(
    'id', r.id, 'ref_no', r.ref_no, 'kind', r.kind, 'category_id', r.category_id,
    'category', (select name from public.service_categories where id = r.category_id),
    'description', r.description, 'status', r.status, 'photo_paths', to_jsonb(r.photo_paths),
    'preferred_date', r.preferred_date, 'preferred_window', r.preferred_window, 'contact_pref', r.contact_pref,
    'created_at', r.created_at, 'updated_at', r.updated_at, 'rating', r.rating, 'rating_comment', r.rating_comment,
    'mine', r.requester_id = auth.uid(),
    'requester', (select nickname from public.profiles where id = r.requester_id),
    'handler', (select jsonb_build_object('id', p.id, 'nickname', p.nickname, 'role', p.role) from public.profiles p where p.id = r.assigned_to),
    'can_cancel', r.requester_id = auth.uid() and r.status in ('submitted', 'acknowledged'),
    'can_rate', r.requester_id = auth.uid() and r.status = 'completed' and r.rating is null,
    'history', coalesce((select jsonb_agg(jsonb_build_object('status', h.status, 'note', h.note, 'at', h.at,
                 'handler', (select nickname from public.profiles where id = h.handler_id)) order by h.at, h.id)
               from public.service_request_history h where h.request_id = r.id), '[]'::jsonb));
  if public.is_management() then
    v := v || jsonb_build_object(
      'unit', (select label from public.units where id = r.unit_id),
      'area', (select a.name from public.units u join public.areas a on a.id = u.area_id where u.id = r.unit_id),
      'requester_contact', case r.contact_pref when 'app' then null else
         (select case r.contact_pref when 'phone' then pp.phone else pp.email end from public.profiles_private pp where pp.user_id = r.requester_id) end,
      'notes', coalesce((select jsonb_agg(jsonb_build_object('body', n.body, 'at', n.at,
                 'author', (select nickname from public.profiles where id = n.author_id)) order by n.at)
               from public.service_request_notes n where n.request_id = r.id), '[]'::jsonb));
  end if;
  return v;
end;
$$;

create or replace function public.cancel_service_request(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.service_requests set status = 'cancelled', last_note = 'Cancelled by the resident', updated_at = now()
   where id = p_id and requester_id = auth.uid() and status in ('submitted', 'acknowledged');
  if not found then raise exception 'cannot_cancel'; end if;
  insert into public.audit_log (actor_id, action, target_table, target_id) values (auth.uid(), 'service_cancelled_by_resident', 'service_requests', p_id);
end;
$$;

create or replace function public.rate_service_request(p_id uuid, p_rating int, p_comment text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'bad_input'; end if;
  update public.service_requests set rating = p_rating, rating_comment = nullif(trim(coalesce(p_comment, '')), ''), rated_at = now()
   where id = p_id and requester_id = auth.uid() and status = 'completed' and rating is null;
  if not found then raise exception 'not_found'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Management functions
-- ---------------------------------------------------------------------------
create or replace function public.service_staff()
returns table (id uuid, nickname text, role public.user_role)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.nickname, p.role from public.profiles p join public.profiles_private pp on pp.user_id = p.id
   where public.is_management() and p.township_id = public.my_township() and p.role in ('management', 'security') and pp.status = 'active'
   order by p.role, p.nickname
$$;

create or replace function public.service_queue(p_status text default 'open', p_category uuid default null, p_area uuid default null)
returns table (id uuid, ref_no text, kind text, category text, description text, status text, created_at timestamptz, updated_at timestamptz,
               unit text, area text, handler text, rating int, photos int)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.ref_no, r.kind, c.name, r.description, r.status, r.created_at, r.updated_at, u.label, a.name,
         (select nickname from public.profiles where id = r.assigned_to), r.rating, cardinality(r.photo_paths)
    from public.service_requests r join public.service_categories c on c.id = r.category_id
    left join public.units u on u.id = r.unit_id left join public.areas a on a.id = u.area_id
   where public.is_management() and r.township_id = public.my_township()
     and (coalesce(p_status, 'all') = 'all' or (p_status = 'open' and r.status not in ('completed', 'cancelled')) or r.status = p_status)
     and (p_category is null or r.category_id = p_category)
     and (p_area is null or a.id = p_area or a.parent_id = p_area)
   order by case r.status when 'submitted' then 0 when 'acknowledged' then 1 when 'assigned' then 2 when 'in_progress' then 3 else 4 end, r.created_at
   limit 500
$$;

-- Forward-only status moves; "assigned" and later need a handler. A note (optional) is sent to the requester.
create or replace function public.update_service_request(p_id uuid, p_status text, p_note text default null, p_assignee uuid default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.service_requests%rowtype; v_order text[] := array['submitted', 'acknowledged', 'assigned', 'in_progress', 'completed'];
        v_assignee uuid; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  select * into r from public.service_requests where id = p_id and township_id = public.my_township() for update;
  if not found then raise exception 'not_found'; end if;
  if r.status in ('completed', 'cancelled') then raise exception 'request_closed'; end if;
  if p_status <> 'cancelled' and (array_position(v_order, p_status) is null or array_position(v_order, p_status) < array_position(v_order, r.status)) then
    raise exception 'bad_status';
  end if;
  v_assignee := coalesce(p_assignee, r.assigned_to);
  if p_assignee is not null and not exists (select 1 from public.profiles where id = p_assignee and township_id = public.my_township() and role in ('management', 'security')) then
    raise exception 'bad_input';
  end if;
  if p_status in ('assigned', 'in_progress', 'completed') and v_assignee is null then raise exception 'assignee_required'; end if;
  if p_status = r.status and v_assignee is not distinct from r.assigned_to and v_note is null then return; end if;
  update public.service_requests set status = p_status, assigned_to = v_assignee, last_note = v_note, updated_at = now() where id = p_id;
  -- Same status, new note only: add it to the timeline and tell the requester
  if p_status = r.status and v_assignee is not distinct from r.assigned_to then
    insert into public.service_request_history (request_id, status, note, actor_id, handler_id) values (p_id, p_status, v_note, auth.uid(), v_assignee);
    if r.requester_id is not null and private.wants(r.requester_id, 'service') then
      perform public.notify_user(r.requester_id, 'service', r.ref_no || ': update', v_note, '/app/services/requests/' || p_id);
    end if;
  end if;
  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), 'service_' || p_status, 'service_requests', p_id, jsonb_build_object('note', v_note, 'assignee', v_assignee, 'from', r.status));
end;
$$;

create or replace function public.add_service_note(p_id uuid, p_body text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.service_requests where id = p_id and township_id = public.my_township()) then raise exception 'not_found'; end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then raise exception 'bad_input'; end if;
  insert into public.service_request_notes (request_id, author_id, body) values (p_id, auth.uid(), left(trim(p_body), 1000));
  insert into public.audit_log (actor_id, action, target_table, target_id) values (auth.uid(), 'service_internal_note', 'service_requests', p_id);
end;
$$;

create or replace function public.save_service_category(p_id uuid, p_name text, p_active boolean, p_sort int default 0)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 40 then raise exception 'bad_input'; end if;
  if p_id is null then
    insert into public.service_categories (township_id, name, active, proposed, sort_order)
    values (public.my_township(), trim(p_name), coalesce(p_active, true), false, coalesce(p_sort, 0)) returning id into v_id;
  else
    update public.service_categories set name = trim(p_name), active = coalesce(p_active, active), proposed = false, sort_order = coalesce(p_sort, sort_order)
     where id = p_id and township_id = public.my_township() returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
  end if;
  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), 'service_category_saved', 'service_categories', v_id, jsonb_build_object('name', trim(p_name), 'active', p_active));
  return v_id;
end;
$$;

revoke execute on function public.create_service_request(text, uuid, text, date, text, text, text[]), public.my_service_requests(),
  public.service_request_detail(uuid), public.cancel_service_request(uuid), public.rate_service_request(uuid, int, text),
  public.service_staff(), public.service_queue(text, uuid, uuid), public.update_service_request(uuid, text, text, uuid),
  public.add_service_note(uuid, text), public.save_service_category(uuid, text, boolean, int) from public, anon;
grant execute on function public.create_service_request(text, uuid, text, date, text, text, text[]), public.my_service_requests(),
  public.service_request_detail(uuid), public.cancel_service_request(uuid), public.rate_service_request(uuid, int, text),
  public.service_staff(), public.service_queue(text, uuid, uuid), public.update_service_request(uuid, text, text, uuid),
  public.add_service_note(uuid, text), public.save_service_category(uuid, text, boolean, int) to authenticated;
