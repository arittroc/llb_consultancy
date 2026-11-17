begin;

create table public.booking_settings (
  id smallint primary key default 1 check (id = 1),
  slot_minutes smallint not null default 30 check (slot_minutes between 15 and 120),
  buffer_minutes smallint not null default 15 check (buffer_minutes between 0 and 60),
  window_days smallint not null default 14 check (window_days between 1 and 60)
);

create table public.availability_rules (
  weekday smallint primary key check (weekday between 1 and 7),
  opens_at time not null,
  closes_at time not null,
  check (opens_at < closes_at),
  check (extract(second from opens_at) = 0 and extract(second from closes_at) = 0)
);

create table public.blackout_dates (
  date date primary key,
  note text check (char_length(note) <= 160)
);

create table public.appointments (
  id uuid primary key,
  name text not null check (char_length(name) between 2 and 100),
  email text not null check (char_length(email) <= 254),
  requested_at_slot timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  buffer_minutes smallint not null check (buffer_minutes between 0 and 60),
  previous_starts_at timestamptz,
  previous_ends_at timestamptz,
  previous_buffer_minutes smallint check (previous_buffer_minutes between 0 and 60),
  status text not null default 'pending' check (
    status in ('pending', 'confirming', 'confirmed', 'declined', 'cancelling', 'cancelled')
  ),
  reserved_times tstzmultirange not null default '{}'::tstzmultirange,
  meet_url text,
  google_event_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at),
  check (num_nonnulls(previous_starts_at, previous_ends_at, previous_buffer_minutes) in (0, 3)),
  check (previous_starts_at < previous_ends_at),
  check ((status in ('confirming', 'confirmed', 'cancelling')) = (not isempty(reserved_times))),
  constraint appointment_time_conflict exclude using gist (reserved_times with &&)
);

create index appointments_status_starts_at_idx on public.appointments (status, starts_at);

create table public.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  kind text not null check (kind in ('receipt', 'confirm', 'reschedule', 'cancel')),
  state text not null default 'queued' check (state in ('queued', 'running', 'done', 'failed', 'abandoned')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (char_length(last_error) <= 100),
  run_after timestamptz not null default now(),
  lock_token uuid,
  locked_at timestamptz,
  first_attempt_at timestamptz,
  calendar_write_started_at timestamptz,
  email_send_started_at timestamptz,
  email_provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'running' and lock_token is not null and locked_at is not null)
    or (state <> 'running' and lock_token is null and locked_at is null))
);

create index integration_jobs_ready_idx on public.integration_jobs (run_after, created_at)
  where state = 'queued';
create index integration_jobs_lease_idx on public.integration_jobs (locked_at)
  where state = 'running';
create index integration_jobs_appointment_idx on public.integration_jobs (appointment_id, created_at);
create unique index integration_jobs_one_active_change_idx on public.integration_jobs (appointment_id)
  where kind <> 'receipt' and state in ('queued', 'running', 'failed');

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete set null,
  event text not null,
  created_at timestamptz not null default now()
);

create index audit_events_appointment_idx on public.audit_events (appointment_id, created_at);

create table public.appointment_rate_limits (
  rate_key text not null check (rate_key ~ '^[0-9a-f]{64}$'),
  bucket_start timestamptz not null,
  hit_count integer not null check (hit_count between 1 and 6),
  primary key (rate_key, bucket_start)
);

create index appointment_rate_limits_expiry_idx on public.appointment_rate_limits (bucket_start);

insert into public.booking_settings default values;
insert into public.availability_rules (weekday, opens_at, closes_at)
select day, time '10:00', time '17:00' from generate_series(1, 5) as day;

-- Compute availability in IST. The exclusion constraint handles concurrent reservations.
create function public.validated_booking_period(p_start timestamptz)
returns table (ends_at timestamptz, buffer_minutes smallint)
language plpgsql
set search_path = ''
as $$
declare
  v_local timestamp := p_start at time zone 'Asia/Kolkata';
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_settings public.booking_settings;
  v_hours public.availability_rules;
  v_period_seconds numeric;
