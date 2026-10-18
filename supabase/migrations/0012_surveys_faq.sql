-- Jiran: management-editable FAQ and simple surveys (Surveys and FAQ section).
-- FAQ: starts with the questions the app already showed (about how Jiran works; contact details verified on the
-- official site). Management can edit, hide, reorder and add. Surveys: management writes a short survey, opens it,
-- residents answer once, management sees totals and comments without names.

-- ---------------------------------------------------------------------------
-- FAQ
-- ---------------------------------------------------------------------------
create table public.faqs (
  id           uuid primary key default gen_random_uuid(),
  township_id  uuid not null references public.townships(id) on delete cascade,
  slug         text,
  category     text not null default 'other' check (category in ('reporting', 'emergency', 'community', 'account', 'services', 'contact', 'other')),
  question     text not null check (char_length(question) between 5 and 200),
  answer       text not null check (char_length(answer) between 5 and 2000),
  link_to      text check (link_to is null or link_to ~ '^/app/[a-z0-9/_-]*$'),
  link_label   text check (char_length(link_label) <= 40),
  keywords     text[] not null default '{}',
  sort_order   int not null default 0,
  active       boolean not null default true,
  updated_by   uuid references public.profiles(id) on delete set null,
  updated_at   timestamptz not null default now()
);
create index on public.faqs (township_id, sort_order);
alter table public.faqs enable row level security;
create policy "faqs read" on public.faqs for select to authenticated
  using (township_id = public.my_township() and (active or public.is_management()));

