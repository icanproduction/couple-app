-- ============================================================
-- Pet Kita remake: the pet that grows with you
-- Spec: docs/superpowers/specs/2026-11-04-pet-remake.md (5.3, 5.5)
--
-- Nothing decays. A warmth ledger (pet_warmth_events) is fed by triggers on
-- what the couple already does in the app, plus one "say hi" per person per
-- Jakarta day. couple_pets.xp stays the lifetime total and level keeps the
-- old formula, so no existing pet moves.
--
-- Additive and re-runnable:
--   * every object is created with IF NOT EXISTS / OR REPLACE / DROP IF EXISTS
--   * the backfill of existing pets runs once, in the same statement that adds
--     couple_pets.hatched_at, so a second run never pays a pet twice
--   * the old tables (pet_mood_state, pet_care_logs, pet_care_roles) are not
--     touched; they become read-only history
--   * no transaction control here: the migration runner wraps the file
--
-- Rollback: drop the three new tables, the functions and triggers below and
-- couple_pets.hatched_at / notification_prefs.pet, restore perform_pet_care
-- from 20261103120000_english_content.sql and the grants revoked in section 9.
-- Legacy data is untouched either way.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rules: the single source of every number (src/types/pet.ts mirrors it,
--    scripts/verify/pet-rules.mjs fails when the two drift apart)
-- ------------------------------------------------------------
create or replace function public.pet_rules()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'version', 1,
    'xp_per_level', 100,
    'daily_cap', 50,
    'sources', jsonb_build_object(
      'hi',            jsonb_build_object('points', 5,  'cap', 1, 'per', 'person'),
      'hi_both',       jsonb_build_object('points', 5,  'cap', 1, 'per', 'couple'),
      'kangen',        jsonb_build_object('points', 3,  'cap', 1, 'per', 'person'),
      'mood',          jsonb_build_object('points', 3,  'cap', 1, 'per', 'person'),
      'daily',         jsonb_build_object('points', 4,  'cap', 1, 'per', 'person'),
      'moment',        jsonb_build_object('points', 10, 'cap', 2, 'per', 'couple'),
      'moment_social', jsonb_build_object('points', 2,  'cap', 3, 'per', 'couple'),
      'letter',        jsonb_build_object('points', 8,  'cap', 1, 'per', 'person'),
      'jar',           jsonb_build_object('points', 5,  'cap', 1, 'per', 'person'),
      'bucket_done',   jsonb_build_object('points', 10, 'cap', 2, 'per', 'couple'),
      'plan',          jsonb_build_object('points', 2,  'cap', 2, 'per', 'couple'),
      'saving',        jsonb_build_object('points', 4,  'cap', 1, 'per', 'couple'),
      'game',          jsonb_build_object(
                         'points', jsonb_build_object('samakan', 8, 'two_truths', 5, 'deep_talk', 10),
                         'cap', 3, 'cap_points', 20, 'per', 'couple')
    ),
    'state', jsonb_build_object('window_hours', 72, 'glowing_min', 45, 'cozy_min', 8),
    'heavy_moods', jsonb_build_array('capek', 'sedih', 'kesal', 'cemas'),
    'night', jsonb_build_object('from_hour', 22, 'to_hour', 6),
    'stages', jsonb_build_array(
      jsonb_build_object('key', 'little',  'label', 'Little',  'from_level', 1),
      jsonb_build_object('key', 'growing', 'label', 'Growing', 'from_level', 5),
      jsonb_build_object('key', 'grown',   'label', 'Grown',   'from_level', 10),
      jsonb_build_object('key', 'wise',    'label', 'Wise',    'from_level', 15)
    ),
    'items', jsonb_build_array(
      jsonb_build_object('level', 1,  'key', 'bed',           'label', 'Bed and bowl',  'phrase', 'a bed and a bowl'),
      jsonb_build_object('level', 2,  'key', 'collar_tag',    'label', 'Collar tag',    'phrase', 'a collar tag with both your initials'),
      jsonb_build_object('level', 3,  'key', 'jar',           'label', 'Jar',           'phrase', 'a jar with a marble for every Jar note'),
      jsonb_build_object('level', 4,  'key', 'photo_frame',   'label', 'Photo frame',   'phrase', 'a photo frame for your latest Moment'),
      jsonb_build_object('level', 5,  'key', 'scarf',         'label', 'Scarf',         'phrase', 'a scarf'),
      jsonb_build_object('level', 6,  'key', 'letter_rack',   'label', 'Letter rack',   'phrase', 'a letter rack'),
      jsonb_build_object('level', 7,  'key', 'plant',         'label', 'Plant',         'phrase', 'a little plant'),
      jsonb_build_object('level', 8,  'key', 'wall_calendar', 'label', 'Wall calendar', 'phrase', 'a wall calendar'),
      jsonb_build_object('level', 9,  'key', 'window',        'label', 'Window',        'phrase', 'a window with the Jakarta sky'),
      jsonb_build_object('level', 10, 'key', 'hat',           'label', 'Hat',           'phrase', 'a little hat'),
      jsonb_build_object('level', 11, 'key', 'rug',           'label', 'Rug',           'phrase', 'a rug'),
      jsonb_build_object('level', 12, 'key', 'fairy_lights',  'label', 'Fairy lights',  'phrase', 'fairy lights'),
      jsonb_build_object('level', 13, 'key', 'map_board',     'label', 'Map board',     'phrase', 'a map board'),
      jsonb_build_object('level', 14, 'key', 'toy_chest',     'label', 'Toy chest',     'phrase', 'a toy chest'),
      jsonb_build_object('level', 15, 'key', 'glasses',       'label', 'Glasses',       'phrase', 'a pair of glasses')
    ),
    'extras', jsonb_build_object('star_from_level', 16, 'color_every_levels', 5,
                                 'star_label', 'Star', 'star_phrase', 'a star on the wall'),
    'limits', jsonb_build_object('name_max', 20, 'calendar_days_max', 60, 'map_pins_max', 20,
                                 'upcoming_days_max', 14, 'since_visit_max', 3, 'notes_max', 30),
    'types', jsonb_build_array('cat', 'dog'),
    'gestures', jsonb_build_array('pat', 'snack', 'play'),
    'note', jsonb_build_object('opens_hour', 5, 'max_attempts', 2, 'cost_cap_usd', 0.015,
                               'pending_seconds', 20, 'quiet_days', 7,
                               'line_max', 160, 'weekly_line_max', 280)
  )
