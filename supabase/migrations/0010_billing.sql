-- Jiran phase 9A: billing reminders entered by management. No invented bills.
-- Jiran is not connected to Sime Darby Property's billing system: a bill exists only when management adds it
-- (form or CSV import of real records). Payments happen outside Jiran; only management can mark a bill paid.
-- Reminders are worked out when the app is opened (read time, same approach as scheduled announcements),
-- so no cron job is needed: in-app notifications are only seen in the app anyway.

-- ---------------------------------------------------------------------------
-- Notification settings (used by billing and service requests). No row = everything on.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_prefs (
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  billing           boolean not null default true,
  service_requests  boolean not null default true,
  updated_at        timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
create policy "prefs own read" on public.notification_prefs for select to authenticated using (user_id = auth.uid());

create or replace function private.wants(p_user uuid, p_cat text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select case p_cat when 'billing' then billing when 'service' then service_requests end
                     from public.notification_prefs where user_id = p_user), true)
$$;

create or replace function public.set_notification_pref(p_cat text, p_on boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if p_cat not in ('billing', 'service') then raise exception 'bad_input'; end if;
  insert into public.notification_prefs (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.notification_prefs
     set billing = case when p_cat = 'billing' then p_on else billing end,
         service_requests = case when p_cat = 'service' then p_on else service_requests end,
         updated_at = now()
   where user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Bills: remove the phase 7 demo rows and add what management needs
-- ---------------------------------------------------------------------------
delete from public.billing_reminders where is_demo;
alter table public.billing_reminders drop column is_demo;

alter table public.billing_reminders drop constraint if exists billing_reminders_kind_check;
alter table public.billing_reminders add constraint billing_reminders_kind_check
  check (kind in ('maintenance_fee', 'sinking_fund', 'quit_rent', 'assessment', 'water', 'other'));
alter table public.billing_reminders
  add column township_id         uuid references public.townships(id),
  add column reference           text check (char_length(reference) <= 60),
  add column note                text check (char_length(note) <= 300),
  add column status              text not null default 'open' check (status in ('open', 'void')),
  add column void_reason         text check (char_length(void_reason) <= 300),
  add column invoice_path        text,
  add column reminders_on        boolean not null default true,
  add column reminded_soon_at    timestamptz,
  add column reminded_overdue_at timestamptz,
  add column created_by          uuid references public.profiles(id) on delete set null,
  add column updated_at          timestamptz not null default now();
update public.billing_reminders b set township_id = u.township_id from public.units u where u.id = b.unit_id;
alter table public.billing_reminders alter column township_id set not null;
alter table public.billing_reminders add constraint billing_period_len check (char_length(period) between 1 and 60);
create index if not exists billing_township_due on public.billing_reminders (township_id, due_date);

-- Owners of the unit (not sub-owners) and management only. Enforced here, not in the app.
drop policy if exists "billing owner of unit" on public.billing_reminders;
create policy "billing owner of unit" on public.billing_reminders for select to authenticated
  using (status = 'open' and unit_id = public.my_unit_id() and public.auth_role() = 'owner' and public.is_active_member());
create policy "billing management" on public.billing_reminders for select to authenticated
  using (public.is_management() and township_id = public.my_township());

insert into public.app_config (key, value, description)
values ('billing_reminder_days', '3'::jsonb, 'Days before the due date that owners get a billing reminder (1-30)')
on conflict (key) do nothing;

-- Same rule as billState() in the app: paid, void, overdue (past due), due_soon (within the reminder window), upcoming.
create or replace function private.bill_state(b public.billing_reminders, p_today date, p_days int)
returns text language sql immutable set search_path = ''
as $$
  select case when b.status = 'void' then 'void' when b.paid_at is not null then 'paid'
              when b.due_date < p_today then 'overdue' when b.due_date <= p_today + p_days then 'due_soon' else 'upcoming' end
$$;

create or replace function private.myt_today()
returns date language sql stable set search_path = ''
as $$ select (now() at time zone 'Asia/Kuala_Lumpur')::date $$;

create or replace function private.unit_owners(p_unit uuid)
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select p.id from public.profiles p join public.profiles_private pp on pp.user_id = p.id
   where pp.unit_id = p_unit and p.role = 'owner' and pp.status = 'active'
$$;

-- Read-time reminders: one "due soon" and one "overdue" notification per bill, to every owner of the unit
-- who has billing notifications on, only while the bill's reminder toggle is on.
create or replace function private.flush_bill_reminders(p_township uuid, p_unit uuid default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare b public.billing_reminders%rowtype; v_days int := public.cfg_num('billing_reminder_days', 3)::int;
        v_today date := private.myt_today(); v_state text; v_kind text;
begin
  for b in select * from public.billing_reminders
            where township_id = p_township and (p_unit is null or unit_id = p_unit)
              and status = 'open' and paid_at is null and reminders_on
              and ((reminded_soon_at is null and due_date <= v_today + v_days) or (reminded_overdue_at is null and due_date < v_today))
            for update skip locked
  loop
    v_state := private.bill_state(b, v_today, v_days);
    v_kind := replace(initcap(replace(b.kind, '_', ' ')), 'Fee', 'fee');
    if v_state = 'overdue' and b.reminded_overdue_at is null then
      perform public.notify_user(o, 'billing', 'Bill overdue: ' || v_kind,
        'RM ' || to_char(b.amount, 'FM999,999,990.00') || ' for ' || b.period || ' was due on ' || to_char(b.due_date, 'DD Mon YYYY') || '. Payments are made outside Jiran.', '/app/billing')
        from private.unit_owners(b.unit_id) o where private.wants(o, 'billing');
      update public.billing_reminders set reminded_overdue_at = now(), reminded_soon_at = coalesce(reminded_soon_at, now()) where id = b.id;
    elsif v_state = 'due_soon' and b.reminded_soon_at is null then
      perform public.notify_user(o, 'billing', 'Bill due soon: ' || v_kind,
        'RM ' || to_char(b.amount, 'FM999,999,990.00') || ' for ' || b.period || ' is due on ' || to_char(b.due_date, 'DD Mon YYYY') || '.', '/app/billing')
        from private.unit_owners(b.unit_id) o where private.wants(o, 'billing');
      update public.billing_reminders set reminded_soon_at = now() where id = b.id;
    end if;
  end loop;
end;
$$;

-- Owner's list (own unit only, owners only). Also sends any reminder that has come due.
create or replace function public.my_bills()
returns table (id uuid, kind text, period text, amount numeric, due_date date, paid_at date, reference text, note text,
               state text, reminders_on boolean, has_invoice boolean, soon_days int)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare v_days int := public.cfg_num('billing_reminder_days', 3)::int;
begin
  if public.auth_role() <> 'owner' or not public.is_active_member() or public.my_unit_id() is null then raise exception 'owner_only'; end if;
  perform private.flush_bill_reminders(public.my_township(), public.my_unit_id());
  return query
    select b.id, b.kind, b.period, b.amount, b.due_date, b.paid_at, b.reference, b.note,
           private.bill_state(b, private.myt_today(), v_days), b.reminders_on, b.invoice_path is not null, v_days
      from public.billing_reminders b
     where b.unit_id = public.my_unit_id() and b.status = 'open'
     order by (b.paid_at is not null), b.due_date desc;
end;
$$;

-- Called when an owner opens the app, so reminders arrive without visiting the billing screen.
create or replace function public.bill_reminders_tick()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if public.auth_role() = 'owner' and public.is_active_member() and public.my_unit_id() is not null then
    perform private.flush_bill_reminders(public.my_township(), public.my_unit_id());
  end if;
end;
$$;

create or replace function public.set_bill_reminder(p_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if public.auth_role() <> 'owner' or not public.is_active_member() then raise exception 'owner_only'; end if;
  update public.billing_reminders set reminders_on = coalesce(p_on, true)
   where id = p_id and unit_id = public.my_unit_id() and status = 'open';
  if not found then raise exception 'not_found'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Management
-- ---------------------------------------------------------------------------
create or replace function public.admin_unit_search(p_q text)
returns table (id uuid, label text, area_name text, owners int)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.label, a.name, (select count(*)::int from private.unit_owners(u.id))
    from public.units u join public.areas a on a.id = u.area_id
   where public.is_management() and u.township_id = public.my_township()
     and (coalesce(trim(p_q), '') = '' or u.label ilike '%' || trim(p_q) || '%')
   order by u.label limit 25
$$;

create or replace function public.admin_bills(p_state text default 'all', p_area uuid default null)
returns table (id uuid, unit_id uuid, unit_label text, area_id uuid, area_name text, kind text, period text, amount numeric,
               due_date date, paid_at date, reference text, note text, status text, void_reason text, state text,
               has_invoice boolean, invoice_path text, owners int, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare v_days int := public.cfg_num('billing_reminder_days', 3)::int;
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  perform private.flush_bill_reminders(public.my_township());
  return query
    select * from (
      select b.id, b.unit_id, u.label, a.id, a.name, b.kind, b.period, b.amount, b.due_date, b.paid_at, b.reference, b.note,
             b.status, b.void_reason, private.bill_state(b, private.myt_today(), v_days) st,
             b.invoice_path is not null, b.invoice_path, (select count(*)::int from private.unit_owners(b.unit_id)), b.updated_at
        from public.billing_reminders b join public.units u on u.id = b.unit_id join public.areas a on a.id = u.area_id
       where b.township_id = public.my_township()
         and (p_area is null or a.id = p_area or a.parent_id = p_area)
    ) x
    where coalesce(p_state, 'all') = 'all' or x.st = p_state or (p_state = 'unpaid' and x.st in ('overdue', 'due_soon', 'upcoming'))
    order by x.due_date desc, x.label
    limit 1000;
end;
$$;

create or replace function private.bill_kind(p text)
returns text language sql immutable set search_path = ''
as $$
  select case lower(regexp_replace(trim(coalesce(p, '')), '[\s-]+', '_', 'g'))
    when 'maintenance_fee' then 'maintenance_fee' when 'maintenance' then 'maintenance_fee' when 'service_charge' then 'maintenance_fee'
    when 'sinking_fund' then 'sinking_fund' when 'quit_rent' then 'quit_rent' when 'cukai_tanah' then 'quit_rent'
    when 'assessment' then 'assessment' when 'cukai_taksiran' then 'assessment' when 'water' then 'water' when 'other' then 'other' end
$$;

create or replace function public.save_bill(p_id uuid, p_unit uuid, p_kind text, p_period text, p_amount numeric, p_due date,
                                            p_reference text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_old public.billing_reminders%rowtype; v_id uuid; v_kind text := private.bill_kind(p_kind);
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  if v_kind is null or p_amount is null or p_amount < 0 or p_due is null or char_length(trim(coalesce(p_period, ''))) not between 1 and 60
     or round(p_amount, 2) <> p_amount then raise exception 'bad_input'; end if;
  if not exists (select 1 from public.units where id = p_unit and township_id = public.my_township()) then raise exception 'not_found'; end if;
  if p_id is null then
    insert into public.billing_reminders (township_id, unit_id, kind, period, amount, due_date, reference, note, created_by)
    values (public.my_township(), p_unit, v_kind, trim(p_period), p_amount, p_due,
            nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_note, '')), ''), auth.uid())
    returning id into v_id;
    perform public.notify_user(o, 'billing', 'New bill from management',
      'RM ' || to_char(p_amount, 'FM999,999,990.00') || ' for ' || trim(p_period) || ', due ' || to_char(p_due, 'DD Mon YYYY') || '. Payments are made outside Jiran.', '/app/billing')
      from private.unit_owners(p_unit) o where private.wants(o, 'billing');
    insert into public.audit_log (actor_id, action, target_table, target_id, data)
    values (auth.uid(), 'bill_created', 'billing_reminders', v_id,
            jsonb_build_object('unit_id', p_unit, 'kind', v_kind, 'period', trim(p_period), 'amount', p_amount, 'due_date', p_due));
  else
    select * into v_old from public.billing_reminders where id = p_id and township_id = public.my_township() for update;
    if not found then raise exception 'not_found'; end if;
    if v_old.status = 'void' then raise exception 'bill_void'; end if;
    update public.billing_reminders
       set unit_id = p_unit, kind = v_kind, period = trim(p_period), amount = p_amount, due_date = p_due,
           reference = nullif(trim(coalesce(p_reference, '')), ''), note = nullif(trim(coalesce(p_note, '')), ''),
           reminded_soon_at = case when p_due <> v_old.due_date then null else reminded_soon_at end,
           reminded_overdue_at = case when p_due <> v_old.due_date then null else reminded_overdue_at end,
           updated_at = now()
     where id = p_id;
    v_id := p_id;
    insert into public.audit_log (actor_id, action, target_table, target_id, data)
    values (auth.uid(), 'bill_updated', 'billing_reminders', p_id, jsonb_build_object(
      'before', jsonb_build_object('unit_id', v_old.unit_id, 'kind', v_old.kind, 'period', v_old.period, 'amount', v_old.amount, 'due_date', v_old.due_date),
      'after', jsonb_build_object('unit_id', p_unit, 'kind', v_kind, 'period', trim(p_period), 'amount', p_amount, 'due_date', p_due)));
  end if;
  return v_id;
end;
$$;

create or replace function public.void_bill(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  update public.billing_reminders set status = 'void', void_reason = trim(p_reason), updated_at = now()
   where id = p_id and township_id = public.my_township() and status = 'open';
  if not found then raise exception 'not_found'; end if;
  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), 'bill_voided', 'billing_reminders', p_id, jsonb_build_object('reason', trim(p_reason)));
end;
$$;

-- Paid can only come from management (there is no payment integration). p_paid_on null = undo a mistaken "paid".
create or replace function public.mark_bill_paid(p_id uuid, p_paid_on date)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  if p_paid_on is not null and p_paid_on > private.myt_today() then raise exception 'bad_input'; end if;
  update public.billing_reminders set paid_at = p_paid_on, updated_at = now()
   where id = p_id and township_id = public.my_township() and status = 'open';
  if not found then raise exception 'not_found'; end if;
  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), case when p_paid_on is null then 'bill_unpaid' else 'bill_paid' end, 'billing_reminders', p_id,
          jsonb_build_object('paid_on', p_paid_on));