insert into public.faqs (township_id, slug, category, question, answer, link_to, link_label, keywords, sort_order)
select t.id, x.* from public.townships t cross join (values
  ($q$report$q$, $q$reporting$q$, $q$How do I report a problem like a pothole or a broken street light?$q$, $q$Tap the + button on the Map or Residence tab, drop a pin, pick a category and describe it. You get a reference number and can follow every step in Profile > My activity.$q$, $q$/app/report$q$, $q$Report an issue$q$, array[$q$report$q$, $q$pothole$q$, $q$lamp$q$, $q$light$q$, $q$drain$q$, $q$complaint$q$, $q$aduan$q$]::text[], 10),
  ($q$priority$q$, $q$reporting$q$, $q$Why is my report not at the top of the list?$q$, $q$Reports are ordered by a published formula: how serious it is, how many neighbours upvoted, how many homes are affected and how long it has waited. Emergencies always come first. Upvote reports that affect you too.$q$, $q$/app/issues$q$, $q$See the queue$q$, array[$q$priority$q$, $q$queue$q$, $q$order$q$, $q$slow$q$, $q$upvote$q$, $q$rank$q$]::text[], 20),
  ($q$duplicate$q$, $q$reporting$q$, $q$Someone already reported the same thing. What should I do?$q$, $q$Upvote their report instead of sending a new one. When you report, Jiran shows similar reports nearby so you can upvote with one tap.$q$, null, null, array[$q$duplicate$q$, $q$same$q$, $q$already$q$, $q$upvote$q$]::text[], 30),
  ($q$fixed$q$, $q$reporting$q$, $q$It says fixed, but it isn't. What now?$q$, $q$Open the report and answer "No, not fixed". It reopens with a higher priority and township management is told.$q$, null, null, array[$q$fixed$q$, $q$not fixed$q$, $q$reopen$q$, $q$still broken$q$]::text[], 40),
  ($q$sos$q$, $q$emergency$q$, $q$What happens when I press SOS?$q$, $q$Township management and the security desk are alerted at once with your location, and your phone offers to call 999. In demo mode no real call is made. Use SOS only for real danger; false alarms can pause SOS on your account.$q$, $q$/app/emergency$q$, $q$Emergency screen$q$, array[$q$sos$q$, $q$emergency$q$, $q$999$q$, $q$danger$q$, $q$kecemasan$q$, $q$help$q$]::text[], 50),
  ($q$privacy-map$q$, $q$account$q$, $q$Can neighbours see where I live?$q$, $q$No. Neighbours see your nickname and character only. On the map you appear at your precinct level (and only when at least 5 residents there are visible), never at your unit. You can hide yourself or use ghost mode in Settings.$q$, $q$/app/profile/settings$q$, $q$Settings$q$, array[$q$privacy$q$, $q$location$q$, $q$address$q$, $q$hide$q$, $q$ghost$q$, $q$map$q$]::text[], 60),
  ($q$subowner$q$, $q$account$q$, $q$How do I add my family or tenant?$q$, $q$Owners can invite up to 6 sub-owners from Profile > Register sub-owner. They get an invite link and set their own password.$q$, $q$/app/profile/sub-owners$q$, $q$Sub-owners$q$, array[$q$family$q$, $q$tenant$q$, $q$sub-owner$q$, $q$invite$q$, $q$add$q$]::text[], 70),
  ($q$visitor$q$, $q$services$q$, $q$How do I register a visitor?$q$, $q$Go to Services > Visitor passes, enter your visitor's name, car plate and date, then share the QR code with them. The guard scans it at the entrance and you get a notification when they arrive.$q$, $q$/app/services/visitors$q$, $q$Visitor passes$q$, array[$q$visitor$q$, $q$guest$q$, $q$pass$q$, $q$qr$q$, $q$guard$q$, $q$pelawat$q$]::text[], 80),
  ($q$service$q$, $q$services$q$, $q$How do I request help inside my home or for an access card?$q$, $q$Use Services > Service requests. Choose an enquiry or a service request, pick a category, describe what you need and, if you like, a preferred day. You get a reference number and can follow each step. The home owner can also see requests made for the unit.$q$, $q$/app/services/requests$q$, $q$Service requests$q$, array[$q$aircond$q$, $q$plumbing$q$, $q$access card$q$, $q$repair$q$, $q$service$q$, $q$renovation$q$]::text[], 90),
  ($q$billing$q$, $q$services$q$, $q$Can I pay my bills in Jiran?$q$, $q$No. Payments are made outside Jiran, through the usual official channels. Owners see reminders under Billing once the management office adds them.$q$, $q$/app/billing$q$, $q$Billing$q$, array[$q$bill$q$, $q$pay$q$, $q$payment$q$, $q$fee$q$, $q$maintenance fee$q$, $q$bil$q$]::text[], 100),
  ($q$xp$q$, $q$community$q$, $q$What are XP and levels for?$q$, $q$XP thanks you for helping the neighbourhood: accepted reports, confirming fixes, joining events. It only unlocks looks for your character. It never changes how fast a report is fixed.$q$, $q$/app/rewards$q$, $q$Rewards$q$, array[$q$xp$q$, $q$level$q$, $q$points$q$, $q$badge$q$, $q$quest$q$, $q$reward$q$]::text[], 110),
  ($q$event$q$, $q$community$q$, $q$How do I check in at an event?$q$, $q$On the day, open the event and tap Check in when you are there, or scan the host's QR code with Scan QR.$q$, $q$/app/scan$q$, $q$Scan QR$q$, array[$q$event$q$, $q$check in$q$, $q$qr$q$, $q$scan$q$, $q$acara$q$]::text[], 120),
  ($q$contact$q$, $q$contact$q$, $q$How do I contact Sime Darby Property?$q$, $q$Toll-free line 1-800-88-1118, Monday to Friday 8.30am to 5.30pm (excluding public holidays). From outside Malaysia call +603-7849 5000. The City of Elmina page also lists +603-7849 5700.$q$, null, null, array[$q$contact$q$, $q$phone$q$, $q$call$q$, $q$number$q$, $q$hotline$q$, $q$sime darby$q$, $q$hubungi$q$]::text[], 130),
  ($q$mall$q$, $q$contact$q$, $q$When is Elmina Lakeside Mall open?$q$, $q$Monday to Sunday, 10.00am to 10.00pm, as listed on the official mall page. The Mall tab has the shop directory.$q$, $q$/app/mall$q$, $q$Mall$q$, array[$q$mall$q$, $q$lakeside$q$, $q$shop$q$, $q$open$q$, $q$hours$q$]::text[], 140)
) x(slug, category, question, answer, link_to, link_label, keywords, sort_order);

create or replace function public.save_faq(p_id uuid, p_category text, p_question text, p_answer text, p_keywords text[],
  p_link_to text, p_link_label text, p_sort int, p_active boolean)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  if (nullif(trim(coalesce(p_link_to, '')), '') is null) <> (nullif(trim(coalesce(p_link_label, '')), '') is null) then raise exception 'bad_input'; end if;
  if p_id is null then
    insert into public.faqs (township_id, category, question, answer, keywords, link_to, link_label, sort_order, active, updated_by)
    values (public.my_township(), coalesce(p_category, 'other'), trim(p_question), trim(p_answer),
            coalesce((select array_agg(lower(trim(k))) from unnest(p_keywords) k where trim(k) <> ''), '{}'),
            nullif(trim(coalesce(p_link_to, '')), ''), nullif(trim(coalesce(p_link_label, '')), ''), coalesce(p_sort, 0), coalesce(p_active, true), auth.uid())
    returning id into v_id;
  else
    update public.faqs set category = coalesce(p_category, category), question = trim(p_question), answer = trim(p_answer),
           keywords = coalesce((select array_agg(lower(trim(k))) from unnest(p_keywords) k where trim(k) <> ''), '{}'),
           link_to = nullif(trim(coalesce(p_link_to, '')), ''), link_label = nullif(trim(coalesce(p_link_label, '')), ''),
           sort_order = coalesce(p_sort, sort_order), active = coalesce(p_active, active), updated_by = auth.uid(), updated_at = now()
     where id = p_id and township_id = public.my_township() returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
  end if;
  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), case when p_id is null then 'faq_created' else 'faq_updated' end, 'faqs', v_id,
          jsonb_build_object('question', trim(p_question), 'active', p_active));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Surveys
-- ---------------------------------------------------------------------------
create table public.surveys (
  id           uuid primary key default gen_random_uuid(),
  township_id  uuid not null references public.townships(id) on delete cascade,
  title        text not null check (char_length(title) between 3 and 100),
  intro        text check (char_length(intro) <= 500),
  status       text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  opened_at    timestamptz,
  closed_at    timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create table public.survey_questions (
  id         uuid primary key default gen_random_uuid(),
  survey_id  uuid not null references public.surveys(id) on delete cascade,
  position   int not null,
  kind       text not null check (kind in ('rating', 'choice', 'text')),
  prompt     text not null check (char_length(prompt) between 3 and 200),
  options    text[] not null default '{}',
  required   boolean not null default true,
  unique (survey_id, position)
);
create table public.survey_responses (
  id          uuid primary key default gen_random_uuid(),
  survey_id   uuid not null references public.surveys(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (survey_id, user_id)
);
create table public.survey_answers (
  response_id  uuid not null references public.survey_responses(id) on delete cascade,
  question_id  uuid not null references public.survey_questions(id) on delete cascade,
  rating       int check (rating between 1 and 5),
  choice       text,
  text_answer  text check (char_length(text_answer) <= 1000),
  primary key (response_id, question_id)
);
alter table public.surveys enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_answers enable row level security;
create policy "surveys read" on public.surveys for select to authenticated
  using (township_id = public.my_township() and (status <> 'draft' or public.is_management()));
create policy "survey questions read" on public.survey_questions for select to authenticated
  using (exists (select 1 from public.surveys s where s.id = survey_id));
create policy "survey responses own" on public.survey_responses for select to authenticated using (user_id = auth.uid());
-- Answers are never read directly; management sees totals through survey_results().

create or replace function public.admin_surveys()
returns table (id uuid, title text, intro text, status text, opened_at timestamptz, closed_at timestamptz, created_at timestamptz,
               questions int, responses int)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.title, s.intro, s.status, s.opened_at, s.closed_at, s.created_at,
         (select count(*)::int from public.survey_questions q where q.survey_id = s.id),
         (select count(*)::int from public.survey_responses r where r.survey_id = s.id)
    from public.surveys s where public.is_management() and s.township_id = public.my_township()
   order by s.created_at desc
$$;

-- p_questions = [{kind, prompt, options[], required}] ; only drafts can be changed
create or replace function public.save_survey(p_id uuid, p_title text, p_intro text, p_questions jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; q jsonb; i int := 0;
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) not between 1 and 10 then raise exception 'bad_input'; end if;
  if p_id is null then
    insert into public.surveys (township_id, title, intro, created_by) values (public.my_township(), trim(p_title), nullif(trim(coalesce(p_intro, '')), ''), auth.uid())
    returning id into v_id;
  else
    update public.surveys set title = trim(p_title), intro = nullif(trim(coalesce(p_intro, '')), '')
     where id = p_id and township_id = public.my_township() and status = 'draft' returning id into v_id;
    if v_id is null then raise exception 'survey_locked'; end if;
    delete from public.survey_questions where survey_id = v_id;
  end if;
  for q in select * from jsonb_array_elements(p_questions) loop
    i := i + 1;
    if q->>'kind' = 'choice' and (jsonb_typeof(q->'options') <> 'array' or jsonb_array_length(q->'options') not between 2 and 8) then raise exception 'bad_input'; end if;
    insert into public.survey_questions (survey_id, position, kind, prompt, options, required)
    values (v_id, i, q->>'kind', trim(q->>'prompt'),
            case when q->>'kind' = 'choice' then (select array_agg(trim(o)) from jsonb_array_elements_text(q->'options') o where trim(o) <> '') else '{}' end,
            coalesce((q->>'required')::boolean, true));
  end loop;
  insert into public.audit_log (actor_id, action, target_table, target_id, data)
  values (auth.uid(), case when p_id is null then 'survey_created' else 'survey_updated' end, 'surveys', v_id, jsonb_build_object('title', trim(p_title)));
  return v_id;
end;
$$;

-- draft -> open (residents are told) -> closed
create or replace function public.set_survey_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
declare s public.surveys%rowtype;
begin
  if not public.is_management() then raise exception 'forbidden'; end if;
  select * into s from public.surveys where id = p_id and township_id = public.my_township() for update;
  if not found then raise exception 'not_found'; end if;
  if not ((s.status = 'draft' and p_status = 'open') or (s.status = 'open' and p_status = 'closed')) then raise exception 'bad_status'; end if;
  update public.surveys set status = p_status,
         opened_at = case when p_status = 'open' then now() else opened_at end,
         closed_at = case when p_status = 'closed' then now() else closed_at end
   where id = p_id;
  if p_status = 'open' then
    insert into public.notifications (user_id, kind, title, body, link)
    select p.id, 'survey', 'New survey: ' || s.title, coalesce(s.intro, 'Township management would like your views. It takes a minute.'), '/app/surveys/' || s.id
      from public.profiles p join public.profiles_private pp on pp.user_id = p.id
     where p.township_id = s.township_id and p.role in ('owner', 'sub_owner') and pp.status = 'active';
  end if;
  insert into public.audit_log (actor_id, action, target_table, target_id) values (auth.uid(), 'survey_' || p_status, 'surveys', p_id);
end;
$$;

create or replace function public.open_surveys()
returns table (id uuid, title text, intro text, opened_at timestamptz, questions int, answered boolean)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.title, s.intro, s.opened_at, (select count(*)::int from public.survey_questions q where q.survey_id = s.id),
         exists (select 1 from public.survey_responses r where r.survey_id = s.id and r.user_id = auth.uid())
    from public.surveys s
   where s.township_id = public.my_township() and s.status = 'open' and public.is_active_member()
   order by s.opened_at desc
$$;

-- p_answers = [{question_id, rating?, choice?, text?}]
create or replace function public.submit_survey(p_id uuid, p_answers jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_resp uuid; q public.survey_questions%rowtype; a jsonb;
begin
  if not public.is_active_member() or public.auth_role() not in ('owner', 'sub_owner') then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.surveys where id = p_id and township_id = public.my_township() and status = 'open') then raise exception 'survey_closed'; end if;
  if exists (select 1 from public.survey_responses where survey_id = p_id and user_id = auth.uid()) then raise exception 'already_answered'; end if;
  insert into public.survey_responses (survey_id, user_id) values (p_id, auth.uid()) returning id into v_resp;
  for q in select * from public.survey_questions where survey_id = p_id order by position loop
    a := null;
    select x.value into a from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) x where x.value->>'question_id' = q.id::text limit 1;
    if q.kind = 'rating' and (a->>'rating') is not null then
      if (a->>'rating')::int not between 1 and 5 then raise exception 'bad_input'; end if;
      insert into public.survey_answers (response_id, question_id, rating) values (v_resp, q.id, (a->>'rating')::int);
    elsif q.kind = 'choice' and nullif(a->>'choice', '') is not null then
      if not (a->>'choice' = any(q.options)) then raise exception 'bad_input'; end if;
      insert into public.survey_answers (response_id, question_id, choice) values (v_resp, q.id, a->>'choice');
    elsif q.kind = 'text' and nullif(trim(coalesce(a->>'text', '')), '') is not null then
      insert into public.survey_answers (response_id, question_id, text_answer) values (v_resp, q.id, left(trim(a->>'text'), 1000));
    elsif q.required then
      raise exception 'answer_required';
    end if;
  end loop;
end;
$$;

-- Totals per question; comments without names
create or replace function public.survey_results(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_management() or not exists (select 1 from public.surveys where id = p_id and township_id = public.my_township()) then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'responses', (select count(*) from public.survey_responses where survey_id = p_id),
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'position', q.position, 'kind', q.kind, 'prompt', q.prompt, 'options', to_jsonb(q.options), 'required', q.required,
        'answered', (select count(*) from public.survey_answers a where a.question_id = q.id),
        'avg', (select round(avg(a.rating), 2) from public.survey_answers a where a.question_id = q.id),
        'counts', case q.kind when 'rating' then (select jsonb_object_agg(v::text, (select count(*) from public.survey_answers a where a.question_id = q.id and a.rating = v)) from generate_series(1, 5) v)
                              when 'choice' then (select jsonb_object_agg(o, (select count(*) from public.survey_answers a where a.question_id = q.id and a.choice = o)) from unnest(q.options) o)
                              else null end,
        'texts', case when q.kind = 'text' then (select coalesce(jsonb_agg(a.text_answer order by r.created_at desc), '[]'::jsonb)
                    from public.survey_answers a join public.survey_responses r on r.id = a.response_id where a.question_id = q.id) else null end
      ) order by q.position) from public.survey_questions q where q.survey_id = p_id), '[]'::jsonb));
end;
$$;

revoke execute on function public.save_faq(uuid, text, text, text, text[], text, text, int, boolean), public.admin_surveys(),
  public.save_survey(uuid, text, text, jsonb), public.set_survey_status(uuid, text), public.open_surveys(),
  public.submit_survey(uuid, jsonb), public.survey_results(uuid) from public, anon;
grant execute on function public.save_faq(uuid, text, text, text, text[], text, text, int, boolean), public.admin_surveys(),
  public.save_survey(uuid, text, text, jsonb), public.set_survey_status(uuid, text), public.open_surveys(),
  public.submit_survey(uuid, jsonb), public.survey_results(uuid) to authenticated;
