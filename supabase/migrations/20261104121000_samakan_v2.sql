-- Samakan v2 (2026-11-04): "answer now, reveal together".
-- Spec: docs/superpowers/specs/2026-11-04-samakan-remake.md §5.3-5.5, plus two
-- decisions from Eric on top of it: a "Play now together" live invite, and
-- personal rounds that may read the couple's Daily Question answers (default
-- on, one switch per couple).
--
-- A set is 7 rounds in a fixed kind order (match, guess, scale, guess, match,
-- scale, guess). The server writes the rounds once (samakan_insert_set,
-- service role) before any push goes out, so both phones read the same rows.
-- Each partner answers on their own time; a round reveals the moment the second
-- answer lands. Answers sit in samakan_answers, which has no client grants and
-- no policies: only the security definer RPCs below read it, and they return a
-- partner's answer only for rounds the caller has answered too. samakan_sets is
-- in the realtime publication and carries counts only, never answer values.
--
-- The v1 live lobby is retired: open game_sessions rows expire, completed ones
-- stay readable as "Older games", and clients can no longer write the table.
--
-- Re-runnable: every object uses if not exists / or replace / drop if exists,
-- and the data update is idempotent.
--
-- Errors carry a stable code in HINT (SK_*) for the client to map:
--   SK_AUTH, SK_NO_PARTNER, SK_CLOSED, SK_NOT_FOUND, SK_ENDED, SK_INVALID,
--   SK_LOCKED, SK_SKIPPED, SK_ANSWERED, SK_SKIP_LIMIT, SK_LIMIT, SK_EXPIRED,
--   SK_DAILY_LIMIT, SK_PERSONAL_OFF
--
-- Client RPCs (authenticated):
--   samakan_hub() -> json
--   samakan_set_state(p_set_id uuid) -> json
--   samakan_answer(p_round_id uuid, p_pick int, p_guess int default null) -> json
--   samakan_skip(p_round_id uuid) -> json
--   samakan_end(p_set_id uuid) -> json
--   samakan_set_personal(p_on boolean) -> boolean
--   samakan_live_invite(p_set_id uuid) -> json
--   samakan_live_accept(p_invite_id uuid) -> json
-- Server RPCs (service role only):
--   samakan_insert_set(p_couple uuid, p_creator uuid, p_source text, p_theme text, p_reason text, p_rounds jsonb) -> json
--   samakan_history(p_couple uuid) -> json
--   samakan_claim_push(p_set_id uuid, p_recipient uuid, p_kind text) -> json
--   samakan_claim_readout(p_set_id uuid) -> boolean
--   samakan_save_readout(p_set_id uuid, p_readout jsonb) -> boolean

-- ============================================================
-- Couple switch: personal ("For you two") rounds. When off, the server makes
-- no AI call and reads no Daily Question, Moment, mood or Bucket List rows.
-- ============================================================

alter table public.couples add column if not exists samakan_personal boolean not null default true;

-- ============================================================
-- Tables
-- ============================================================

create table if not exists public.samakan_sets (
  id               uuid primary key default gen_random_uuid(),
  couple_id        uuid not null references public.couples(id) on delete cascade,
  -- Shared history survives an account deletion (same rule as game_sessions).
  created_by       uuid references public.profiles(id) on delete set null,
  source           text not null,
  theme            text not null,
  fallback_reason  text,
  status           text not null default 'open',
  -- {profile_id: rounds that profile has answered}
  progress         jsonb not null default '{}'::jsonb,
  -- Running totals over rounds both partners answered (never one-sided).
  revealed         smallint not null default 0,
  matches          smallint not null default 0,
  max_matches      smallint not null default 0,
  learned          smallint not null default 0,
  skips            smallint not null default 0,
  readout          jsonb,
  readout_status   text not null default 'none',
  readout_claimed_at timestamptz,
  version          integer not null default 0,
  created_at       timestamptz not null default now(),
  finished_at      timestamptz,
  finished_by      uuid references public.profiles(id) on delete set null,
  ended_at         timestamptz,
  ended_by         uuid references public.profiles(id) on delete set null,
  constraint samakan_sets_source check (source in ('ai', 'bank')),
  constraint samakan_sets_theme check (theme in ('personal', 'food', 'weekends', 'home', 'travel', 'habits', 'plans', 'mixed')),
  constraint samakan_sets_source_theme check ((source = 'ai') = (theme = 'personal')),
  constraint samakan_sets_reason check (
    fallback_reason is null
    or (source = 'bank' and fallback_reason in ('daily_limit', 'personal_off', 'no_data', 'cap', 'timeout', 'error', 'refusal', 'max_tokens', 'invalid'))
  ),
  constraint samakan_sets_status check (status in ('open', 'done', 'ended', 'expired')),
  constraint samakan_sets_readout_status check (readout_status in ('none', 'pending', 'done')),
  constraint samakan_sets_counts check (
    revealed between 0 and 7 and skips between 0 and 2 and max_matches between 0 and 12
    and matches between 0 and max_matches and learned between 0 and 10
  ),
  constraint samakan_sets_done_shape check ((status = 'done') = (finished_at is not null)),
  constraint samakan_sets_ended_shape check ((status in ('ended', 'expired')) = (ended_at is not null)),
  constraint samakan_sets_readout_shape check (readout is null or readout_status = 'done')
);

