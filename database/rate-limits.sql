-- Run once in the existing Supabase project's SQL editor before deployment.
-- No raw IP addresses or conversation content are stored by this feature.
create table if not exists public.kaufgeist_rate_limits (
  key text primary key,
  count integer not null default 0,
  expires_at timestamptz not null
);
alter table public.kaufgeist_rate_limits enable row level security;
revoke all on public.kaufgeist_rate_limits from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.kaufgeist_rate_limits to service_role;
create index if not exists kaufgeist_rate_limits_expires_at_idx
  on public.kaufgeist_rate_limits (expires_at);

create or replace function public.reserve_consultation(p_ip_key text, p_ip_limit integer, p_daily_limit integer)
returns boolean language plpgsql security invoker set search_path = '' set lock_timeout = '2s' as $$
declare
  v_now timestamptz := now();
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  ip_bucket text := 'ip:' || p_ip_key || ':' || floor(extract(epoch from now()) / 300)::text;
  global_bucket text := 'day:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
begin
  if p_ip_key is null or p_ip_key !~ '^[a-f0-9]{64}$'
    or p_ip_limit is null or p_ip_limit not between 1 and 50
    or p_daily_limit is null or p_daily_limit not between 1 and 10000 then
    raise exception 'Invalid limit configuration';
  end if;
  perform pg_advisory_xact_lock(48273190);
  delete from public.kaufgeist_rate_limits where expires_at <= v_now;
  if coalesce((select count from public.kaufgeist_rate_limits where key = ip_bucket), 0) >= p_ip_limit
    or coalesce((select count from public.kaufgeist_rate_limits where key = global_bucket), 0) >= p_daily_limit then
    return false;
  end if;
  insert into public.kaufgeist_rate_limits as limits (key, count, expires_at)
    values (ip_bucket, 1, v_now + interval '5 minutes'),
           (global_bucket, 1, day_start + interval '1 day')
    on conflict (key) do update set count = limits.count + 1;
  return true;
end;
$$;
revoke all on function public.reserve_consultation(text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_consultation(text, integer, integer) to service_role;
