-- Two Truths & a Lie (2026-11-03). Async bluffing game for two.
--
-- The author writes three statements about themselves, marks the lie and may
-- add a short story; the partner guesses once. Until that guess the lie index
-- and the story must stay unreadable to the guesser, so the table has no client
-- grants and no policies at all: every read and write goes through the
-- security definer RPCs below, which decide per caller what to return.
-- The table is not in the supabase_realtime publication; live refresh comes
-- from the activity rows the RPCs write (no secret text in them).
--
-- Errors carry a stable code in HINT (TT_*) for the client to map:
--   TT_AUTH, TT_NO_PARTNER, TT_CLOSED, TT_INVALID, TT_OPEN_ROUND,
--   TT_NOT_FOUND, TT_OWN_ROUND, TT_NOT_AUTHOR, TT_ALREADY_GUESSED

create table public.two_truths_rounds (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples(id) on delete cascade,
  -- Shared history survives an account deletion (same rule as game_sessions).
  author_id   uuid references public.profiles(id) on delete set null,
  statements  text[] not null,
  lie_index   smallint not null,
  story       text,
  guess_index smallint,
  guessed_by  uuid references public.profiles(id) on delete set null,
  guessed_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint two_truths_statements_shape check (
    array_ndims(statements) = 1
    and array_lower(statements, 1) = 1
    and cardinality(statements) = 3
    and array_position(statements, null) is null
    and char_length(btrim(statements[1])) between 1 and 120
    and char_length(btrim(statements[2])) between 1 and 120
    and char_length(btrim(statements[3])) between 1 and 120
    and lower(btrim(statements[1])) <> lower(btrim(statements[2]))
    and lower(btrim(statements[1])) <> lower(btrim(statements[3]))
    and lower(btrim(statements[2])) <> lower(btrim(statements[3]))
  ),
  constraint two_truths_lie_range check (lie_index between 0 and 2),
  constraint two_truths_story_len check (story is null or char_length(story) between 1 and 500),
  constraint two_truths_guess_range check (guess_index is null or guess_index between 0 and 2),
  constraint two_truths_guess_complete check ((guess_index is null) = (guessed_at is null))
);

-- One open (unguessed) round per author per couple. Per couple, so someone who
-- left a couple with a round still open can play again in their next one.
create unique index two_truths_one_open_round
  on public.two_truths_rounds (couple_id, author_id)
  where guessed_at is null;
create index two_truths_rounds_couple_created_idx
  on public.two_truths_rounds (couple_id, created_at desc);

alter table public.two_truths_rounds enable row level security;
-- No policies on purpose: clients never read or write the table directly.
revoke all on public.two_truths_rounds from public, anon, authenticated;
grant all on public.two_truths_rounds to service_role;

-- A canceled round also leaves the activity feed (same rule as R8).
create trigger two_truths_rounds_forget_activity after delete on public.two_truths_rounds
  for each row execute function public.forget_activity();

-- ============================================================
-- Create a round. Statements are trimmed; the client shuffles them first.
-- ============================================================