end;
$$;

-- Invoice files live in the private "invoices" bucket at <unit_id>/<bill_id>/<file>. p_path null removes the link.
create or replace function public.set_bill_invoice(p_id uuid, p_path text)
returns void language plpgsql security definer set search_path = ''
as $$
declare b public.billing_reminders%rowtype;
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  select * into b from public.billing_reminders where id = p_id and township_id = public.my_township();
  if not found then raise exception 'not_found'; end if;
  if p_path is not null and p_path not like b.unit_id::text || '/' || b.id::text || '/%' then raise exception 'bad_input'; end if;
  update public.billing_reminders set invoice_path = p_path, updated_at = now() where id = p_id;
  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), case when p_path is null then 'bill_invoice_removed' else 'bill_invoice_attached' end, 'billing_reminders', p_id,
          jsonb_build_object('path', p_path));
end;
$$;

-- Owners get a short-lived signed link through the storage API; this only says which file belongs to their bill.
create or replace function public.bill_invoice_path(p_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select b.invoice_path from public.billing_reminders b
   where b.id = p_id and b.status = 'open'
     and ((public.is_management() and b.township_id = public.my_township())
          or (public.auth_role() = 'owner' and public.is_active_member() and b.unit_id = public.my_unit_id()))
$$;

-- CSV import: p_rows = [{unit, type, period, amount, due_date, reference}]. Preview (p_commit=false) checks every row
-- and returns its errors; commit inserts all rows only when none has an error.
create or replace function public.import_bills(p_rows jsonb, p_commit boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare r jsonb; i int := 0; v_errs text[]; v_unit uuid; v_label text; v_kind text; v_amount numeric; v_due date;
        v_out jsonb := '[]'::jsonb; v_bad int := 0; v_ins int := 0; v_seen text[] := '{}'; v_key text; v_id uuid;
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'bad_input'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'too_many_rows'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1; v_errs := '{}'; v_unit := null; v_label := null; v_amount := null; v_due := null;
    select u.id, u.label into v_unit, v_label from public.units u
     where u.township_id = public.my_township() and lower(u.label) = lower(trim(coalesce(r->>'unit', '')));
    if v_unit is null then v_errs := v_errs || 'unit_unknown'; end if;
    v_kind := private.bill_kind(r->>'type');
    if v_kind is null then v_errs := v_errs || 'type_unknown'; end if;
    if char_length(trim(coalesce(r->>'period', ''))) not between 1 and 60 then v_errs := v_errs || 'period_missing'; end if;
    begin
      v_amount := replace(replace(trim(coalesce(r->>'amount', '')), ',', ''), 'RM', '')::numeric;
      if v_amount < 0 or round(v_amount, 2) <> v_amount then v_errs := v_errs || 'amount_bad'; end if;
    exception when others then v_errs := v_errs || 'amount_bad';
    end;
    begin
      if coalesce(r->>'due_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'x'; end if;
      v_due := (r->>'due_date')::date;
    exception when others then v_errs := v_errs || 'due_bad'; v_due := null;
    end;
    if char_length(coalesce(r->>'reference', '')) > 60 then v_errs := v_errs || 'reference_long'; end if;
    if v_unit is not null and v_kind is not null and v_due is not null then
      v_key := v_unit::text || v_kind || lower(trim(r->>'period')) || v_due::text;
      if v_key = any(v_seen) then v_errs := v_errs || 'duplicate_in_file'; end if;
      v_seen := v_seen || v_key;
      if exists (select 1 from public.billing_reminders b where b.unit_id = v_unit and b.kind = v_kind and b.status = 'open'
                  and lower(b.period) = lower(trim(r->>'period')) and b.due_date = v_due) then
        v_errs := v_errs || 'already_exists';
      end if;
    end if;
    if cardinality(v_errs) > 0 then v_bad := v_bad + 1; end if;
    v_out := v_out || jsonb_build_object('row', i, 'unit', v_label, 'type', v_kind, 'period', trim(r->>'period'),
                                         'amount', v_amount, 'due_date', v_due, 'errors', to_jsonb(v_errs));
  end loop;
  if p_commit and v_bad = 0 then
    for r in select * from jsonb_array_elements(v_out) loop
      v_id := public.save_bill(null, (select id from public.units where township_id = public.my_township() and label = r->>'unit'),
                               r->>'type', r->>'period', (r->>'amount')::numeric, (r->>'due_date')::date,
                               p_rows -> ((r->>'row')::int - 1) ->> 'reference', null);
      v_ins := v_ins + 1;
    end loop;
    insert into public.audit_log (actor_id, action, target_table, data)
    values (auth.uid(), 'bills_imported', 'billing_reminders', jsonb_build_object('rows', v_ins));
  end if;
  return jsonb_build_object('rows', v_out, 'errors', v_bad, 'inserted', v_ins);
end;
$$;

create or replace function public.set_billing_reminder_days(p_days int)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  if p_days is null or p_days not between 1 and 30 then raise exception 'bad_input'; end if;
  insert into public.app_config (key, value, description) values ('billing_reminder_days', to_jsonb(p_days), 'Days before the due date that owners get a billing reminder (1-30)')
  on conflict (key) do update set value = excluded.value;
  insert into public.audit_log (actor_id, action, target_table, data) values (auth.uid(), 'billing_reminder_days', 'app_config', jsonb_build_object('days', p_days));
end;
$$;

-- ---------------------------------------------------------------------------
-- Invoice files: private bucket. Management uploads; only that unit's owners and management can read.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "invoices management write" on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices' and public.is_management());
create policy "invoices management delete" on storage.objects for delete to authenticated
  using (bucket_id = 'invoices' and public.is_management());
create policy "invoices read owner or management" on storage.objects for select to authenticated
  using (bucket_id = 'invoices' and (
    public.is_management()
    or (public.auth_role() = 'owner' and public.is_active_member()
        and (storage.foldername(name))[1] = public.my_unit_id()::text
        and exists (select 1 from public.billing_reminders b where b.invoice_path = name and b.status = 'open'))));

revoke execute on function public.set_notification_pref(text, boolean), public.my_bills(), public.bill_reminders_tick(),
  public.set_bill_reminder(uuid, boolean), public.admin_unit_search(text), public.admin_bills(text, uuid),
  public.save_bill(uuid, uuid, text, text, numeric, date, text, text), public.void_bill(uuid, text), public.mark_bill_paid(uuid, date),
  public.set_bill_invoice(uuid, text), public.bill_invoice_path(uuid), public.import_bills(jsonb, boolean),
  public.set_billing_reminder_days(int) from public, anon;
grant execute on function public.set_notification_pref(text, boolean), public.my_bills(), public.bill_reminders_tick(),
  public.set_bill_reminder(uuid, boolean), public.admin_unit_search(text), public.admin_bills(text, uuid),
  public.save_bill(uuid, uuid, text, text, numeric, date, text, text), public.void_bill(uuid, text), public.mark_bill_paid(uuid, date),
  public.set_bill_invoice(uuid, text), public.bill_invoice_path(uuid), public.import_bills(jsonb, boolean),
  public.set_billing_reminder_days(int) to authenticated;