$$;

-- ------------------------------------------------------------
-- 2. The warmth ledger
-- ------------------------------------------------------------
create table if not exists public.pet_warmth_events (
  id         uuid primary key default gen_random_uuid(),
  pet_id     uuid not null references public.couple_pets(id) on delete cascade,
  couple_id  uuid not null references public.couples(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  source     text not null check (source in (
               'hi', 'hi_both', 'kangen', 'mood', 'daily', 'moment', 'moment_social',
               'letter', 'jar', 'bucket_done', 'plan', 'saving', 'game', 'legacy')),
  ref_id     uuid,
  gesture    text check (gesture is null or gesture in ('pat', 'snack', 'play')),
  detail     text check (detail is null or char_length(detail) <= 40),
  -- integer, not smallint: a legacy row carries a pet's whole old XP.
  points     integer not null default 0 check (points >= 0),
  day        date not null default ((now() at time zone 'Asia/Jakarta')::date),
  created_at timestamptz not null default now()
);
comment on table public.pet_warmth_events is
  'Pet Kita warmth ledger. sum(points) = couple_pets.xp. Written only by pet_award() and the remake migration.';

-- A source event pays once, whatever path replays it (mood edits, the second
-- Two Truths row, a bucket item checked twice).
create unique index if not exists pet_warmth_events_source_ref
  on public.pet_warmth_events (source, ref_id) where ref_id is not null;
create unique index if not exists pet_warmth_events_hi_once
  on public.pet_warmth_events (pet_id, actor_id, day) where source = 'hi';
create unique index if not exists pet_warmth_events_hi_both_once
  on public.pet_warmth_events (pet_id, day) where source = 'hi_both';
create unique index if not exists pet_warmth_events_legacy_once
  on public.pet_warmth_events (pet_id) where source = 'legacy';
create index if not exists pet_warmth_events_pet_created
  on public.pet_warmth_events (pet_id, created_at desc);
create index if not exists pet_warmth_events_pet_day
  on public.pet_warmth_events (pet_id, day, source);
create index if not exists pet_warmth_events_couple
  on public.pet_warmth_events (couple_id);
create index if not exists pet_warmth_events_actor
  on public.pet_warmth_events (actor_id);

-- ------------------------------------------------------------
-- 3. Existing pets: hatched + one legacy ledger row (first run only)
--    Name, pet_type, created_at, xp and level are not touched.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'couple_pets' and column_name = 'hatched_at'
  ) then
    alter table public.couple_pets add column hatched_at timestamptz;
    -- Existing pets are already home.
    update public.couple_pets set hatched_at = coalesce(created_at, now());
    -- One legacy row per existing pet, so sum(points) = xp from day one. A pet
    -- with 0 XP still gets its (0 point) row: it marks the pet as moved in from
    -- the old room, which is what pet_status().migrated reads.
    insert into public.pet_warmth_events (pet_id, couple_id, actor_id, source, points, day, created_at)
    select p.id, p.couple_id, null, 'legacy', greatest(p.xp, 0),
           (coalesce(p.created_at, now()) at time zone 'Asia/Jakarta')::date,
           coalesce(p.created_at, now())
    from public.couple_pets p
    where not exists (select 1 from public.pet_warmth_events e where e.pet_id = p.id);
  end if;
end $$;

alter table public.notification_prefs add column if not exists pet boolean not null default true;

