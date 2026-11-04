-- AI core (Claude Sonnet): a per-couple usage ledger that the server checks
-- against a daily cost cap before every model call, plus a "games" switch in
-- the notification settings.
--
-- ai_usage is server-only: RLS is on with no policies and no grants for anon
-- or authenticated, so only the service role (src/lib/claude.ts) can touch it.
-- The caps themselves live in code (AI_DAILY_CAP_USD in src/lib/claude.ts).
--
-- Re-runnable: every statement is "if not exists" / "or replace".

create table if not exists public.ai_usage (
  id                 uuid primary key default gen_random_uuid(),
  -- Null for calls not made for a couple (admin and system jobs): no cap.
  couple_id          uuid references public.couples(id) on delete cascade,
  feature            text not null check (feature in (
                       'daily_question', 'date_ideas', 'pet_note', 'pet_weekly',
                       'samakan_set', 'samakan_readout')),
  -- Asia/Jakarta calendar day the call was made on; caps reset at 00:00 WIB.
  day                date not null default ((now() at time zone 'Asia/Jakarta')::date),
  input_tokens       integer not null default 0 check (input_tokens >= 0),
  output_tokens      integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens  integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  -- While a call is in flight this holds its worst-case cost (the reservation);
  -- afterwards the real cost computed from the API's usage numbers.
  cost_usd           numeric(10,6) not null default 0 check (cost_usd >= 0),
  outcome            text not null default 'pending' check (outcome in (
                       'pending', 'ok', 'refusal', 'invalid', 'timeout', 'error')),
  created_at         timestamptz not null default now()
);

create index if not exists ai_usage_couple_feature_day_idx
  on public.ai_usage (couple_id, feature, day);

alter table public.ai_usage enable row level security;
-- No policies on purpose. Supabase grants new tables to anon/authenticated by
-- default; take that back so clients can neither read nor write a row.
revoke all on public.ai_usage from public, anon, authenticated;
grant all on public.ai_usage to service_role;

-- Atomic "check the cap, then reserve". The advisory lock serializes calls
-- for the same couple, feature and day, and calls still in flight count at
-- their reserved (worst-case) cost, so parallel requests cannot slip past the
-- cap together. Returns one of:
--   {"id": "<uuid>"}       reserved; the caller settles the row afterwards
--   {"blocked": "cap"}     finished calls today already reached p_cap
--   {"blocked": "busy"}    under the cap, but calls in flight might use the rest
-- A pending row older than 5 minutes belongs to a request that died (every
-- call times out well before that); its reserved cost counts as spent.
-- p_couple null = not billed to a couple: no cap check, just a ledger row.
drop function if exists public.ai_usage_reserve(uuid, text, numeric, numeric);
create function public.ai_usage_reserve(
  p_couple   uuid,
  p_feature  text,
  p_cap      numeric,
  p_estimate numeric
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_day     date := (now() at time zone 'Asia/Jakarta')::date;
  v_spent   numeric;
  v_pending numeric;
  v_id      uuid;
begin
  if p_estimate is null or p_estimate < 0 then
    raise exception 'The cost estimate must be zero or more' using errcode = '22023';
  end if;
  if p_couple is not null and p_cap is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('ai_usage:' || p_couple::text || ':' || p_feature || ':' || v_day::text, 0));
    select coalesce(sum(cost_usd) filter (where outcome <> 'pending' or created_at < now() - interval '5 minutes'), 0),
           coalesce(sum(cost_usd) filter (where outcome = 'pending' and created_at >= now() - interval '5 minutes'), 0)
      into v_spent, v_pending
      from public.ai_usage
     where couple_id = p_couple and feature = p_feature and day = v_day;
    if v_spent >= p_cap then
      return jsonb_build_object('blocked', 'cap');
    end if;
    if v_spent + v_pending >= p_cap then
      return jsonb_build_object('blocked', 'busy');
    end if;
  end if;
  insert into public.ai_usage (couple_id, feature, day, cost_usd, outcome)
  values (p_couple, p_feature, v_day, round(p_estimate, 6), 'pending')
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.ai_usage_reserve(uuid, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.ai_usage_reserve(uuid, text, numeric, numeric) to service_role;

-- Notification switch for game invites and results (push kind 'games').
alter table public.notification_prefs
  add column if not exists games boolean not null default true;
