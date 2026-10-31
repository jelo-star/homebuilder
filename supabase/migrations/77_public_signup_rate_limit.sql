create table if not exists public.public_signup_rate_limits (
  identifier_hash text primary key check (identifier_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0),
  updated_at timestamptz not null default now()
);

alter table public.public_signup_rate_limits enable row level security;
revoke all on table public.public_signup_rate_limits from public, anon, authenticated;
create index if not exists public_signup_rate_limits_updated_at_idx
  on public.public_signup_rate_limits(updated_at);

create or replace function public.consume_public_signup_rate_limit(
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_window_started_at timestamptz;
  v_attempt_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_identifier_hash !~ '^[0-9a-f]{64}$'
     or p_limit < 1
     or p_limit > 100
     or p_window_seconds < 60
     or p_window_seconds > 86400 then
    raise exception 'Invalid signup rate-limit parameters';
  end if;

  delete from public.public_signup_rate_limits
   where updated_at < v_now - interval '1 day';

  insert into public.public_signup_rate_limits (
    identifier_hash,
    window_started_at,
    attempt_count,
    updated_at
  )
  values (p_identifier_hash, v_now, 1, v_now)
  on conflict (identifier_hash) do nothing;

  select window_started_at, attempt_count
    into v_window_started_at, v_attempt_count
    from public.public_signup_rate_limits
   where identifier_hash = p_identifier_hash
   for update;

  if v_window_started_at <= v_now - make_interval(secs => p_window_seconds) then
    update public.public_signup_rate_limits
       set window_started_at = v_now,
           attempt_count = 1,
           updated_at = v_now
     where identifier_hash = p_identifier_hash;
    return true;
  end if;

  if v_attempt_count >= p_limit then
    return false;
  end if;

  update public.public_signup_rate_limits
     set attempt_count = attempt_count + 1,
         updated_at = v_now
   where identifier_hash = p_identifier_hash;
  return true;
end;
$$;

revoke all on function public.consume_public_signup_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_signup_rate_limit(text, integer, integer)
  to service_role;

delete from public.public_signup_rate_limits
 where window_started_at < now() - interval '1 day';