-- ------------------------------------------------------------
-- 4. Daily notes and visits
-- ------------------------------------------------------------
create table if not exists public.pet_daily_notes (
  pet_id             uuid not null references public.couple_pets(id) on delete cascade,
  couple_id          uuid not null references public.couples(id) on delete cascade,
  note_date          date not null,
  kind               text not null default 'daily' check (kind in ('daily', 'weekly')),
  status             text not null default 'pending' check (status in ('pending', 'ready')),
  source             text check (source is null or source in ('ai', 'template')),
  title              text check (title is null or char_length(title) <= 80),
  line               text check (line is null or char_length(line) <= 280),
  highlight          text check (highlight is null or char_length(highlight) <= 200),
  pose               text check (pose is null or pose in ('glowing', 'cozy', 'comfort', 'proud')),
  model              text,
  input_tokens       integer check (input_tokens is null or input_tokens >= 0),
  cache_read_tokens  integer check (cache_read_tokens is null or cache_read_tokens >= 0),
  cache_write_tokens integer check (cache_write_tokens is null or cache_write_tokens >= 0),
  output_tokens      integer check (output_tokens is null or output_tokens >= 0),
  cost_usd           numeric(8, 6) check (cost_usd is null or cost_usd >= 0),
  attempts           smallint not null default 0 check (attempts >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (pet_id, note_date),
  constraint pet_daily_notes_ready_has_line check (status <> 'ready' or (line is not null and source is not null)),
  constraint pet_daily_notes_ai_usage check (source is distinct from 'ai' or (
    model is not null and input_tokens is not null and cache_read_tokens is not null
    and cache_write_tokens is not null and output_tokens is not null and cost_usd is not null))
);
create index if not exists pet_daily_notes_couple_date on public.pet_daily_notes (couple_id, note_date desc);

drop trigger if exists pet_daily_notes_touch_updated_at on public.pet_daily_notes;
create trigger pet_daily_notes_touch_updated_at before update on public.pet_daily_notes
  for each row execute function public.touch_updated_at();

create table if not exists public.pet_visits (
  pet_id           uuid not null references public.couple_pets(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  last_seen_at     timestamptz not null default now(),
  celebrated_level integer not null default 1 check (celebrated_level >= 1),
  intro_seen_at    timestamptz,
  created_at       timestamptz not null default now(),
  primary key (pet_id, profile_id)
);
create index if not exists pet_visits_profile on public.pet_visits (profile_id);

-- ------------------------------------------------------------
-- 5. pet_award: the only writer of warmth (internal)
--    Locks the pet, applies the per-source cap, the game cap and the couple
--    cap of 50 a Jakarta day, writes the ledger row, adds XP, and on a level
--    up writes the feed line. Any error returns 0: a pet bug never blocks
--    saving a Moment.
-- ------------------------------------------------------------
create or replace function public.pet_award(
  p_couple  uuid,
  p_actor   uuid,
  p_source  text,
  p_ref_id  uuid default null,
  p_detail  text default null,
  p_gesture text default null
)
returns integer
language plpgsql
security definer
set search_path = public
-- Waiting on the pet row is bounded: past 2 s the award is skipped (returns 0)
-- and the Moment, letter or Kangen that triggered it saves anyway.
set lock_timeout = '2s'
as $$
declare
  v_rules  jsonb := public.pet_rules();
  v_rule   jsonb;
  v_pet    public.couple_pets;
  v_day    date := (now() at time zone 'Asia/Jakarta')::date;
  v_points integer;
  v_count  integer;
  v_used   integer;
  v_id     uuid;
  v_level  integer;
begin
  if p_couple is null or p_source is null or p_source = 'legacy' then
    return 0;
  end if;
  v_rule := v_rules -> 'sources' -> p_source;
  if v_rule is null then
    return 0;
  end if;

  -- One lock per couple serialises every cap check below.
  select * into v_pet from public.couple_pets where couple_id = p_couple for update;
  if not found then
    return 0;
  end if;

  if p_ref_id is not null and exists (
    select 1 from public.pet_warmth_events where source = p_source and ref_id = p_ref_id
  ) then
    return 0;
  end if;

  if jsonb_typeof(v_rule -> 'points') = 'object' then
    v_points := (v_rule -> 'points' ->> p_detail)::integer;
  else
    v_points := (v_rule ->> 'points')::integer;
  end if;
  if coalesce(v_points, 0) <= 0 then
    return 0;
  end if;

  -- Per-source cap: events per person or per couple, per Jakarta day.
  select count(*), coalesce(sum(points), 0) into v_count, v_used
  from public.pet_warmth_events
  where pet_id = v_pet.id and day = v_day and source = p_source
    and (v_rule ->> 'per' = 'couple' or actor_id is not distinct from p_actor);
  if v_count >= (v_rule ->> 'cap')::integer then
    return 0;
  end if;
  if v_rule ? 'cap_points' then
    v_points := least(v_points, greatest(0, (v_rule ->> 'cap_points')::integer - v_used));
  end if;

  -- Couple cap for the day (legacy rows excluded).
  select coalesce(sum(points), 0) into v_used
  from public.pet_warmth_events
  where pet_id = v_pet.id and day = v_day and source <> 'legacy';
  v_points := least(v_points, greatest(0, (v_rules ->> 'daily_cap')::integer - v_used));

  -- A hi is presence and is kept even when the day is full; anything else
  -- that earns nothing leaves no row.
  if v_points <= 0 and p_source <> 'hi' then
    return 0;
  end if;

  insert into public.pet_warmth_events (pet_id, couple_id, actor_id, source, ref_id, gesture, detail, points, day)
  values (v_pet.id, v_pet.couple_id, p_actor, p_source, p_ref_id,
          case when p_source = 'hi' then p_gesture end, p_detail, v_points, v_day)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    return 0;
  end if;

  if v_points > 0 then
    update public.couple_pets
    set xp = xp + v_points,
        -- Same formula as before; greatest() so a level never goes down.
        level = greatest(level, (xp + v_points) / (v_rules ->> 'xp_per_level')::integer + 1)
    where id = v_pet.id
    returning level into v_level;

    if v_level > v_pet.level then
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (v_pet.couple_id, p_actor, 'pet', v_pet.id,
              format('helped %s reach level %s', v_pet.name, v_level), '/app/pet');
    end if;
  end if;

  return v_points;
exception when others then
  return 0;
end;
$$;

-- ------------------------------------------------------------
-- 6. Event sources (triggers). Each wraps its call so nothing a pet does can
--    fail the insert that triggered it.
-- ------------------------------------------------------------
create or replace function public.pet_on_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Pet lines and "left this couple" never pay (no recursion).
  if new.kind in ('pet', 'left') then
    return null;
  end if;
  begin
    case new.kind
      when 'moment' then
        perform public.pet_award(new.couple_id, new.actor_id, 'moment', new.ref_id);
      when 'comment', 'reaction' then
        -- ref_id is the moment for both; the activity row is the event.
        perform public.pet_award(new.couple_id, new.actor_id, 'moment_social', new.id);
      when 'mood' then
        perform public.pet_award(new.couple_id, new.actor_id, 'mood', new.ref_id);
      when 'daily' then
        perform public.pet_award(new.couple_id, new.actor_id, 'daily', new.ref_id);
      when 'letter' then
        perform public.pet_award(new.couple_id, new.actor_id, 'letter', new.ref_id);
      when 'gratitude' then
        perform public.pet_award(new.couple_id, new.actor_id, 'jar', new.ref_id);
      when 'bucket_done' then
        perform public.pet_award(new.couple_id, new.actor_id, 'bucket_done', new.ref_id);
      when 'bucket_add', 'event' then
        perform public.pet_award(new.couple_id, new.actor_id, 'plan', new.ref_id);
      when 'saving' then
        if exists (select 1 from public.couple_transactions where id = new.ref_id and amount > 0) then
          perform public.pet_award(new.couple_id, new.actor_id, 'saving', new.ref_id);
        end if;
      when 'two_truths' then
        -- Written on create and on guess with the same round id: pays once.
        perform public.pet_award(new.couple_id, new.actor_id, 'game', new.ref_id, 'two_truths');
      when 'samakan' then
        -- Samakan v2 (20261104121000) writes this kind when a set starts, is
        -- finished, is ended early, and for live invites. Only a finished set
        -- pays: its status is already 'done' when the row is written.
        if new.ref_id is not null and to_regclass('public.samakan_sets') is not null then
          if exists (select 1 from public.samakan_sets where id = new.ref_id and status = 'done') then
            perform public.pet_award(new.couple_id, new.actor_id, 'game', new.ref_id, 'samakan');
          end if;
        end if;
      else
        null;
    end case;
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists activities_pet_warmth on public.activities;
create trigger activities_pet_warmth after insert on public.activities
  for each row execute function public.pet_on_activity();

create or replace function public.pet_on_kangen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.pet_award(new.couple_id, new.sender_id, 'kangen', new.id);
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists miss_you_pet_warmth on public.miss_you;
create trigger miss_you_pet_warmth after insert on public.miss_you
  for each row execute function public.pet_on_kangen();

-- Legacy Samakan sessions moving to completed.
create or replace function public.pet_on_game_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    begin
      perform public.pet_award(new.couple_id, coalesce(new.created_by, auth.uid()), 'game', new.id, 'samakan');
    exception when others then
      null;
    end;
  end if;
  return null;
end;
$$;

drop trigger if exists game_sessions_pet_warmth on public.game_sessions;
create trigger game_sessions_pet_warmth after update of status on public.game_sessions
  for each row execute function public.pet_on_game_session();

-- Deep Talk: every level that newly appears in completed_levels. The ref is
-- derived from couple + pack + level, so a deleted and re-created progress row
-- can't pay the same level twice.
create or replace function public.pet_on_deep_talk()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old   integer[] := '{}';
  v_level integer;
begin
  if tg_op = 'UPDATE' then
    v_old := coalesce(old.completed_levels, '{}');
  end if;
  begin
    for v_level in
      select distinct x from unnest(coalesce(new.completed_levels, '{}')) as x
      where not (x = any (v_old))
      order by x
    loop
      perform public.pet_award(
        new.couple_id, auth.uid(), 'game',
        md5('deep_talk:' || new.couple_id::text || ':' || new.pack_id::text || ':' || v_level::text)::uuid,
        'deep_talk');
    end loop;
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists deep_talk_progress_pet_warmth on public.deep_talk_progress;
create trigger deep_talk_progress_pet_warmth after insert or update of completed_levels on public.deep_talk_progress
  for each row execute function public.pet_on_deep_talk();

-- ------------------------------------------------------------
-- 7. couple_pets: name and type rules, feed lines, imported XP
-- ------------------------------------------------------------
create or replace function public.pet_check_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rules jsonb := public.pet_rules();
begin
  if tg_op = 'INSERT' or new.name is distinct from old.name then
    new.name := btrim(coalesce(new.name, ''));
    if char_length(new.name) < 1 or char_length(new.name) > (v_rules -> 'limits' ->> 'name_max')::integer then
      raise exception 'Give your pet a name of 1 to 20 characters' using errcode = '22023', hint = 'PET_INVALID';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.pet_type := lower(btrim(coalesce(new.pet_type, '')));
    if not (v_rules -> 'types') ? new.pet_type then
      raise exception 'Pick a cat or a dog' using errcode = '22023', hint = 'PET_INVALID';
    end if;
    if auth.uid() is not null
       and exists (select 1 from public.couples where id = new.couple_id and closed_at is not null) then
      raise exception 'This couple space is closed, so a new pet can''t move in' using errcode = 'P0001', hint = 'PET_CLOSED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists couple_pets_check_write on public.couple_pets;
create trigger couple_pets_check_write before insert or update of name on public.couple_pets
  for each row execute function public.pet_check_write();

create or replace function public.pet_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.xp, 0) > 0 then
    -- A pet imported with XP (service role, restore): its XP becomes the legacy
    -- row so sum(points) = xp still holds. Not an adoption.
    insert into public.pet_warmth_events (pet_id, couple_id, actor_id, source, points, day, created_at)
    values (new.id, new.couple_id, null, 'legacy', new.xp,
            (coalesce(new.created_at, now()) at time zone 'Asia/Jakarta')::date, coalesce(new.created_at, now()))
    on conflict do nothing;
  else
    insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
    values (new.couple_id, auth.uid(), 'pet', new.id,
            format('adopted a %s called %s', new.pet_type, new.name), '/app/pet');
  end if;
  return null;
end;
$$;

drop trigger if exists couple_pets_after_insert on public.couple_pets;
create trigger couple_pets_after_insert after insert on public.couple_pets
  for each row execute function public.pet_after_insert();

create or replace function public.pet_after_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
    values (new.couple_id, auth.uid(), 'pet', new.id,
            format('renamed the pet to %s', new.name), '/app/pet');
  end if;
  return null;
end;
$$;

drop trigger if exists couple_pets_after_rename on public.couple_pets;
create trigger couple_pets_after_rename after update of name on public.couple_pets
  for each row execute function public.pet_after_rename();

-- CHECKs for new rows. NOT VALID so no existing row can block the migration;
-- and skipped when an existing row breaks the rule, because a NOT VALID check
-- still applies to every later UPDATE of that row (the XP update would then
-- fail for that pet). The trigger above enforces the same rules either way.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'couple_pets_pet_type_check'
                 and conrelid = 'public.couple_pets'::regclass) then
    if exists (select 1 from public.couple_pets where pet_type not in ('cat', 'dog')) then
      raise notice 'couple_pets_pet_type_check skipped: an existing pet has another type';
    else
      alter table public.couple_pets add constraint couple_pets_pet_type_check
        check (pet_type in ('cat', 'dog')) not valid;
    end if;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'couple_pets_name_check'
                 and conrelid = 'public.couple_pets'::regclass) then
    if exists (select 1 from public.couple_pets where char_length(btrim(name)) not between 1 and 20) then
      raise notice 'couple_pets_name_check skipped: an existing pet has a longer name';
    else
      alter table public.couple_pets add constraint couple_pets_name_check
        check (char_length(btrim(name)) between 1 and 20) not valid;
    end if;
  end if;