-- One open set per couple (either partner's).
create unique index if not exists samakan_sets_one_open
  on public.samakan_sets (couple_id) where status = 'open';
create index if not exists samakan_sets_couple_created_idx
  on public.samakan_sets (couple_id, created_at desc);

create table if not exists public.samakan_rounds (
  id          uuid primary key default gen_random_uuid(),
  set_id      uuid not null references public.samakan_sets(id) on delete cascade,
  couple_id   uuid not null references public.couples(id) on delete cascade,
  position    smallint not null,
  kind        text not null,
  prompt      text not null,
  -- Stored in display order (guess options are shuffled once, at creation).
  options     text[] not null default '{}',
  low_label   text,
  high_label  text,
  talk        text not null default '',
  source      text not null default 'general',
  bank_id     text,
  skipped_by  uuid references public.profiles(id) on delete set null,
  skipped_at  timestamptz,
  -- Set once, when the second answer lands.
  revealed_at timestamptz,
  score       smallint,
  learned     smallint,
  created_at  timestamptz not null default now(),
  constraint samakan_rounds_position unique (set_id, position),
  constraint samakan_rounds_position_range check (position between 0 and 6),
  constraint samakan_rounds_kind_order check (kind = (array['match', 'guess', 'scale', 'guess', 'match', 'scale', 'guess'])[position + 1]),
  constraint samakan_rounds_shape check (
    case kind
      when 'match' then cardinality(options) = 2 and low_label is null and high_label is null
      when 'guess' then cardinality(options) = 4 and low_label is null and high_label is null
      when 'scale' then cardinality(options) = 0
        and low_label is not null and high_label is not null
        and char_length(low_label) between 1 and 32 and char_length(high_label) between 1 and 32
      else false
    end
  ),
  constraint samakan_rounds_text check (char_length(prompt) between 8 and 140 and char_length(talk) <= 120),
  constraint samakan_rounds_source check (source in ('daily', 'moments', 'mood', 'bucket', 'general')),
  constraint samakan_rounds_reveal_shape check ((revealed_at is null) = (score is null) and (score is null) = (learned is null)),
  constraint samakan_rounds_skip_shape check (skipped_at is not null or skipped_by is null),
  constraint samakan_rounds_skip_or_reveal check (skipped_at is null or revealed_at is null)
);
create index if not exists samakan_rounds_bank_idx on public.samakan_rounds (couple_id, bank_id) where bank_id is not null;

create table if not exists public.samakan_answers (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid not null references public.samakan_rounds(id) on delete cascade,
  set_id      uuid not null references public.samakan_sets(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete set null,
  pick        smallint not null,
  guess       smallint,
  answered_at timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint samakan_answers_one_each unique (round_id, profile_id),
  constraint samakan_answers_range check (pick between 0 and 5 and (guess is null or guess between 0 and 5))
);
create index if not exists samakan_answers_set_idx on public.samakan_answers (set_id, profile_id);

-- "Play now together": one partner asks the other to open the same set right
-- now. Lives 10 minutes; at most 3 per sender per Jakarta day; only the two
-- people on it can read it. In the realtime publication so the recipient's
-- open app can show it without waiting for the push.
create table if not exists public.samakan_live_invites (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples(id) on delete cascade,
  set_id       uuid not null references public.samakan_sets(id) on delete cascade,
  created_by   uuid references public.profiles(id) on delete set null,
  recipient_id uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '10 minutes'),
  accepted_at  timestamptz,
  pushed_at    timestamptz,
  jakarta_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  constraint samakan_live_invites_window check (expires_at > created_at)
);
create index if not exists samakan_live_invites_set_idx on public.samakan_live_invites (set_id, created_at desc);
create index if not exists samakan_live_invites_sender_day_idx on public.samakan_live_invites (created_by, jakarta_date);

-- Every Samakan push that was allowed to go out (service role only).
create table if not exists public.samakan_push_log (
  id           uuid primary key default gen_random_uuid(),
  set_id       uuid not null references public.samakan_sets(id) on delete cascade,
  couple_id    uuid not null references public.couples(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind         text not null,
  invite_id    uuid references public.samakan_live_invites(id) on delete set null,
  jakarta_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  created_at   timestamptz not null default now(),
  constraint samakan_push_log_kind check (kind in ('start', 'finish', 'nudge', 'live'))
);
create unique index if not exists samakan_push_log_once_per_set
  on public.samakan_push_log (set_id, kind) where kind in ('start', 'finish', 'nudge');
create index if not exists samakan_push_log_recipient_day_idx
  on public.samakan_push_log (recipient_id, jakarta_date);

-- ============================================================
-- Grants and RLS. Clients read sets, rounds and their own invites; every
-- write goes through the RPCs. Answers and the push log are server-only.
-- ============================================================

alter table public.samakan_sets enable row level security;
alter table public.samakan_rounds enable row level security;
alter table public.samakan_answers enable row level security;
alter table public.samakan_live_invites enable row level security;
alter table public.samakan_push_log enable row level security;

revoke all on public.samakan_sets, public.samakan_rounds, public.samakan_answers,
  public.samakan_live_invites, public.samakan_push_log from public, anon, authenticated;
grant select on public.samakan_sets, public.samakan_rounds, public.samakan_live_invites to authenticated;
grant all on public.samakan_sets, public.samakan_rounds, public.samakan_answers,
  public.samakan_live_invites, public.samakan_push_log to service_role;

drop policy if exists samakan_sets_member_select on public.samakan_sets;
create policy samakan_sets_member_select on public.samakan_sets for select to authenticated
  using (public.is_couple_member(couple_id));

drop policy if exists samakan_rounds_member_select on public.samakan_rounds;
create policy samakan_rounds_member_select on public.samakan_rounds for select to authenticated
  using (public.is_couple_member(couple_id));

drop policy if exists samakan_live_invites_own_select on public.samakan_live_invites;
create policy samakan_live_invites_own_select on public.samakan_live_invites for select to authenticated
  using (public.is_couple_member(couple_id) and auth.uid() in (created_by, recipient_id));

-- No policies on samakan_answers or samakan_push_log on purpose.

-- A deleted set also leaves the activity feed (same rule as R8).
drop trigger if exists samakan_sets_forget_activity on public.samakan_sets;
create trigger samakan_sets_forget_activity after delete on public.samakan_sets
  for each row execute function public.forget_activity();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'samakan_sets') then
      alter publication supabase_realtime add table public.samakan_sets;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'samakan_live_invites') then
      alter publication supabase_realtime add table public.samakan_live_invites;
    end if;
  end if;
end $$;

-- ============================================================
-- Helpers (not callable by clients)
-- ============================================================

create or replace function public.samakan_kind_max(p_kind text)
returns smallint
language sql immutable set search_path = public as $$
  select (case p_kind when 'match' then 1 when 'guess' then 2 when 'scale' then 2 else 0 end)::smallint
$$;