begin
  select * into strict v_settings from public.booking_settings where id = 1;
  if p_start is null or not isfinite(p_start) or p_start <= now()
    or v_local::date >= v_today + v_settings.window_days then
    raise exception 'Requested time is outside the booking window';
  end if;

  select * into v_hours from public.availability_rules
    where weekday = extract(isodow from v_local);
  v_period_seconds := extract(epoch from (v_local::time - v_hours.opens_at));

  if v_hours.weekday is null or v_period_seconds < 0
    or mod(v_period_seconds, (v_settings.slot_minutes + v_settings.buffer_minutes) * 60) <> 0
    or v_local + make_interval(mins => v_settings.slot_minutes) > v_local::date + v_hours.closes_at
    or exists (select 1 from public.blackout_dates where date = v_local::date) then
    raise exception 'Requested time is outside office hours';
  end if;

  return query select p_start + make_interval(mins => v_settings.slot_minutes), v_settings.buffer_minutes;
end;
$$;

create function public.submit_appointment(
  p_key uuid, p_name text, p_email text, p_start timestamptz, p_rate_key text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_existing public.appointments;
  v_name text := trim(p_name);
  v_email text := lower(trim(p_email));
  v_end timestamptz;
  v_buffer smallint;
  v_bucket timestamptz := date_trunc('hour', now(), 'UTC');
begin
  if p_key is null or v_name is null or char_length(v_name) not between 2 and 100
    or v_email is null or char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_rate_key is null or p_rate_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid appointment request';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));
  select * into v_existing from public.appointments where id = p_key;
  if found then
    if v_existing.name <> v_name or v_existing.email <> v_email
      or v_existing.requested_at_slot is distinct from p_start then
      raise exception 'Idempotency key already used';
    end if;
    return p_key;
  end if;

  select period.ends_at, period.buffer_minutes into v_end, v_buffer
    from public.validated_booking_period(p_start) as period;

  if exists (
    select 1 from public.appointments
    where reserved_times && tstzmultirange(tstzrange(p_start, v_end + make_interval(mins => v_buffer), '[)'))
  ) then
    raise exception 'This time is already reserved' using errcode = '23P01';
  end if;

  insert into public.appointment_rate_limits as limits (rate_key, bucket_start, hit_count)
    values (p_rate_key, v_bucket, 1)
    on conflict (rate_key, bucket_start) do update set hit_count = limits.hit_count + 1
    where limits.hit_count < 6;
  if not found then
    raise exception 'Appointment request rate exceeded' using errcode = '53300';
  end if;

  insert into public.appointments (id, name, email, requested_at_slot, starts_at, ends_at, buffer_minutes)
    values (p_key, v_name, v_email, p_start, p_start, v_end, v_buffer);
  insert into public.integration_jobs (appointment_id, kind) values (p_key, 'receipt');
  insert into public.audit_events (appointment_id, event) values (p_key, 'requested');
  return p_key;
end;
$$;

create function public.transition_appointment(p_id uuid, p_action text, p_start timestamptz default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_appointment public.appointments;
  v_start timestamptz;
  v_end timestamptz;
  v_buffer smallint;
  v_reservation tstzmultirange;
  v_kind text;
  v_abandoned_kind text;
begin
  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then
    raise exception 'Appointment does not exist';
  end if;

  if p_action = 'decline' and v_appointment.status = 'pending' then
    update public.appointments set status = 'declined', updated_at = now() where id = p_id;
  elsif p_action = 'cancel' and v_appointment.status = 'confirmed' then
    update public.appointments set status = 'cancelling', updated_at = now() where id = p_id;
    v_kind := 'cancel';
  elsif p_action = 'abort' and v_appointment.status = 'confirming' then
    update public.integration_jobs
      set state = 'abandoned', updated_at = now()
      where appointment_id = p_id and state = 'failed' and kind in ('confirm', 'reschedule')
        and last_error = 'calendar_conflict' and calendar_write_started_at is null
      returning kind into v_abandoned_kind;
    if not found then
      raise exception 'Only an unchanged calendar conflict can be released';
    end if;

    if v_abandoned_kind = 'reschedule' then
      update public.appointments set
        status = 'confirmed', starts_at = previous_starts_at, ends_at = previous_ends_at,
        buffer_minutes = previous_buffer_minutes,
        reserved_times = tstzmultirange(tstzrange(previous_starts_at,
          previous_ends_at + make_interval(mins => previous_buffer_minutes), '[)')),
        previous_starts_at = null, previous_ends_at = null, previous_buffer_minutes = null,
        updated_at = now()
        where id = p_id;
    else
      update public.appointments set
        status = 'pending', reserved_times = '{}'::tstzmultirange, updated_at = now()
        where id = p_id;
    end if;
  elsif p_action = 'retry' then
    update public.integration_jobs
      set state = 'queued', attempts = 0, run_after = now(), updated_at = now()
      where appointment_id = p_id and state = 'failed';
    if not found then
      raise exception 'No failed job can be retried';
    end if;
  elsif (p_action = 'approve' and v_appointment.status = 'pending')
    or (p_action = 'reschedule' and v_appointment.status = 'confirmed') then
    v_start := case when p_action = 'approve' then v_appointment.starts_at else p_start end;
    if p_action = 'reschedule' and v_start = v_appointment.starts_at then
      raise exception 'Choose a different time to reschedule';
    end if;

    select period.ends_at, period.buffer_minutes into v_end, v_buffer
      from public.validated_booking_period(v_start) as period;
    v_reservation := tstzmultirange(tstzrange(v_start, v_end + make_interval(mins => v_buffer), '[)'));

    if p_action = 'reschedule' then
      v_reservation := v_reservation + v_appointment.reserved_times;
    end if;

    update public.appointments set
      status = 'confirming', starts_at = v_start, ends_at = v_end, buffer_minutes = v_buffer,
      previous_starts_at = case when p_action = 'reschedule' then v_appointment.starts_at end,
      previous_ends_at = case when p_action = 'reschedule' then v_appointment.ends_at end,
      previous_buffer_minutes = case when p_action = 'reschedule' then v_appointment.buffer_minutes end,
      reserved_times = v_reservation, updated_at = now()
      where id = p_id;

    v_kind := case when p_action = 'approve' then 'confirm' else 'reschedule' end;
  else
    raise exception 'Action is unavailable for this appointment';
  end if;

  if v_kind is not null then
    insert into public.integration_jobs (appointment_id, kind) values (p_id, v_kind);
  end if;
  insert into public.audit_events (appointment_id, event) values (p_id, p_action);
  return p_id;
end;
$$;

create function public.claim_jobs(p_limit integer)
returns setof public.integration_jobs
language plpgsql
set search_path = ''
as $$
begin
  delete from public.appointment_rate_limits where bucket_start < now() - interval '2 days';

  update public.integration_jobs
    set state = 'failed', last_error = 'lease_expired', lock_token = null, locked_at = null, updated_at = now()
    where state = 'running' and locked_at < now() - interval '5 minutes' and attempts >= 8;

  return query with ready as (
    select id from public.integration_jobs
    where attempts < 8 and ((state = 'queued' and run_after <= now())
      or (state = 'running' and locked_at < now() - interval '5 minutes'))
    order by run_after, created_at
    limit greatest(0, least(coalesce(p_limit, 0), 20))
    for update skip locked
  )
  update public.integration_jobs as job set
    state = 'running', attempts = job.attempts + 1, lock_token = gen_random_uuid(), locked_at = now(),
    first_attempt_at = coalesce(job.first_attempt_at, now()), updated_at = now()
    from ready where job.id = ready.id
    returning job.*;
end;
$$;

-- A failed Google conflict may be safely released only before any attempted calendar mutation.
create function public.mark_job_calendar_write(p_id uuid, p_lock_token uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.integration_jobs set
    calendar_write_started_at = coalesce(calendar_write_started_at, now()), updated_at = now()
    where id = p_id and lock_token = p_lock_token and state = 'running'
      and locked_at >= now() - interval '5 minutes' and kind <> 'receipt';
  return found;
end;
$$;

-- Persist the provider idempotency window before the first attempt to send email.
create function public.mark_job_email_send(p_id uuid, p_lock_token uuid)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_started_at timestamptz;
begin
  update public.integration_jobs set
    email_send_started_at = coalesce(email_send_started_at, now()), updated_at = now()
    where id = p_id and lock_token = p_lock_token and state = 'running'
      and locked_at >= now() - interval '5 minutes'
    returning email_send_started_at into v_started_at;
  return v_started_at;
end;
$$;

create function public.complete_job(
  p_id uuid, p_lock_token uuid, p_event_id text default null, p_meet_url text default null,
  p_email_id text default null
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_job public.integration_jobs;
  v_appointment_id uuid;
begin
  -- Match the appointment-before-job lock order used by transition_appointment.
  select appointment_id into v_appointment_id from public.integration_jobs where id = p_id;
  perform 1 from public.appointments where id = v_appointment_id for update;

  update public.integration_jobs set
    state = 'done', lock_token = null, locked_at = null, last_error = null,
    email_provider_id = p_email_id, updated_at = now()
    where id = p_id and lock_token = p_lock_token and state = 'running'
      and locked_at >= now() - interval '5 minutes'
    returning * into v_job;
  if not found then
    return false;
  end if;

  if v_job.kind in ('confirm', 'reschedule') then
    if nullif(p_event_id, '') is null or p_meet_url is null
      or p_meet_url !~ '^https://meet\.google\.com/[a-z0-9-]+$' then
      raise exception 'Calendar event and Meet link are required';
    end if;

    update public.appointments set
      status = 'confirmed', google_event_id = p_event_id, meet_url = p_meet_url,
      previous_starts_at = null, previous_ends_at = null, previous_buffer_minutes = null,
      reserved_times = tstzmultirange(tstzrange(starts_at, ends_at + make_interval(mins => buffer_minutes), '[)')),
      updated_at = now()
      where id = v_job.appointment_id and status = 'confirming';
    if not found then
      raise exception 'Appointment cannot be confirmed';
    end if;
  elsif v_job.kind = 'cancel' then
    update public.appointments set
      status = 'cancelled', meet_url = null, reserved_times = '{}'::tstzmultirange, updated_at = now()
      where id = v_job.appointment_id and status = 'cancelling';
    if not found then
      raise exception 'Appointment cannot be cancelled';
    end if;
  end if;

  insert into public.audit_events (appointment_id, event)
    values (v_job.appointment_id, v_job.kind || '_completed');
  return true;
end;
$$;

create function public.fail_job(p_id uuid, p_lock_token uuid, p_error text, p_retry boolean)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_job public.integration_jobs;
begin
  update public.integration_jobs set
    state = case when p_retry and attempts < 8 then 'queued' else 'failed' end,
    last_error = case when p_error ~ '^[a-z0-9_]{1,60}$' then p_error else 'integration_error' end,
    run_after = now() + make_interval(secs => least(1800, 30 * power(2, least(attempts - 1, 6)))),
    lock_token = null, locked_at = null, updated_at = now()
    where id = p_id and lock_token = p_lock_token and state = 'running'
      and locked_at >= now() - interval '5 minutes'
    returning * into v_job;
  if not found then
    return false;
  end if;

  if v_job.state = 'failed' then
    insert into public.audit_events (appointment_id, event)
      values (v_job.appointment_id, v_job.kind || '_failed');
  end if;
  return true;
end;
$$;

alter table public.booking_settings enable row level security;
alter table public.availability_rules enable row level security;
alter table public.blackout_dates enable row level security;
alter table public.appointments enable row level security;
alter table public.integration_jobs enable row level security;
alter table public.audit_events enable row level security;
alter table public.appointment_rate_limits enable row level security;

revoke all on public.booking_settings, public.availability_rules, public.blackout_dates, public.appointments,
  public.integration_jobs, public.audit_events, public.appointment_rate_limits from public, anon, authenticated, service_role;
grant select, update on public.booking_settings to service_role;
grant select, insert, update, delete on public.availability_rules, public.blackout_dates to service_role;
grant select, insert on public.appointments to service_role;
grant update (starts_at, ends_at, buffer_minutes, previous_starts_at, previous_ends_at,
  previous_buffer_minutes, status, reserved_times, google_event_id, meet_url, updated_at)
  on public.appointments to service_role;
grant select, insert, update on public.integration_jobs to service_role;
grant select, insert on public.audit_events to service_role;
grant select, insert, update, delete on public.appointment_rate_limits to service_role;

revoke all on function public.validated_booking_period(timestamptz),
  public.submit_appointment(uuid, text, text, timestamptz, text),
  public.transition_appointment(uuid, text, timestamptz), public.claim_jobs(integer),
  public.mark_job_calendar_write(uuid, uuid), public.mark_job_email_send(uuid, uuid),
  public.complete_job(uuid, uuid, text, text, text), public.fail_job(uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.validated_booking_period(timestamptz),
  public.submit_appointment(uuid, text, text, timestamptz, text),
  public.transition_appointment(uuid, text, timestamptz), public.claim_jobs(integer),
  public.mark_job_calendar_write(uuid, uuid), public.mark_job_email_send(uuid, uuid),
  public.complete_job(uuid, uuid, text, text, text), public.fail_job(uuid, uuid, text, boolean)
  to service_role;

commit;