end $$;

-- ------------------------------------------------------------
-- 8. RPCs
-- ------------------------------------------------------------

-- Pick a pet together. Returns the existing pet when the partner was faster.
create or replace function public.adopt_pet(p_type text, p_name text)
returns public.couple_pets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_couple public.couples;
  v_pet    public.couple_pets;
begin
  if v_uid is null then
    raise exception 'Log in to adopt a pet' using errcode = '28000', hint = 'PET_AUTH';
  end if;
  select c.* into v_couple
  from public.couples c join public.couple_members m on m.couple_id = c.id
  where m.profile_id = v_uid;
  if not found then
    raise exception 'You''re not connected with a partner yet' using errcode = 'P0001', hint = 'PET_NO_COUPLE';
  end if;

  select * into v_pet from public.couple_pets where couple_id = v_couple.id;
  if found then
    return v_pet;
  end if;

  -- Type, name and a closed couple are checked by couple_pets_check_write.
  insert into public.couple_pets (couple_id, pet_type, name)
  values (v_couple.id, p_type, p_name)
  on conflict (couple_id) do nothing
  returning * into v_pet;
  if v_pet.id is null then
    select * into v_pet from public.couple_pets where couple_id = v_couple.id;
  end if;
  return v_pet;
end;
$$;

-- The one daily tap. The first gesture of the Jakarta day counts (+5), the
-- second partner's first one adds the "both of you" bonus (+5), later taps
-- return counted = false and change nothing.
create or replace function public.pet_say_hi(p_gesture text default 'pat')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_day     date := (now() at time zone 'Asia/Jakarta')::date;
  v_gesture text := lower(btrim(coalesce(p_gesture, 'pat')));
  v_couple  public.couples;
  v_pet     public.couple_pets;
  v_after   public.couple_pets;
  v_points  integer := 0;
  v_both    boolean;