-- Scoring for one round, A and B being the two partners (order doesn't matter).
-- match: +1 when the picks are equal. guess and scale: +1 per exact guess.
-- learned ("new to you"): a wrong option, or a scale guess off by 2 or more.
create or replace function public.samakan_score(
  p_kind text, p_a_pick integer, p_a_guess integer, p_b_pick integer, p_b_guess integer,
  out score integer, out learned integer)
language sql immutable set search_path = public as $$
  select
    case p_kind
      when 'match' then (p_a_pick = p_b_pick)::int
      else (p_a_guess = p_b_pick)::int + (p_b_guess = p_a_pick)::int
    end,
    case p_kind
      when 'match' then 0
      when 'guess' then (p_a_guess <> p_b_pick)::int + (p_b_guess <> p_a_pick)::int
      else (abs(p_a_guess - p_b_pick) >= 2)::int + (abs(p_b_guess - p_a_pick) >= 2)::int
    end
$$;

-- Open sets older than 7 days expire, lazily (no cron).
create or replace function public.samakan_expire_stale(p_couple uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  update public.samakan_sets
  set status = 'expired', ended_at = now(), version = version + 1
  where couple_id = p_couple and status = 'open' and created_at < now() - interval '7 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- The day's personal set is used once the model was called (an AI set, or a
-- bank set that fell back after a failed call). Jakarta day.
create or replace function public.samakan_personal_used_today(p_couple uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.samakan_sets s
    where s.couple_id = p_couple
      and (s.created_at at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date
      and (s.source = 'ai' or s.fallback_reason in ('timeout', 'error', 'refusal', 'max_tokens', 'invalid'))
  )
$$;

-- By id, not by row: a function taking one row of a table would show up in
-- PostgREST as a computed column of that table.
drop function if exists public.samakan_invite_json(public.samakan_live_invites);
create or replace function public.samakan_invite_json(p_invite_id uuid)
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', i.id,
    'set_id', i.set_id,
    'created_by', i.created_by,
    'recipient_id', i.recipient_id,
    'created_at', i.created_at,
    'expires_at', i.expires_at,
    'accepted_at', i.accepted_at
  )
  from public.samakan_live_invites i
  where i.id = p_invite_id
$$;

-- A set as one partner sees it. Counts only, never answer values.
create or replace function public.samakan_set_json(p_set public.samakan_sets, p_uid uuid)
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p_set.id,
    'theme', p_set.theme,
    'source', p_set.source,
    'fallback_reason', p_set.fallback_reason,
    'status', p_set.status,
    'created_by', p_set.created_by,
    'created_at', p_set.created_at,
    'expires_at', p_set.created_at + interval '7 days',
    'nudge_at', p_set.created_at + interval '3 hours',
    'nudged', exists (select 1 from public.samakan_push_log l where l.set_id = p_set.id and l.kind = 'nudge'),
    'finished_at', p_set.finished_at,
    'finished_by', p_set.finished_by,
    'ended_at', p_set.ended_at,
    'ended_by', p_set.ended_by,
    'total', 7 - p_set.skips,
    'skips', p_set.skips,
    'revealed', p_set.revealed,
    'matches', p_set.matches,
    'max_matches', p_set.max_matches,
    'learned', p_set.learned,
    'progress', json_build_object(
      'me', coalesce((p_set.progress ->> p_uid::text)::int, 0),
      'partner', coalesce((select sum(e.value::int) from jsonb_each_text(p_set.progress) e where e.key <> p_uid::text), 0)
    ),
    'readout', p_set.readout,
    'readout_status', p_set.readout_status,
    'version', p_set.version,
    'live_invite', case when p_set.status = 'open' then (
      select public.samakan_invite_json(i.id)
      from public.samakan_live_invites i
      where i.set_id = p_set.id and i.expires_at > now()
      order by i.created_at desc, i.id desc
      limit 1) end
  )
$$;

-- Best, weeks in a row and sets played for one couple.
-- Best: highest matches/max among non-open sets with 5+ revealed rounds, ties
-- to the latest. Streak: consecutive Jakarta weeks (Monday start) with at
-- least one finished set; the current week doesn't break it until it ends.
create or replace function public.samakan_stats(p_couple uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_week date := date_trunc('week', now() at time zone 'Asia/Jakarta')::date;
  v_streak integer := 0;
  v_row record;
  v_best json;
  v_last json;
begin
  if not exists (select 1 from public.samakan_sets
                 where couple_id = p_couple and status = 'done'
                   and date_trunc('week', finished_at at time zone 'Asia/Jakarta')::date = v_week) then
    v_week := v_week - 7;
  end if;
  while exists (select 1 from public.samakan_sets
                where couple_id = p_couple and status = 'done'
                  and date_trunc('week', finished_at at time zone 'Asia/Jakarta')::date = v_week) loop
    v_streak := v_streak + 1;
    v_week := v_week - 7;
  end loop;

  select s.id, s.matches, s.max_matches, coalesce(s.finished_at, s.ended_at) as at into v_row
  from public.samakan_sets s
  where s.couple_id = p_couple and s.status <> 'open' and s.revealed >= 5 and s.max_matches > 0
  order by s.matches::numeric / s.max_matches desc, coalesce(s.finished_at, s.ended_at) desc, s.id desc
  limit 1;
  if found then
    v_best := json_build_object('set_id', v_row.id, 'matches', v_row.matches, 'max_matches', v_row.max_matches, 'at', v_row.at);
  end if;

  select s.id, s.matches, s.max_matches, s.finished_at as at into v_row
  from public.samakan_sets s
  where s.couple_id = p_couple and s.status = 'done'
  order by s.finished_at desc, s.id desc
  limit 1;
  if found then
    v_last := json_build_object('set_id', v_row.id, 'matches', v_row.matches, 'max_matches', v_row.max_matches, 'at', v_row.at);
  end if;

  return json_build_object(
    'best', v_best,
    'streak_weeks', v_streak,
    'sets_played', (select count(*) from public.samakan_sets where couple_id = p_couple and status = 'done'),
    'last', v_last
  );
end;
$$;

-- Flip a set to done once every non-skipped round is revealed. The caller
-- holds the set's row lock.
create or replace function public.samakan_finish_if_complete(p_set_id uuid, p_actor uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_set public.samakan_sets;
begin
  if exists (select 1 from public.samakan_rounds
             where set_id = p_set_id and skipped_at is null and revealed_at is null) then
    return false;
  end if;
  update public.samakan_sets
  set status = 'done', finished_at = now(), finished_by = p_actor
  where id = p_set_id and status = 'open'
  returning * into v_set;
  if v_set.id is null then
    return false;
  end if;
  -- Score only, never answer text.
  insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
  values (v_set.couple_id, p_actor, 'samakan', v_set.id,
          format('finished a Samakan set: %s of %s matches', v_set.matches, v_set.max_matches),
          '/app/games/samakan/set/' || v_set.id);
  return true;
end;
$$;

-- ============================================================
-- Hub: open set, last 20 past sets (ended or expired ones only when at least
-- one round was revealed, since an empty set has no results to open), best,
-- streak, sets played, older games and the personal switch. Expires stale
-- open sets first.
-- ============================================================

create or replace function public.samakan_hub()
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_couple public.couples;
  v_partner uuid;
  v_open public.samakan_sets;
begin
  if v_uid is null then
    raise exception 'Log in to play' using errcode = '28000', hint = 'SK_AUTH';
  end if;

  select c.* into v_couple
  from public.couples c join public.couple_members m on m.couple_id = c.id
  where m.profile_id = v_uid
  order by m.joined_at
  limit 1;
  if v_couple.id is null then
    return json_build_object(
      'couple_id', null, 'me', v_uid, 'partner_id', null, 'has_partner', false, 'closed', false,
      'personal', json_build_object('enabled', false, 'used_today', false),
      'open_set', null, 'sets', '[]'::json,
      'stats', json_build_object('best', null, 'streak_weeks', 0, 'sets_played', 0, 'last', null),
      'legacy_count', 0);
  end if;

  select m.profile_id into v_partner
  from public.couple_members m
  where m.couple_id = v_couple.id and m.profile_id <> v_uid
  limit 1;

  perform public.samakan_expire_stale(v_couple.id);
  select * into v_open from public.samakan_sets where couple_id = v_couple.id and status = 'open';

  return json_build_object(
    'couple_id', v_couple.id,
    'me', v_uid,
    'partner_id', v_partner,
    'has_partner', v_partner is not null,
    'closed', v_couple.closed_at is not null,
    'personal', json_build_object(
      'enabled', v_couple.samakan_personal,
      'used_today', public.samakan_personal_used_today(v_couple.id)),
    'open_set', case when v_open.id is null then null else public.samakan_set_json(v_open, v_uid) end,
    'sets', coalesce((
      select json_agg(public.samakan_set_json(s, v_uid) order by coalesce(s.finished_at, s.ended_at) desc, s.id desc)
      from public.samakan_sets s
      where s.id in (select x.id from public.samakan_sets x
                     where x.couple_id = v_couple.id and x.status <> 'open' and (x.status = 'done' or x.revealed > 0)
                     order by coalesce(x.finished_at, x.ended_at) desc, x.id desc
                     limit 20)), '[]'::json),
    'stats', public.samakan_stats(v_couple.id),
    'legacy_count', (select count(*) from public.game_sessions g
                     where g.couple_id = v_couple.id and g.status = 'completed')
  );
end;
$$;

-- ============================================================
-- One set for one partner: rounds in order, my answers, and the partner's
-- answer only for rounds I have answered too. On an ended or expired set,
-- one-sided answers (mine included) are never returned.
-- ============================================================

create or replace function public.samakan_set_state(p_set_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_set public.samakan_sets;
  v_best uuid;
begin
  if v_uid is null then
    raise exception 'Log in to play' using errcode = '28000', hint = 'SK_AUTH';
  end if;
  select * into v_set from public.samakan_sets where id = p_set_id;
  if v_set.id is null or not public.is_couple_member(v_set.couple_id) then
    raise exception 'This set isn''t here anymore' using errcode = 'P0002', hint = 'SK_NOT_FOUND';
  end if;
  if v_set.status = 'open' and v_set.created_at < now() - interval '7 days' then
    perform public.samakan_expire_stale(v_set.couple_id);
    select * into v_set from public.samakan_sets where id = p_set_id;
  end if;
  v_best := (public.samakan_stats(v_set.couple_id) -> 'best' ->> 'set_id')::uuid;

  return json_build_object(
    'set', public.samakan_set_json(v_set, v_uid),
    'is_best', coalesce(v_best = v_set.id, false),
    'rounds', coalesce((
      select json_agg(json_build_object(
        'id', r.id,
        'position', r.position,
        'kind', r.kind,
        'prompt', r.prompt,
        'options', to_json(r.options),
        'low', r.low_label,
        'high', r.high_label,
        'talk', r.talk,
        'source', r.source,
        'skipped', r.skipped_at is not null,
        'skipped_by', r.skipped_by,
        'partner_answered', t.id is not null,
        'revealed', r.revealed_at is not null,
        'revealed_at', r.revealed_at,
        'score', r.score,
        'learned', r.learned,
        'mine', case when m.id is not null and (v_set.status = 'open' or t.id is not null)
                     then json_build_object('pick', m.pick, 'guess', m.guess,
                                            'answered_at', m.answered_at, 'updated_at', m.updated_at) end,
        'partner', case when m.id is not null and t.id is not null
                        then json_build_object('pick', t.pick, 'guess', t.guess) end
      ) order by r.position)
      from public.samakan_rounds r
      left join public.samakan_answers m on m.round_id = r.id and m.profile_id = v_uid
      left join lateral (
        select a.id, a.pick, a.guess from public.samakan_answers a
        where a.round_id = r.id and a.profile_id is distinct from v_uid
        order by a.answered_at
        limit 1) t on true
      where r.set_id = v_set.id), '[]'::json)
  );
end;
$$;

-- ============================================================
-- Answer a round: my pick, plus a guess of the partner's pick (guess and
-- scale). Changeable until the partner answers that round, then locked.
-- The set row lock makes every write to one set run one after the other, so
-- two answers landing at the same moment score once.
-- ============================================================

create or replace function public.samakan_answer(p_round_id uuid, p_pick int, p_guess int default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_round public.samakan_rounds;
  v_set public.samakan_sets;
  v_mine public.samakan_answers;
  v_theirs public.samakan_answers;
  v_score integer;
  v_learned integer;
  v_done boolean;
begin
  if v_uid is null then
    raise exception 'Log in to play' using errcode = '28000', hint = 'SK_AUTH';
  end if;
  select * into v_round from public.samakan_rounds where id = p_round_id;
  if v_round.id is null or not public.is_couple_member(v_round.couple_id) then
    raise exception 'This round isn''t here anymore' using errcode = 'P0002', hint = 'SK_NOT_FOUND';
  end if;

  select * into v_set from public.samakan_sets where id = v_round.set_id for update;
  if exists (select 1 from public.couples where id = v_set.couple_id and closed_at is not null) then
    raise exception 'This couple space is closed, so Samakan is off' using errcode = 'P0001', hint = 'SK_CLOSED';
  end if;
  if v_set.status <> 'open' or v_set.created_at < now() - interval '7 days' then
    raise exception 'This set has ended' using errcode = 'P0001', hint = 'SK_ENDED';
  end if;
  -- Re-read under the lock: a skip may have landed while we waited.
  select * into v_round from public.samakan_rounds where id = p_round_id;
  if v_round.skipped_at is not null then
    raise exception 'This round was skipped' using errcode = 'P0001', hint = 'SK_SKIPPED';
  end if;

  if v_round.kind = 'match' then
    if p_pick is null or p_pick not between 0 and 1 or p_guess is not null then
      raise exception 'Pick one of the two options' using errcode = '22023', hint = 'SK_INVALID';
    end if;
  elsif v_round.kind = 'guess' then
    if p_pick is null or p_pick not between 0 and 3 or p_guess is null or p_guess not between 0 and 3 then
      raise exception 'Pick your answer and your guess' using errcode = '22023', hint = 'SK_INVALID';
    end if;
  else
    if p_pick is null or p_pick not between 1 and 5 or p_guess is null or p_guess not between 1 and 5 then
      raise exception 'Pick a number from 1 to 5 for you and for your guess' using errcode = '22023', hint = 'SK_INVALID';
    end if;
  end if;

  select * into v_mine from public.samakan_answers where round_id = v_round.id and profile_id = v_uid;
  select * into v_theirs from public.samakan_answers
  where round_id = v_round.id and profile_id is distinct from v_uid
  order by answered_at
  limit 1;

  if v_mine.id is not null then
    if v_theirs.id is not null then
      raise exception 'Your partner already answered this one, so it''s locked' using errcode = 'P0001', hint = 'SK_LOCKED';
    end if;
    update public.samakan_answers set pick = p_pick, guess = p_guess, updated_at = now() where id = v_mine.id;
    update public.samakan_sets set version = version + 1 where id = v_set.id returning * into v_set;
    return json_build_object(
      'revealed', false, 'changed', true, 'done', false, 'version', v_set.version,
      'score', null, 'learned', null,
      'mine', json_build_object('pick', p_pick, 'guess', p_guess), 'partner', null,
      'matches', v_set.matches, 'max_matches', v_set.max_matches);
  end if;

  insert into public.samakan_answers (round_id, set_id, profile_id, pick, guess)
  values (v_round.id, v_set.id, v_uid, p_pick, p_guess);

  if v_theirs.id is null then
    update public.samakan_sets
    set progress = jsonb_set(progress, array[v_uid::text], to_jsonb(coalesce((progress ->> v_uid::text)::int, 0) + 1), true),
        version = version + 1
    where id = v_set.id
    returning * into v_set;
    return json_build_object(
      'revealed', false, 'changed', false, 'done', false, 'version', v_set.version,
      'score', null, 'learned', null,
      'mine', json_build_object('pick', p_pick, 'guess', p_guess), 'partner', null,
      'matches', v_set.matches, 'max_matches', v_set.max_matches);
  end if;

  -- Second answer: the round reveals now, scored exactly once.
  select s.score, s.learned into v_score, v_learned
  from public.samakan_score(v_round.kind, p_pick, p_guess, v_theirs.pick, v_theirs.guess) s;
  update public.samakan_rounds
  set revealed_at = now(), score = v_score, learned = v_learned
  where id = v_round.id;
  update public.samakan_sets
  set progress = jsonb_set(progress, array[v_uid::text], to_jsonb(coalesce((progress ->> v_uid::text)::int, 0) + 1), true),
      revealed = revealed + 1,
      matches = matches + v_score,
      max_matches = max_matches + public.samakan_kind_max(v_round.kind),
      learned = learned + v_learned,
      version = version + 1
  where id = v_set.id;
  v_done := public.samakan_finish_if_complete(v_set.id, v_uid);
  select * into v_set from public.samakan_sets where id = v_set.id;

  return json_build_object(
    'revealed', true, 'changed', false, 'done', v_done, 'version', v_set.version,
    'score', v_score, 'learned', v_learned,
    'mine', json_build_object('pick', p_pick, 'guess', p_guess),
    'partner', json_build_object('pick', v_theirs.pick, 'guess', v_theirs.guess),
    'matches', v_set.matches, 'max_matches', v_set.max_matches);
end;
$$;

-- ============================================================
-- Skip a round: only before either partner answers it, at most 2 per set.
-- ============================================================

create or replace function public.samakan_skip(p_round_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_round public.samakan_rounds;
  v_set public.samakan_sets;
  v_done boolean;
begin
  if v_uid is null then
    raise exception 'Log in to play' using errcode = '28000', hint = 'SK_AUTH';
  end if;
  select * into v_round from public.samakan_rounds where id = p_round_id;
  if v_round.id is null or not public.is_couple_member(v_round.couple_id) then
    raise exception 'This round isn''t here anymore' using errcode = 'P0002', hint = 'SK_NOT_FOUND';
  end if;

  select * into v_set from public.samakan_sets where id = v_round.set_id for update;
  if exists (select 1 from public.couples where id = v_set.couple_id and closed_at is not null) then
    raise exception 'This couple space is closed, so Samakan is off' using errcode = 'P0001', hint = 'SK_CLOSED';
  end if;
  if v_set.status <> 'open' or v_set.created_at < now() - interval '7 days' then
    raise exception 'This set has ended' using errcode = 'P0001', hint = 'SK_ENDED';
  end if;
  select * into v_round from public.samakan_rounds where id = p_round_id;
  if v_round.skipped_at is not null then
    raise exception 'This round was skipped' using errcode = 'P0001', hint = 'SK_SKIPPED';
  end if;
  if exists (select 1 from public.samakan_answers where round_id = v_round.id) then
    raise exception 'Someone already answered this one, so it can''t be skipped' using errcode = 'P0001', hint = 'SK_ANSWERED';
  end if;
  if v_set.skips >= 2 then
    raise exception 'You can skip 2 rounds per set' using errcode = 'P0001', hint = 'SK_SKIP_LIMIT';
  end if;

  update public.samakan_rounds set skipped_by = v_uid, skipped_at = now() where id = v_round.id;
  update public.samakan_sets set skips = skips + 1, version = version + 1 where id = v_set.id;
  v_done := public.samakan_finish_if_complete(v_set.id, v_uid);
  select * into v_set from public.samakan_sets where id = v_set.id;
  return json_build_object('skipped', true, 'done', v_done, 'version', v_set.version);
end;
$$;

-- ============================================================
-- End an open set for both partners. Revealed rounds stay in the history.
-- Allowed in a closed couple too, so nothing stays stuck.
-- ============================================================

create or replace function public.samakan_end(p_set_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_set public.samakan_sets;
begin
  if v_uid is null then
    raise exception 'Log in to play' using errcode = '28000', hint = 'SK_AUTH';
  end if;
  select * into v_set from public.samakan_sets where id = p_set_id;
  if v_set.id is null or not public.is_couple_member(v_set.couple_id) then
    raise exception 'This set isn''t here anymore' using errcode = 'P0002', hint = 'SK_NOT_FOUND';
  end if;
  select * into v_set from public.samakan_sets where id = p_set_id for update;
  if v_set.status <> 'open' then
    raise exception 'This set has ended' using errcode = 'P0001', hint = 'SK_ENDED';
  end if;
  update public.samakan_sets
  set status = 'ended', ended_at = now(), ended_by = v_uid, version = version + 1
  where id = v_set.id
  returning * into v_set;
  insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
  values (v_set.couple_id, v_uid, 'samakan', v_set.id, 'ended a Samakan set', '/app/games/samakan/set/' || v_set.id);
  return json_build_object('status', v_set.status, 'version', v_set.version);
end;
$$;

-- ============================================================
-- The couple's personal-rounds switch. Either partner can flip it; the other
-- sees it in the activity feed.
-- ============================================================

create or replace function public.samakan_set_personal(p_on boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_couple public.couples;
begin
  if v_uid is null then
    raise exception 'Log in to play' using errcode = '28000', hint = 'SK_AUTH';
  end if;
  if p_on is null then
    raise exception 'Choose on or off' using errcode = '22023', hint = 'SK_INVALID';
  end if;
  select c.* into v_couple
  from public.couples c join public.couple_members m on m.couple_id = c.id
  where m.profile_id = v_uid
  order by m.joined_at
  limit 1
  for no key update of c;
  if v_couple.id is null then
    raise exception 'Samakan needs two. Invite your partner first.' using errcode = 'P0001', hint = 'SK_NO_PARTNER';
  end if;
  if v_couple.samakan_personal = p_on then
    return p_on;
  end if;
  update public.couples set samakan_personal = p_on where id = v_couple.id;
  insert into public.activities (couple_id, actor_id, kind, summary, url)
  values (v_couple.id, v_uid, 'samakan',
          case when p_on then 'turned on personal rounds in Samakan' else 'turned off personal rounds in Samakan' end,
          '/app/games/samakan');
  return p_on;
end;
$$;

-- ============================================================
-- "Play now together": ask the partner to open this set right now.
-- Same sender + set while one is still live: that one comes back (created =
-- false, no second push). If the partner already asked me, this joins theirs
-- (joined = true). At most 3 new invites per sender per Jakarta day.
-- ============================================================

create or replace function public.samakan_live_invite(p_set_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_set public.samakan_sets;
  v_partner uuid;
  v_invite public.samakan_live_invites;
begin
  if v_uid is null then
    raise exception 'Log in to play' using errcode = '28000', hint = 'SK_AUTH';
  end if;
  select * into v_set from public.samakan_sets where id = p_set_id;
  if v_set.id is null or not public.is_couple_member(v_set.couple_id) then
    raise exception 'This set isn''t here anymore' using errcode = 'P0002', hint = 'SK_NOT_FOUND';
  end if;
  select * into v_set from public.samakan_sets where id = p_set_id for update;
  if exists (select 1 from public.couples where id = v_set.couple_id and closed_at is not null) then
    raise exception 'This couple space is closed, so Samakan is off' using errcode = 'P0001', hint = 'SK_CLOSED';
  end if;
  select m.profile_id into v_partner
  from public.couple_members m
  where m.couple_id = v_set.couple_id and m.profile_id <> v_uid
  limit 1;
  if v_partner is null then
    raise exception 'Samakan needs two. Invite your partner first.' using errcode = 'P0001', hint = 'SK_NO_PARTNER';
  end if;
  if v_set.status <> 'open' or v_set.created_at < now() - interval '7 days' then
    raise exception 'This set has ended' using errcode = 'P0001', hint = 'SK_ENDED';
  end if;

  -- The partner asked first: join theirs.
  select * into v_invite from public.samakan_live_invites
  where set_id = v_set.id and created_by = v_partner and recipient_id = v_uid
    and expires_at > now() and accepted_at is null
  order by created_at desc
  limit 1;
  if v_invite.id is not null then
    update public.samakan_live_invites set accepted_at = now() where id = v_invite.id returning * into v_invite;
    return json_build_object('invite', public.samakan_invite_json(v_invite.id), 'created', false, 'joined', true);
  end if;

  -- Mine is still live: same one, no new push.
  select * into v_invite from public.samakan_live_invites
  where set_id = v_set.id and created_by = v_uid and expires_at > now()
  order by created_at desc
  limit 1;
  if v_invite.id is not null then
    return json_build_object('invite', public.samakan_invite_json(v_invite.id), 'created', false, 'joined', false);
  end if;

  if (select count(*) from public.samakan_live_invites
      where created_by = v_uid and jakarta_date = (now() at time zone 'Asia/Jakarta')::date) >= 3 then
    raise exception 'You can ask to play live 3 times a day' using errcode = 'P0001', hint = 'SK_LIMIT';
  end if;

  insert into public.samakan_live_invites (couple_id, set_id, created_by, recipient_id)
  values (v_set.couple_id, v_set.id, v_uid, v_partner)
  returning * into v_invite;
  return json_build_object('invite', public.samakan_invite_json(v_invite.id), 'created', true, 'joined', false);
end;
$$;

create or replace function public.samakan_live_accept(p_invite_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.samakan_live_invites;
begin
  if v_uid is null then
    raise exception 'Log in to play' using errcode = '28000', hint = 'SK_AUTH';
  end if;
  select * into v_invite from public.samakan_live_invites where id = p_invite_id for update;
  if v_invite.id is null or v_invite.recipient_id is distinct from v_uid or not public.is_couple_member(v_invite.couple_id) then
    raise exception 'This invite isn''t here anymore' using errcode = 'P0002', hint = 'SK_NOT_FOUND';
  end if;
  if v_invite.accepted_at is null then
    if v_invite.expires_at <= now()
       or not exists (select 1 from public.samakan_sets where id = v_invite.set_id and status = 'open') then
      raise exception 'This invite has run out' using errcode = 'P0001', hint = 'SK_EXPIRED';
    end if;
    update public.samakan_live_invites set accepted_at = now() where id = v_invite.id returning * into v_invite;
  end if;
  return public.samakan_invite_json(v_invite.id);
end;
$$;

-- ============================================================
-- Server: insert a set and its 7 rounds (service role). Returns the open
-- set's id instead when one exists (either partner's), inserting nothing.
-- p_rounds: [{kind, prompt, options, low, high, talk, source, bank_id}] x 7,
-- in kind order, options already in display order.
-- ============================================================

create or replace function public.samakan_insert_set(
  p_couple uuid, p_creator uuid, p_source text, p_theme text, p_reason text, p_rounds jsonb)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_couple public.couples;
  v_open uuid;
  v_id uuid;
  v_r jsonb;
  v_kind text;
  v_prompt text;
  v_opts text[];
  v_low text;
  v_high text;
  v_talk text;
  v_src text;
  v_bank text;
  v_want integer;
  v_clean jsonb := '[]'::jsonb;
  i integer;
begin
  -- Serializes creates for one couple (and waits for a partner leaving).
  select * into v_couple from public.couples where id = p_couple for no key update;
  if v_couple.id is null
     or p_creator is null
     or not exists (select 1 from public.couple_members where couple_id = p_couple and profile_id = p_creator) then
    raise exception 'This couple isn''t here anymore' using errcode = 'P0002', hint = 'SK_NOT_FOUND';
  end if;
  if v_couple.closed_at is not null then
    raise exception 'This couple space is closed, so Samakan is off' using errcode = 'P0001', hint = 'SK_CLOSED';
  end if;
  if (select count(*) from public.couple_members where couple_id = p_couple) < 2 then
    raise exception 'Samakan needs two. Invite your partner first.' using errcode = 'P0001', hint = 'SK_NO_PARTNER';
  end if;

  perform public.samakan_expire_stale(p_couple);
  select id into v_open from public.samakan_sets where couple_id = p_couple and status = 'open';
  if v_open is not null then
    return json_build_object('id', v_open, 'existing', true);
  end if;

  if p_source is null or p_source not in ('ai', 'bank')
     or p_theme is null or p_theme not in ('personal', 'food', 'weekends', 'home', 'travel', 'habits', 'plans', 'mixed')
     or (p_source = 'ai') <> (p_theme = 'personal')
     or (p_reason is not null and (p_source = 'ai' or p_reason not in
         ('daily_limit', 'personal_off', 'no_data', 'cap', 'timeout', 'error', 'refusal', 'max_tokens', 'invalid'))) then
    raise exception 'That set doesn''t fit the rules' using errcode = '22023', hint = 'SK_INVALID';
  end if;
  if p_source = 'ai' and not v_couple.samakan_personal then
    raise exception 'Personal rounds are off for this couple' using errcode = 'P0001', hint = 'SK_PERSONAL_OFF';
  end if;
  if p_source = 'ai' and public.samakan_personal_used_today(p_couple) then
    raise exception 'Today''s personal set is done. Back tomorrow.' using errcode = 'P0001', hint = 'SK_DAILY_LIMIT';
  end if;

  if jsonb_typeof(p_rounds) is distinct from 'array' or jsonb_array_length(p_rounds) <> 7 then
    raise exception 'A set has exactly 7 rounds' using errcode = '22023', hint = 'SK_INVALID';
  end if;
  for i in 0..6 loop
    v_r := p_rounds -> i;
    if jsonb_typeof(v_r) is distinct from 'object' then
      raise exception 'Round % isn''t a round', i + 1 using errcode = '22023', hint = 'SK_INVALID';
    end if;
    v_kind := v_r ->> 'kind';
    if v_kind is distinct from (array['match', 'guess', 'scale', 'guess', 'match', 'scale', 'guess'])[i + 1] then
      raise exception 'Round % is out of order', i + 1 using errcode = '22023', hint = 'SK_INVALID';
    end if;
    v_prompt := btrim(coalesce(v_r ->> 'prompt', ''));
    if char_length(v_prompt) not between 8 and 140 then
      raise exception 'Round % needs a prompt of 8 to 140 characters', i + 1 using errcode = '22023', hint = 'SK_INVALID';
    end if;
    if jsonb_typeof(coalesce(v_r -> 'options', '[]'::jsonb)) <> 'array'
       or exists (select 1 from jsonb_array_elements(coalesce(v_r -> 'options', '[]'::jsonb)) e where jsonb_typeof(e) <> 'string') then
      raise exception 'Round % has options that aren''t text', i + 1 using errcode = '22023', hint = 'SK_INVALID';
    end if;
    select coalesce(array_agg(btrim(e.v) order by e.o), '{}') into v_opts
    from jsonb_array_elements_text(coalesce(v_r -> 'options', '[]'::jsonb)) with ordinality as e(v, o);
    v_want := case v_kind when 'match' then 2 when 'guess' then 4 else 0 end;
    if cardinality(v_opts) <> v_want
       or exists (select 1 from unnest(v_opts) o where char_length(o) not between 1 and 32)
       or (select count(distinct lower(o)) from unnest(v_opts) o) <> cardinality(v_opts) then
      raise exception 'Round % needs % different options of 1 to 32 characters', i + 1, v_want using errcode = '22023', hint = 'SK_INVALID';
    end if;
    if v_kind = 'scale' then
      v_low := btrim(coalesce(v_r ->> 'low', ''));
      v_high := btrim(coalesce(v_r ->> 'high', ''));
      if char_length(v_low) not between 1 and 32 or char_length(v_high) not between 1 and 32 or lower(v_low) = lower(v_high) then
        raise exception 'Round % needs two different scale labels of 1 to 32 characters', i + 1 using errcode = '22023', hint = 'SK_INVALID';
      end if;
    else
      v_low := null;
      v_high := null;
    end if;
    v_talk := btrim(coalesce(v_r ->> 'talk', ''));
    if char_length(v_talk) > 120 then
      raise exception 'Round % has a talk line over 120 characters', i + 1 using errcode = '22023', hint = 'SK_INVALID';
    end if;
    v_src := coalesce(nullif(v_r ->> 'source', ''), 'general');
    if v_src not in ('daily', 'moments', 'mood', 'bucket', 'general') or (p_source = 'bank' and v_src <> 'general') then
      raise exception 'Round % has an unknown source', i + 1 using errcode = '22023', hint = 'SK_INVALID';
    end if;
    v_bank := nullif(btrim(coalesce(v_r ->> 'bank_id', '')), '');
    if char_length(v_bank) > 40 then
      raise exception 'Round % has a bank id over 40 characters', i + 1 using errcode = '22023', hint = 'SK_INVALID';
    end if;
    if position(chr(8212) in concat_ws(' ', v_prompt, array_to_string(v_opts, ' '), v_low, v_high, v_talk)) > 0 then
      raise exception 'Round % has a long dash in its text', i + 1 using errcode = '22023', hint = 'SK_INVALID';
    end if;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'kind', v_kind, 'prompt', v_prompt, 'options', to_jsonb(v_opts), 'low', v_low, 'high', v_high,
      'talk', v_talk, 'source', v_src, 'bank_id', v_bank));
  end loop;

  begin
    insert into public.samakan_sets (couple_id, created_by, source, theme, fallback_reason)
    values (p_couple, p_creator, p_source, p_theme, p_reason)
    returning id into v_id;
  exception when unique_violation then
    select id into v_open from public.samakan_sets where couple_id = p_couple and status = 'open';
    return json_build_object('id', v_open, 'existing', true);
  end;

  insert into public.samakan_rounds (set_id, couple_id, position, kind, prompt, options, low_label, high_label, talk, source, bank_id)
  select v_id, p_couple, (e.o - 1)::smallint, e.r ->> 'kind', e.r ->> 'prompt',
         array(select x.v from jsonb_array_elements_text(e.r -> 'options') with ordinality as x(v, n) order by x.n),
         e.r ->> 'low', e.r ->> 'high', e.r ->> 'talk', e.r ->> 'source', e.r ->> 'bank_id'
  from jsonb_array_elements(v_clean) with ordinality as e(r, o);

  insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
  values (p_couple, p_creator, 'samakan', v_id, 'started a Samakan set', '/app/games/samakan/set/' || v_id);
  return json_build_object('id', v_id, 'existing', false);
end;
$$;

-- ============================================================
-- Server: what the couple has already seen. bank: every bank round with when
-- it was last dealt (the 60-day no-repeat rule, oldest first when the bank
-- runs dry). prompts: the last 40 prompts. skipped: prompts someone skipped.
-- ============================================================

create or replace function public.samakan_history(p_couple uuid)
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'bank', coalesce((
      select json_agg(json_build_object('bank_id', x.bank_id, 'last_used', x.last_used) order by x.last_used desc)
      from (select r.bank_id, max(s.created_at) as last_used
            from public.samakan_rounds r join public.samakan_sets s on s.id = r.set_id
            where r.couple_id = p_couple and r.bank_id is not null
            group by r.bank_id) x), '[]'::json),
    'prompts', coalesce((
      select json_agg(y.prompt order by y.created_at desc, y.position)
      from (select r.prompt, r.position, s.created_at
            from public.samakan_rounds r join public.samakan_sets s on s.id = r.set_id
            where r.couple_id = p_couple
            order by s.created_at desc, r.position
            limit 40) y), '[]'::json),
    'skipped', coalesce((
      select json_agg(r.prompt order by r.skipped_at desc)
      from public.samakan_rounds r
      where r.couple_id = p_couple and r.skipped_at is not null), '[]'::json)
  )
$$;

-- ============================================================
-- Server: may this push go out? Call it right before sending (after the
-- quiet-hours and notification-switch checks), and send only on ok. Logs the
-- push when allowed. At most 3 Samakan pushes per recipient per Jakarta day.
--   start:  to the partner of the set's creator, once per set
--   finish: to the first finisher (not finished_by), once per set, not when
--           they answered in the last 2 minutes (they're watching live)
--   nudge:  once per set, 3 hours after start, only while the recipient has
--           rounds left
--   live:   once per live invite, while it's still live
-- ============================================================

create or replace function public.samakan_claim_push(p_set_id uuid, p_recipient uuid, p_kind text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_set public.samakan_sets;
  v_invite uuid;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if p_kind is null or p_kind not in ('start', 'finish', 'nudge', 'live') or p_recipient is null then
    return json_build_object('ok', false, 'reason', 'invalid');
  end if;
  -- One claim per recipient at a time, so the daily cap can't be raced past.
  perform pg_advisory_xact_lock(hashtextextended('samakan_push:' || p_recipient::text, 0));
  select * into v_set from public.samakan_sets where id = p_set_id for update;
  if v_set.id is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not exists (select 1 from public.couple_members where couple_id = v_set.couple_id and profile_id = p_recipient) then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  if exists (select 1 from public.couples where id = v_set.couple_id and closed_at is not null) then
    return json_build_object('ok', false, 'reason', 'closed');
  end if;

  if p_kind = 'start' then
    if v_set.created_by is not distinct from p_recipient then
      return json_build_object('ok', false, 'reason', 'self');
    end if;
    if v_set.status <> 'open' then
      return json_build_object('ok', false, 'reason', 'not_open');
    end if;
  elsif p_kind = 'finish' then
    if v_set.status <> 'done' then
      return json_build_object('ok', false, 'reason', 'not_done');
    end if;
    if v_set.finished_by is not distinct from p_recipient then
      return json_build_object('ok', false, 'reason', 'self');
    end if;
    if exists (select 1 from public.samakan_answers
               where set_id = v_set.id and profile_id = p_recipient
                 and greatest(answered_at, updated_at) > now() - interval '2 minutes') then
      return json_build_object('ok', false, 'reason', 'live');
    end if;
  elsif p_kind = 'nudge' then
    if v_set.status <> 'open' or v_set.created_at < now() - interval '7 days' then
      return json_build_object('ok', false, 'reason', 'not_open');
    end if;
    if now() < v_set.created_at + interval '3 hours' then
      return json_build_object('ok', false, 'reason', 'too_soon');
    end if;
    if coalesce((v_set.progress ->> p_recipient::text)::int, 0) >= 7 - v_set.skips then
      return json_build_object('ok', false, 'reason', 'finished');
    end if;
  else
    if v_set.status <> 'open' then
      return json_build_object('ok', false, 'reason', 'not_open');
    end if;
    select id into v_invite from public.samakan_live_invites
    where set_id = v_set.id and recipient_id = p_recipient
      and expires_at > now() and accepted_at is null and pushed_at is null
    order by created_at desc
    limit 1;
    if v_invite is null then
      return json_build_object('ok', false, 'reason', 'no_invite');
    end if;
  end if;

  if p_kind <> 'live' and exists (select 1 from public.samakan_push_log where set_id = v_set.id and kind = p_kind) then
    return json_build_object('ok', false, 'reason', 'duplicate');
  end if;
  if (select count(*) from public.samakan_push_log where recipient_id = p_recipient and jakarta_date = v_today) >= 3 then
    return json_build_object('ok', false, 'reason', 'daily_cap');
  end if;

  insert into public.samakan_push_log (set_id, couple_id, recipient_id, kind, invite_id)
  values (v_set.id, v_set.couple_id, p_recipient, p_kind, v_invite);
  if v_invite is not null then
    update public.samakan_live_invites set pushed_at = now() where id = v_invite;
  end if;
  return json_build_object('ok', true, 'reason', null);
end;
$$;

-- ============================================================
-- Server: the read-out (at most one per finished set). Claim before calling
-- the model; a claim older than 2 minutes counts as abandoned.
-- ============================================================

create or replace function public.samakan_claim_readout(p_set_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  update public.samakan_sets
  set readout_status = 'pending', readout_claimed_at = now()
  where id = p_set_id and status = 'done'
    and (readout_status = 'none'
         or (readout_status = 'pending' and readout_claimed_at < now() - interval '2 minutes'))
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- p_readout: {headline <= 80, note <= 220, ask <= 140, by: 'ai' | 'template'};
-- no percent sign and no long dash anywhere. Returns false when the set
-- already has one (or isn't finished).
create or replace function public.samakan_save_readout(p_set_id uuid, p_readout jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_head text := btrim(coalesce(p_readout ->> 'headline', ''));
  v_note text := btrim(coalesce(p_readout ->> 'note', ''));
  v_ask text := btrim(coalesce(p_readout ->> 'ask', ''));
  v_by text := coalesce(p_readout ->> 'by', '');
  v_id uuid;
begin
  if jsonb_typeof(p_readout) is distinct from 'object'
     or char_length(v_head) not between 1 and 80
     or char_length(v_note) not between 1 and 220
     or char_length(v_ask) not between 1 and 140
     or v_by not in ('ai', 'template')
     or position('%' in v_head || v_note || v_ask) > 0
     or position(chr(8212) in v_head || v_note || v_ask) > 0 then
    raise exception 'That read-out doesn''t fit the rules' using errcode = '22023', hint = 'SK_INVALID';
  end if;
  update public.samakan_sets
  set readout = jsonb_build_object('headline', v_head, 'note', v_note, 'ask', v_ask, 'by', v_by),
      readout_status = 'done',
      version = version + 1
  where id = p_set_id and status = 'done' and readout_status <> 'done'
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- ============================================================
-- Execute grants. Postgres grants EXECUTE to PUBLIC by default, so every
-- function is revoked first and granted back only where it belongs.
-- ============================================================

revoke execute on function public.samakan_hub() from public, anon;
revoke execute on function public.samakan_set_state(uuid) from public, anon;
revoke execute on function public.samakan_answer(uuid, int, int) from public, anon;
revoke execute on function public.samakan_skip(uuid) from public, anon;
revoke execute on function public.samakan_end(uuid) from public, anon;
revoke execute on function public.samakan_set_personal(boolean) from public, anon;
revoke execute on function public.samakan_live_invite(uuid) from public, anon;
revoke execute on function public.samakan_live_accept(uuid) from public, anon;
grant execute on function public.samakan_hub() to authenticated, service_role;
grant execute on function public.samakan_set_state(uuid) to authenticated, service_role;
grant execute on function public.samakan_answer(uuid, int, int) to authenticated, service_role;
grant execute on function public.samakan_skip(uuid) to authenticated, service_role;
grant execute on function public.samakan_end(uuid) to authenticated, service_role;
grant execute on function public.samakan_set_personal(boolean) to authenticated, service_role;
grant execute on function public.samakan_live_invite(uuid) to authenticated, service_role;
grant execute on function public.samakan_live_accept(uuid) to authenticated, service_role;

revoke execute on function public.samakan_insert_set(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.samakan_history(uuid) from public, anon, authenticated;
revoke execute on function public.samakan_claim_push(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.samakan_claim_readout(uuid) from public, anon, authenticated;
revoke execute on function public.samakan_save_readout(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.samakan_insert_set(uuid, uuid, text, text, text, jsonb) to service_role;
grant execute on function public.samakan_history(uuid) to service_role;
grant execute on function public.samakan_claim_push(uuid, uuid, text) to service_role;
grant execute on function public.samakan_claim_readout(uuid) to service_role;
grant execute on function public.samakan_save_readout(uuid, jsonb) to service_role;

revoke execute on function public.samakan_kind_max(text) from public, anon, authenticated;
revoke execute on function public.samakan_score(text, integer, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.samakan_expire_stale(uuid) from public, anon, authenticated;
revoke execute on function public.samakan_personal_used_today(uuid) from public, anon, authenticated;
revoke execute on function public.samakan_invite_json(uuid) from public, anon, authenticated;
revoke execute on function public.samakan_set_json(public.samakan_sets, uuid) from public, anon, authenticated;
revoke execute on function public.samakan_stats(uuid) from public, anon, authenticated;
revoke execute on function public.samakan_finish_if_complete(uuid, uuid) from public, anon, authenticated;
grant execute on function public.samakan_kind_max(text) to service_role;
grant execute on function public.samakan_score(text, integer, integer, integer, integer) to service_role;
grant execute on function public.samakan_expire_stale(uuid) to service_role;
grant execute on function public.samakan_personal_used_today(uuid) to service_role;
grant execute on function public.samakan_invite_json(uuid) to service_role;
grant execute on function public.samakan_set_json(public.samakan_sets, uuid) to service_role;
grant execute on function public.samakan_stats(uuid) to service_role;
grant execute on function public.samakan_finish_if_complete(uuid, uuid) to service_role;

-- ============================================================
-- v1 retirement. Nothing is deleted: completed games stay readable by the
-- couple ("Older games"); open lobbies expire; clients can't write anymore.
-- ============================================================

update public.game_sessions set status = 'expired' where status in ('waiting', 'playing');

drop policy if exists game_sessions_member_all on public.game_sessions;
drop policy if exists game_sessions_member_select on public.game_sessions;
create policy game_sessions_member_select on public.game_sessions for select to authenticated
  using (public.is_couple_member(couple_id));
revoke insert, update, delete, truncate, references, trigger on public.game_sessions from public, anon, authenticated;
revoke select on public.game_sessions from anon;
grant select on public.game_sessions to authenticated;
grant all on public.game_sessions to service_role;