create or replace function public.two_truths_create(p_statements text[], p_lie_index int, p_story text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_couple public.couples;
  v_clean text[];
  v_story text := nullif(btrim(coalesce(p_story, '')), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Log in to play' using errcode = '28000', hint = 'TT_AUTH';
  end if;

  -- Shared lock: a partner leaving (leave_couple locks for update) waits for
  -- this insert, and this insert sees a couple closed a moment ago.
  select c.* into v_couple
  from public.couples c join public.couple_members m on m.couple_id = c.id
  where m.profile_id = v_uid
  for share of c;
  if v_couple.id is null then
    raise exception 'Connect with your partner to play' using errcode = 'P0001', hint = 'TT_NO_PARTNER';
  end if;
  if v_couple.closed_at is not null then
    raise exception 'This couple space is closed, so new rounds are off' using errcode = 'P0001', hint = 'TT_CLOSED';
  end if;
  if (select count(*) from public.couple_members where couple_id = v_couple.id) < 2 then
    raise exception 'Your partner has to join before you can play' using errcode = 'P0001', hint = 'TT_NO_PARTNER';
  end if;

  if p_statements is null or array_ndims(p_statements) is distinct from 1 or cardinality(p_statements) <> 3 then
    raise exception 'Write exactly three statements' using errcode = '22023', hint = 'TT_INVALID';
  end if;
  select array_agg(btrim(t.s) order by t.o) into v_clean
  from unnest(p_statements) with ordinality as t(s, o);
  if array_position(v_clean, null) is not null
     or exists (select 1 from unnest(v_clean) as t(s) where char_length(t.s) not between 1 and 120) then
    raise exception 'Each statement needs 1 to 120 characters' using errcode = '22023', hint = 'TT_INVALID';
  end if;
  if (select count(distinct lower(t.s)) from unnest(v_clean) as t(s)) < 3 then
    raise exception 'The three statements need to be different' using errcode = '22023', hint = 'TT_INVALID';
  end if;
  if p_lie_index is null or p_lie_index not between 0 and 2 then
    raise exception 'Mark one of the three statements as the lie' using errcode = '22023', hint = 'TT_INVALID';
  end if;
  if char_length(v_story) > 500 then
    raise exception 'Keep the story to 500 characters' using errcode = '22023', hint = 'TT_INVALID';
  end if;

  if exists (select 1 from public.two_truths_rounds
             where couple_id = v_couple.id and author_id = v_uid and guessed_at is null) then
    raise exception 'You already have a round waiting for a guess' using errcode = 'P0001', hint = 'TT_OPEN_ROUND';
  end if;

  begin
    insert into public.two_truths_rounds (couple_id, author_id, statements, lie_index, story)
    values (v_couple.id, v_uid, v_clean, p_lie_index, v_story)
    returning id into v_id;
  exception when unique_violation then
    -- Two taps at once: the index lets only one through.
    raise exception 'You already have a round waiting for a guess' using errcode = 'P0001', hint = 'TT_OPEN_ROUND';
  end;

  insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
  values (v_couple.id, v_uid, 'two_truths', v_id, 'sent a round of Two Truths & a Lie', '/app/games/two-truths');
  return v_id;
end;
$$;

-- ============================================================
-- Guess once. Returns the lie and the story only now.
-- ============================================================

create or replace function public.two_truths_guess(p_round_id uuid, p_index int)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_round public.two_truths_rounds;
  v_correct boolean;
begin
  if v_uid is null then
    raise exception 'Log in to play' using errcode = '28000', hint = 'TT_AUTH';
  end if;
  if p_index is null or p_index not between 0 and 2 then
    raise exception 'Pick one of the three statements' using errcode = '22023', hint = 'TT_INVALID';
  end if;

  -- Row lock: two guesses at once (or a guess racing a cancel) run one after
  -- the other, and the second one sees what the first did.
  select * into v_round from public.two_truths_rounds where id = p_round_id for update;
  if v_round.id is null or not public.is_couple_member(v_round.couple_id) then
    raise exception 'This round isn''t here anymore' using errcode = 'P0002', hint = 'TT_NOT_FOUND';
  end if;
  if v_round.author_id = v_uid then
    raise exception 'You can''t guess your own round' using errcode = '42501', hint = 'TT_OWN_ROUND';
  end if;
  if v_round.guessed_at is not null then
    raise exception 'This round has already been guessed' using errcode = 'P0001', hint = 'TT_ALREADY_GUESSED';
  end if;
  if exists (select 1 from public.couples where id = v_round.couple_id and closed_at is not null) then
    raise exception 'This couple space is closed, so guesses are off' using errcode = 'P0001', hint = 'TT_CLOSED';
  end if;

  update public.two_truths_rounds
  set guess_index = p_index, guessed_by = v_uid, guessed_at = now()
  where id = v_round.id
  returning * into v_round;
  v_correct := v_round.guess_index = v_round.lie_index;

  insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
  values (v_round.couple_id, v_uid, 'two_truths', v_round.id,
          case when v_correct then 'spotted the lie in Two Truths & a Lie'
               else 'fell for the lie in Two Truths & a Lie' end,
          '/app/games/two-truths');

  return json_build_object(
    'correct', v_correct,
    'lie_index', v_round.lie_index,
    'guess_index', v_round.guess_index,
    'story', v_round.story
  );
end;
$$;

-- ============================================================
-- Every round of my couple, newest first (latest 100) plus the tally over all
-- of them. lie_index and story are null on a partner's round I haven't
-- guessed yet; nothing from another couple is ever read.
-- ============================================================

create or replace function public.two_truths_list()
returns json
language sql stable security definer set search_path = public as $$
  with me as (
    select auth.uid() as uid, public.get_my_couple_id() as cid
  ),
  r as (
    select t.*,
           coalesce(t.author_id = me.uid, false) as mine,
           coalesce(t.author_id = me.uid, false) or t.guessed_at is not null as revealed
    from public.two_truths_rounds t
    join me on me.uid is not null and t.couple_id = me.cid
  ),
  latest as (
    select * from r order by created_at desc, id desc limit 100
  )
  select json_build_object(
    'rounds', coalesce((
      select json_agg(json_build_object(
        'id', l.id,
        'author_id', l.author_id,
        'mine', l.mine,
        'statements', l.statements,
        'lie_index', case when l.revealed then l.lie_index end,
        'story', case when l.revealed then l.story end,
        'guess_index', l.guess_index,
        'guessed_at', l.guessed_at,
        'correct', case when l.guessed_at is not null then l.guess_index = l.lie_index end,
        'created_at', l.created_at
      ) order by l.created_at desc, l.id desc)
      from latest l), '[]'::json),
    'tally', json_build_object(
      'you', json_build_object(
        'guessed', (select count(*) from r where not r.mine and r.guessed_at is not null),
        'spotted', (select count(*) from r where not r.mine and r.guessed_at is not null and r.guess_index = r.lie_index)
      ),
      'partner', json_build_object(
        'guessed', (select count(*) from r where r.mine and r.guessed_at is not null),
        'spotted', (select count(*) from r where r.mine and r.guessed_at is not null and r.guess_index = r.lie_index)
      )
    )
  )
$$;

-- ============================================================
-- Cancel my own open round (it disappears for both of us).
-- ============================================================

create or replace function public.two_truths_cancel(p_round_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_round public.two_truths_rounds;
begin
  if v_uid is null then
    raise exception 'Log in to play' using errcode = '28000', hint = 'TT_AUTH';
  end if;
  select * into v_round from public.two_truths_rounds where id = p_round_id for update;
  if v_round.id is null or not public.is_couple_member(v_round.couple_id) then
    raise exception 'This round isn''t here anymore' using errcode = 'P0002', hint = 'TT_NOT_FOUND';
  end if;
  if v_round.author_id is distinct from v_uid then
    raise exception 'Only the person who wrote a round can cancel it' using errcode = '42501', hint = 'TT_NOT_AUTHOR';
  end if;
  if v_round.guessed_at is not null then
    raise exception 'This round has already been guessed' using errcode = 'P0001', hint = 'TT_ALREADY_GUESSED';
  end if;
  delete from public.two_truths_rounds where id = v_round.id;
end;
$$;

revoke execute on function public.two_truths_create(text[], int, text) from public, anon;
revoke execute on function public.two_truths_guess(uuid, int) from public, anon;
revoke execute on function public.two_truths_list() from public, anon;
revoke execute on function public.two_truths_cancel(uuid) from public, anon;
grant execute on function public.two_truths_create(text[], int, text) to authenticated, service_role;
grant execute on function public.two_truths_guess(uuid, int) to authenticated, service_role;
grant execute on function public.two_truths_list() to authenticated, service_role;
grant execute on function public.two_truths_cancel(uuid) to authenticated, service_role;