begin
  if v_uid is null then
    raise exception 'Log in to say hi' using errcode = '28000', hint = 'PET_AUTH';
  end if;
  if not (public.pet_rules() -> 'gestures') ? v_gesture then
    raise exception 'Pick pat, snack or play' using errcode = '22023', hint = 'PET_INVALID';
  end if;
  select c.* into v_couple
  from public.couples c join public.couple_members m on m.couple_id = c.id
  where m.profile_id = v_uid;
  if not found then
    raise exception 'You''re not connected with a partner yet' using errcode = 'P0001', hint = 'PET_NO_COUPLE';
  end if;
  if v_couple.closed_at is not null then
    raise exception 'This couple space is closed, so the pet is resting' using errcode = 'P0001', hint = 'PET_CLOSED';
  end if;

  select * into v_pet from public.couple_pets where couple_id = v_couple.id for update;
  if not found then
    raise exception 'Adopt Pet Kita first' using errcode = 'P0001', hint = 'PET_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.pet_warmth_events
    where pet_id = v_pet.id and source = 'hi' and actor_id = v_uid and day = v_day
  ) then
    v_points := public.pet_award(v_couple.id, v_uid, 'hi', null, null, v_gesture);

    if exists (
      select 1 from public.pet_warmth_events
      where pet_id = v_pet.id and source = 'hi' and actor_id = v_uid and day = v_day
    ) then
      if exists (
        select 1 from public.pet_warmth_events
        where pet_id = v_pet.id and source = 'hi' and day = v_day and actor_id <> v_uid
      ) then
        v_points := v_points + public.pet_award(v_couple.id, v_uid, 'hi_both');
      end if;

      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (v_couple.id, v_uid, 'pet', v_pet.id, format('said hi to %s', v_pet.name), '/app/pet');

      -- Home once everyone in the couple has said hi at least once.
      if v_pet.hatched_at is null and not exists (
        select 1 from public.couple_members m
        where m.couple_id = v_couple.id
          and not exists (
            select 1 from public.pet_warmth_events e
            where e.pet_id = v_pet.id and e.source = 'hi' and e.actor_id = m.profile_id)
      ) then
        update public.couple_pets set hatched_at = now() where id = v_pet.id;
      end if;

      select * into v_after from public.couple_pets where id = v_pet.id;
      select count(distinct actor_id) >= 2 into v_both
      from public.pet_warmth_events where pet_id = v_pet.id and source = 'hi' and day = v_day;
      return jsonb_build_object(
        'counted', true, 'points', v_points, 'both_today', v_both,
        'level', v_after.level, 'xp', v_after.xp, 'leveled_up', v_after.level > v_pet.level,
        'hatched', v_after.hatched_at is not null,
        'just_hatched', v_pet.hatched_at is null and v_after.hatched_at is not null);
    end if;
  end if;

  select count(distinct actor_id) >= 2 into v_both
  from public.pet_warmth_events where pet_id = v_pet.id and source = 'hi' and day = v_day;
  return jsonb_build_object(
    'counted', false, 'points', 0, 'both_today', v_both,
    'level', v_pet.level, 'xp', v_pet.xp, 'leveled_up', false,
    'hatched', v_pet.hatched_at is not null, 'just_hatched', false);
