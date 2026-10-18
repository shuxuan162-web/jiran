-- Jiran phase 6: property enquiries and viewing requests.
-- Residents send name, mobile number and email (with privacy consent) so the property team can contact them.
-- Only management can read enquiries; the resident sees their own. Sending goes through submit_enquiry() only.

create table public.property_enquiries (
  id             uuid primary key default gen_random_uuid(),
  township_id    uuid not null references public.townships(id),
  property_slug  text not null check (property_slug in ('kanopi-residences', 'elmina-ridge-2', 'jumpa', 'elmina-business-park')),
  kind           text not null default 'enquiry' check (kind in ('enquiry', 'viewing')),
  user_id        uuid references public.profiles(id) on delete set null,
  full_name      text not null check (char_length(full_name) between 2 and 80),
  phone          text not null check (phone ~ '^\+?[0-9]{9,13}$'),
  email          text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 160),
  consent        boolean not null check (consent),
  status         text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  staff_note     text check (char_length(staff_note) <= 500),
  handled_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.property_enquiries (township_id, created_at desc);
create index on public.property_enquiries (user_id);

alter table public.property_enquiries enable row level security;
create policy "enquiries own or management" on public.property_enquiries for select to authenticated
  using (user_id = auth.uid() or (public.is_management() and township_id = public.my_township()));

create or replace function public.submit_enquiry(p_property text, p_kind text, p_name text, p_phone text, p_email text, p_consent boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g'); v_ref text;
begin
  if not public.is_active_member() then raise exception 'forbidden'; end if;
  if not coalesce(p_consent, false) then raise exception 'consent_required'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'bad_name'; end if;
  if v_phone !~ '^\+?[0-9]{9,13}$' then raise exception 'bad_phone'; end if;
  if trim(coalesce(p_email, '')) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email'; end if;
  if private.hit_rate_limit('enquiry_day', auth.uid()::text, 5, interval '1 day') then raise exception 'rate_limited'; end if;
  if exists (select 1 from public.property_enquiries where user_id = auth.uid() and property_slug = p_property
              and status = 'new' and created_at > now() - interval '1 day') then
    raise exception 'enquiry_recent';
  end if;
  insert into public.property_enquiries (township_id, property_slug, kind, user_id, full_name, phone, email, consent)
  values (public.my_township(), p_property, coalesce(nullif(p_kind, ''), 'enquiry'), auth.uid(), trim(p_name), v_phone, lower(trim(p_email)), true)
  returning id into v_id;
  v_ref := 'ENQ-' || upper(left(replace(v_id::text, '-', ''), 6));
  -- Management sees it at once; the sales team copy is simulated (demo mode never emails anyone).
  insert into public.notifications (user_id, kind, title, body, link)
  select p.id, 'enquiry', 'New property ' || case when p_kind = 'viewing' then 'viewing request' else 'enquiry' end || ': ' || p_property,
         v_ref || ' from ' || trim(p_name), '/admin/content'
    from public.profiles p join public.profiles_private pp on pp.user_id = p.id
   where p.role = 'management' and pp.status = 'active' and p.township_id = public.my_township();
  insert into public.email_outbox (kind, sender_id, to_email, subject, body, link)
  values ('enquiry', auth.uid(), 'property-sales@jiran.example.com',
          v_ref || ': ' || case when p_kind = 'viewing' then 'Viewing request' else 'Enquiry' end || ' for ' || p_property,
          'Name: ' || trim(p_name) || E'\nMobile: ' || v_phone || E'\nEmail: ' || lower(trim(p_email)) || E'\nConsent to be contacted: yes', '/admin/content');
  perform public.notify_user(auth.uid(), 'enquiry', 'We got your ' || case when p_kind = 'viewing' then 'viewing request' else 'enquiry' end,
    'Reference ' || v_ref || '. The property team will contact you by phone or email.', '/app/properties/' || p_property);
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end;
$$;

create or replace function public.update_enquiry(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  update public.property_enquiries
     set status = p_status, staff_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), staff_note), handled_by = auth.uid(), updated_at = now()
   where id = p_id and township_id = public.my_township();
  if not found then raise exception 'not_found'; end if;
  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), 'enquiry_' || p_status, 'property_enquiries', p_id, jsonb_build_object('note', p_note));
end;
$$;

revoke execute on function public.submit_enquiry(text, text, text, text, text, boolean), public.update_enquiry(uuid, text, text) from public, anon;
grant execute on function public.submit_enquiry(text, text, text, text, text, boolean), public.update_enquiry(uuid, text, text) to authenticated;
