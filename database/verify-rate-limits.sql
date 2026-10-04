-- Run in the SQL editor/connector. All test writes roll back.
-- Only run before traffic is enabled: this test expects an empty counter table.
begin;
set local role service_role;
do $$
begin
  perform pg_advisory_xact_lock(48273190);
  if exists (select 1 from public.kaufgeist_rate_limits) then
    raise exception 'Verification requires an unused counter table';
  end if;
  if not public.reserve_consultation(repeat('a', 64), 2, 3) then
    raise exception 'First request was rejected';
  end if;
  if not public.reserve_consultation(repeat('a', 64), 2, 3) then
    raise exception 'Second request was rejected';
  end if;
  if public.reserve_consultation(repeat('a', 64), 2, 3) then
    raise exception 'Per-IP limit was not enforced';
  end if;
  if not public.reserve_consultation(repeat('b', 64), 2, 3) then
    raise exception 'Independent IP was rejected';
  end if;
  if public.reserve_consultation(repeat('c', 64), 2, 3) then
    raise exception 'Daily limit was not enforced';
  end if;
  begin
    perform public.reserve_consultation(null, 2, 3);
    raise exception using errcode = 'XX000', message = 'NULL key was accepted';
  exception when raise_exception then null;
  end;
  begin
    perform public.reserve_consultation(repeat('a', 64), null, 3);
    raise exception using errcode = 'XX000', message = 'NULL limit was accepted';
  exception when raise_exception then null;
  end;
  begin
    perform public.reserve_consultation(repeat('z', 64), 2, 3);
    raise exception using errcode = 'XX000', message = 'Non-hex key was accepted';
  exception when raise_exception then null;
  end;
end;
$$;
rollback;
select 'Rate-limit assertions passed; test writes rolled back' as result,
  (select count(*) from public.kaufgeist_rate_limits) as remaining_rows;