end;
$$;

-- Everything the pet screen shows about the pet's state. The only source:
-- the client mirrors nothing. p_pet_id null = the caller's own pet.
create or replace function public.pet_status(p_pet_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_rules    jsonb := public.pet_rules();
  v_day      date := (now() at time zone 'Asia/Jakarta')::date;
  v_hour     integer := extract(hour from (now() at time zone 'Asia/Jakarta'))::integer;
  v_per      integer := (v_rules ->> 'xp_per_level')::integer;
  v_pet      public.couple_pets;
  v_members  uuid[];
  v_w72      integer;
  v_present  integer;
  v_mood     text;
  v_stage    text;
  v_comfort  uuid[];
  v_hi       jsonb;
  v_both     boolean;
begin
  if p_pet_id is null then
    -- The caller's own pet; null (not an error) while there is none yet, so
    -- Home can show "Adopt Pet Kita together".
    select * into v_pet from public.couple_pets where couple_id = public.get_my_couple_id();
    if v_pet.id is null then
      return null;
    end if;
  else
    select * into v_pet from public.couple_pets where id = p_pet_id;
  end if;
  -- auth.uid() is null only for the service role (and the database owner):
  -- execute is granted to authenticated and service_role only.
  if v_pet.id is null or (v_uid is not null and not public.is_couple_member(v_pet.couple_id)) then
    raise exception 'Pet not found' using errcode = 'P0001', hint = 'PET_NOT_FOUND';
  end if;

  select coalesce(array_agg(profile_id), '{}') into v_members
  from public.couple_members where couple_id = v_pet.couple_id;

  select coalesce(sum(points), 0)::integer,
         count(distinct actor_id) filter (where actor_id = any (v_members))::integer
    into v_w72, v_present
  from public.pet_warmth_events
  where pet_id = v_pet.id and source <> 'legacy'
    and created_at > now() - make_interval(hours => (v_rules -> 'state' ->> 'window_hours')::integer);

  v_mood := case
    when v_w72 >= (v_rules -> 'state' ->> 'glowing_min')::integer
         and v_present >= greatest(1, cardinality(v_members)) then 'glowing'
    when v_w72 >= (v_rules -> 'state' ->> 'cozy_min')::integer then 'cozy'
    else 'dozy'
  end;

  select s ->> 'key' into v_stage
  from jsonb_array_elements(v_rules -> 'stages') s
  where (s ->> 'from_level')::integer <= v_pet.level
  order by (s ->> 'from_level')::integer desc
  limit 1;

  select coalesce(array_agg(profile_id order by updated_at desc), '{}') into v_comfort
  from public.mood_checkins
  where couple_id = v_pet.couple_id and checkin_date = v_day
    and profile_id = any (v_members)
    and mood in (select jsonb_array_elements_text(v_rules -> 'heavy_moods'));

  select coalesce(jsonb_agg(jsonb_build_object('profile_id', actor_id, 'gesture', gesture, 'at', created_at)
                            order by created_at), '[]'::jsonb),
         count(distinct actor_id) >= 2
    into v_hi, v_both
  from public.pet_warmth_events
  where pet_id = v_pet.id and source = 'hi' and day = v_day;

  return jsonb_build_object(
    'pet_id', v_pet.id,
    'couple_id', v_pet.couple_id,
    'name', v_pet.name,
    'pet_type', v_pet.pet_type,
    'created_at', v_pet.created_at,
    'level', v_pet.level,
    'xp', v_pet.xp,
    'into_level', least(greatest(v_pet.xp - (v_pet.level - 1) * v_per, 0), v_per - 1),
    'xp_per_level', v_per,
    'stage', coalesce(v_stage, 'little'),
    'mood', v_mood,
    'warmth_72h', v_w72,
    'comfort_for', to_jsonb(v_comfort),
    'said_hi_today', v_hi,
    'both_today', v_both,
    'hatched', v_pet.hatched_at is not null,
    'hatched_at', v_pet.hatched_at,
    'migrated', exists (select 1 from public.pet_warmth_events where pet_id = v_pet.id and source = 'legacy'),
    'night', v_hour >= (v_rules -> 'night' ->> 'from_hour')::integer
             or v_hour < (v_rules -> 'night' ->> 'to_hour')::integer,
    'day', v_day
  );
end;
$$;

-- Marks a visit and returns the previous one (for "Since your last visit").
-- The first visit starts at the pet's current level, so no overlay fires for
-- levels earned before; celebrated_level only moves up, never past the level.
create or replace function public.pet_mark_visit(
  p_pet_id           uuid default null,
  p_celebrated_level integer default null,
  p_intro_seen       boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_pet  public.couple_pets;
  v_prev public.pet_visits;
  v_row  public.pet_visits;
begin
  if v_uid is null then
    raise exception 'Log in to visit your pet' using errcode = '28000', hint = 'PET_AUTH';
  end if;
  if p_pet_id is null then
    select * into v_pet from public.couple_pets where couple_id = public.get_my_couple_id();
  else
    select * into v_pet from public.couple_pets where id = p_pet_id;
  end if;
  if v_pet.id is null or not public.is_couple_member(v_pet.couple_id) then
    raise exception 'Pet not found' using errcode = 'P0001', hint = 'PET_NOT_FOUND';
  end if;

  select * into v_prev from public.pet_visits
  where pet_id = v_pet.id and profile_id = v_uid for update;

  if v_prev.pet_id is null then
    insert into public.pet_visits (pet_id, profile_id, last_seen_at, celebrated_level, intro_seen_at)
    values (v_pet.id, v_uid, now(), greatest(v_pet.level, 1), case when p_intro_seen then now() end)
    on conflict (pet_id, profile_id) do nothing
    returning * into v_row;
    if v_row.pet_id is null then
      select * into v_row from public.pet_visits where pet_id = v_pet.id and profile_id = v_uid;
    end if;
  else
    update public.pet_visits set
      last_seen_at = now(),
      celebrated_level = greatest(celebrated_level, least(coalesce(p_celebrated_level, celebrated_level), v_pet.level)),
      intro_seen_at = coalesce(intro_seen_at, case when p_intro_seen then now() end)
    where pet_id = v_pet.id and profile_id = v_uid
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'first_visit', v_prev.pet_id is null,
    'previous_seen_at', v_prev.last_seen_at,
    'last_seen_at', v_row.last_seen_at,
    'celebrated_level', v_row.celebrated_level,
    'intro_seen_at', v_row.intro_seen_at,
    'level', v_pet.level);
end;
$$;

-- Service role: claim today's note before calling the model. Only the claimant
-- calls; a pending claim older than pending_seconds can be taken over, at most
-- max_attempts per day, never once the day's cost reaches cost_cap_usd, and
-- never when the couple earned no warmth in quiet_days (template instead).
create or replace function public.pet_claim_note(
  p_pet_id    uuid,
  p_note_date date default null,
  p_kind      text default 'daily'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note  jsonb := public.pet_rules() -> 'note';
  v_date  date := coalesce(p_note_date, (now() at time zone 'Asia/Jakarta')::date);
  v_pet   public.couple_pets;
  v_row   public.pet_daily_notes;
  v_cost  numeric;
begin
  if p_kind is null or p_kind not in ('daily', 'weekly') then
    raise exception 'Unknown note kind' using errcode = '22023', hint = 'PET_INVALID';
  end if;
  select * into v_pet from public.couple_pets where id = p_pet_id;
  if not found then
    raise exception 'Pet not found' using errcode = 'P0001', hint = 'PET_NOT_FOUND';
  end if;

  select * into v_row from public.pet_daily_notes where pet_id = v_pet.id and note_date = v_date for update;
  if v_row.pet_id is null then
    if not exists (
      select 1 from public.pet_warmth_events
      where pet_id = v_pet.id and source <> 'legacy'
        and created_at > now() - make_interval(days => (v_note ->> 'quiet_days')::integer)
    ) then
      return jsonb_build_object('claimed', false, 'reason', 'quiet', 'attempt', 0, 'note', null);
    end if;
    insert into public.pet_daily_notes (pet_id, couple_id, note_date, kind, status, attempts)
    values (v_pet.id, v_pet.couple_id, v_date, p_kind, 'pending', 1)
    on conflict (pet_id, note_date) do nothing
    returning * into v_row;
    if v_row.pet_id is not null then
      return jsonb_build_object('claimed', true, 'reason', null, 'attempt', 1, 'note', to_jsonb(v_row));
    end if;
    -- Lost the race: someone else claimed a moment ago.
    select * into v_row from public.pet_daily_notes where pet_id = v_pet.id and note_date = v_date for update;
  end if;

  if v_row.status = 'ready' then
    return jsonb_build_object('claimed', false, 'reason', 'ready', 'attempt', v_row.attempts, 'note', to_jsonb(v_row));
  end if;
  if v_row.updated_at > now() - make_interval(secs => (v_note ->> 'pending_seconds')::integer) then
    return jsonb_build_object('claimed', false, 'reason', 'busy', 'attempt', v_row.attempts, 'note', to_jsonb(v_row));
  end if;
  if v_row.attempts >= (v_note ->> 'max_attempts')::integer then
    return jsonb_build_object('claimed', false, 'reason', 'attempts', 'attempt', v_row.attempts, 'note', to_jsonb(v_row));
  end if;
  select coalesce(sum(cost_usd), 0) into v_cost
  from public.pet_daily_notes where couple_id = v_pet.couple_id and note_date = v_date;
  if v_cost >= (v_note ->> 'cost_cap_usd')::numeric then
    return jsonb_build_object('claimed', false, 'reason', 'budget', 'attempt', v_row.attempts, 'note', to_jsonb(v_row));
  end if;

  update public.pet_daily_notes
  set attempts = attempts + 1, kind = p_kind
  where pet_id = v_pet.id and note_date = v_date
  returning * into v_row;
  return jsonb_build_object('claimed', true, 'reason', null, 'attempt', v_row.attempts, 'note', to_jsonb(v_row));
end;
$$;

-- The old care RPC stays callable (old clients, old push links) and counts as
-- that person's hi. It never raises a cooldown or role error.
create or replace function public.perform_pet_care(p_pet_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gesture text := case lower(coalesce(p_action, ''))
    when 'feed' then 'snack' when 'treat' then 'snack'
    when 'play' then 'play'  when 'walk'  then 'play'
    else 'pat' end;
begin
  if not exists (select 1 from public.couple_pets where id = p_pet_id and public.is_couple_member(couple_id)) then
    raise exception 'Pet not found';
  end if;
  begin
    perform public.pet_say_hi(v_gesture);
  exception when others then
    null;
  end;
  return jsonb_build_object('hunger', 100, 'happiness', 100, 'cleanliness', 100, 'mood', 'thriving');
end;
$$;

-- ------------------------------------------------------------
-- 9. RLS and grants
-- ------------------------------------------------------------
alter table public.pet_warmth_events enable row level security;
alter table public.pet_daily_notes   enable row level security;
alter table public.pet_visits        enable row level security;

drop policy if exists pet_warmth_events_select on public.pet_warmth_events;
create policy pet_warmth_events_select on public.pet_warmth_events for select to authenticated
  using (public.is_couple_member(couple_id));
drop policy if exists pet_daily_notes_select on public.pet_daily_notes;
create policy pet_daily_notes_select on public.pet_daily_notes for select to authenticated
  using (public.is_couple_member(couple_id));
drop policy if exists pet_visits_select_own on public.pet_visits;
create policy pet_visits_select_own on public.pet_visits for select to authenticated
  using (profile_id = auth.uid());

-- New tables: read-only for members, written by the functions above (and the
-- service role for notes).
revoke all on public.pet_warmth_events, public.pet_daily_notes, public.pet_visits from public, anon, authenticated;
grant select on public.pet_warmth_events, public.pet_daily_notes, public.pet_visits to authenticated;
revoke all on public.pet_warmth_events, public.pet_visits from service_role;
grant select on public.pet_warmth_events, public.pet_visits to service_role;
grant select, insert, update, delete on public.pet_daily_notes to service_role;

-- Old tables become read-only history. This closes the two holes: members
-- rewriting care roles, and any member deleting the pet (and with it every
-- log row). A new pet takes only couple, type and name from a client; XP,
-- level and hatched_at come from the server.
revoke insert, update, delete on public.pet_care_roles from authenticated;
revoke insert, update, delete on public.pet_mood_state from authenticated;
revoke insert, update, delete on public.pet_care_logs from authenticated;
revoke delete on public.couple_pets from authenticated;
revoke insert on public.couple_pets from authenticated;
grant insert (couple_id, pet_type, name) on public.couple_pets to authenticated;
grant update (name) on public.couple_pets to authenticated;
revoke insert, update, delete on public.couple_pets, public.pet_care_roles, public.pet_mood_state,
  public.pet_care_logs from anon;

-- Functions: internal ones for no API role; RPCs for the roles that use them.
revoke all on function public.pet_award(uuid, uuid, text, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.pet_on_activity() from public, anon, authenticated, service_role;
revoke all on function public.pet_on_kangen() from public, anon, authenticated, service_role;
revoke all on function public.pet_on_game_session() from public, anon, authenticated, service_role;
revoke all on function public.pet_on_deep_talk() from public, anon, authenticated, service_role;
revoke all on function public.pet_check_write() from public, anon, authenticated, service_role;
revoke all on function public.pet_after_insert() from public, anon, authenticated, service_role;
revoke all on function public.pet_after_rename() from public, anon, authenticated, service_role;

revoke all on function public.pet_rules() from public, anon;
revoke all on function public.adopt_pet(text, text) from public, anon, service_role;
revoke all on function public.pet_say_hi(text) from public, anon, service_role;
revoke all on function public.pet_status(uuid) from public, anon;
revoke all on function public.pet_mark_visit(uuid, integer, boolean) from public, anon, service_role;
revoke all on function public.pet_claim_note(uuid, date, text) from public, anon, authenticated;
revoke all on function public.perform_pet_care(uuid, text) from public, anon;

grant execute on function public.pet_rules() to authenticated, service_role;
grant execute on function public.adopt_pet(text, text) to authenticated;
grant execute on function public.pet_say_hi(text) to authenticated;
grant execute on function public.pet_status(uuid) to authenticated, service_role;
grant execute on function public.pet_mark_visit(uuid, integer, boolean) to authenticated;
grant execute on function public.pet_claim_note(uuid, date, text) to service_role;
grant execute on function public.perform_pet_care(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 10. Realtime: a partner's hi or a new note shows up without a reload
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['couple_pets', 'pet_warmth_events', 'pet_daily_notes'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
