-- Love Languages (leaf 1.2.1): one quiz result per person.
--
-- The quiz is 20 forced-choice pairs; each option maps to one of five keys
-- (words, time, gifts, acts, touch) and each key appears exactly 8 times
-- across the 40 options. answers[n] is 0 or 1: which option of pair n was
-- picked. scores holds the count per key, so every value is 0..8 and they add
-- up to 20. The database recomputes the scores from the answers and rejects
-- any row where they disagree, so a result can't be made up by hand.
--
-- You read your own result and your current partner's (only one saved into
-- the couple you both belong to now), scores only. You write only your own,
-- only into your own couple, and not once the couple is closed. Retaking
-- overwrites the same row.
-- Checked by scripts/verify/game-love-languages.mjs.

-- Option keys in quiz order: pair n has options 2n-1 (answer 0) and 2n
-- (answer 1). Mirrors PAIRS in src/components/games/love-languages/bank.ts;
-- the verify script fails if the two ever disagree.
create or replace function public.love_language_result_valid(p_scores jsonb, p_answers smallint[])
returns boolean language plpgsql immutable set search_path = public as $$
declare
  v_keys constant text[] := array[
    'words', 'time',   'gifts', 'acts',  'touch', 'words', 'time',  'gifts', 'acts',  'touch',
    'words', 'gifts',  'time',  'acts',  'touch', 'gifts', 'words', 'acts',  'time',  'touch',
    'acts',  'gifts',  'words', 'touch', 'gifts', 'time',  'touch', 'acts',  'time',  'words',
    'gifts', 'touch',  'acts',  'words', 'touch', 'time',  'gifts', 'words', 'acts',  'time'
  ];
  v_all constant text[] := array['words', 'time', 'gifts', 'acts', 'touch'];
  v_counts integer[] := array[0, 0, 0, 0, 0];
  v_key text;
  v_value jsonb;
  v_total integer := 0;
  i integer;
begin
  if p_scores is null or p_answers is null or jsonb_typeof(p_scores) <> 'object' then
    return false;
  end if;
  if array_ndims(p_answers) is distinct from 1
     or array_lower(p_answers, 1) is distinct from 1
     or array_length(p_answers, 1) is distinct from 20 then
    return false;
  end if;

  for i in 1..20 loop
    if p_answers[i] is null or p_answers[i] not in (0, 1) then
      return false;
    end if;
    v_key := v_keys[2 * i - 1 + p_answers[i]];
    v_counts[array_position(v_all, v_key)] := v_counts[array_position(v_all, v_key)] + 1;
  end loop;

  -- Exactly the five keys, each a plain integer 0..8 that matches the answers.
  if (select count(*) from jsonb_object_keys(p_scores)) <> 5 then
    return false;
  end if;
  for i in 1..5 loop
    v_value := p_scores -> v_all[i];
    if v_value is null or jsonb_typeof(v_value) <> 'number' or v_value::text !~ '^[0-8]$' then
      return false;
    end if;
    if v_value::text::integer <> v_counts[i] then
      return false;
    end if;
    v_total := v_total + v_value::text::integer;
  end loop;
  return v_total = 20;
end;
$$;
revoke execute on function public.love_language_result_valid(jsonb, smallint[]) from public, anon;
grant execute on function public.love_language_result_valid(jsonb, smallint[]) to authenticated, service_role;

-- True when the caller belongs to this couple and nobody has left it
-- (couples.closed_at): a closed couple keeps what it has but takes no writes.
create or replace function public.love_language_in_open_couple(p_couple uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.couple_members m
    join public.couples c on c.id = m.couple_id
    where m.couple_id = p_couple and m.profile_id = auth.uid() and c.closed_at is null
  )
$$;
revoke execute on function public.love_language_in_open_couple(uuid) from public, anon;
grant execute on function public.love_language_in_open_couple(uuid) to authenticated, service_role;

create table public.love_language_results (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  couple_id  uuid not null references public.couples(id) on delete cascade,
  scores     jsonb not null,
  answers    smallint[] not null,
  taken_at   timestamptz not null default now(),
  constraint love_language_results_valid check (public.love_language_result_valid(scores, answers))
);
create index love_language_results_couple_idx on public.love_language_results (couple_id);

-- taken_at is always the server's clock, on the first take and every retake.
create or replace function public.love_language_results_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.taken_at := now();
  return new;
end;
$$;
revoke execute on function public.love_language_results_stamp() from public, anon, authenticated;

create trigger love_language_results_stamp
  before insert or update on public.love_language_results
  for each row execute function public.love_language_results_stamp();

-- Least privilege. The individual answers are never readable through the API
-- (not even your own): the partner sees scores, not which option you picked.
-- That rules out INSERT ... ON CONFLICT DO UPDATE (it reads excluded.answers),
-- so the client updates its row and inserts only when there is none yet.
-- profile_id can't be changed by an update. No deletes.
revoke all on public.love_language_results from anon, authenticated;
grant select (profile_id, couple_id, scores, taken_at) on public.love_language_results to authenticated;
grant insert (profile_id, couple_id, scores, answers) on public.love_language_results to authenticated;
grant update (couple_id, scores, answers) on public.love_language_results to authenticated;
grant all on public.love_language_results to service_role;

alter table public.love_language_results enable row level security;

create policy love_language_results_select on public.love_language_results for select to authenticated
  using (
    profile_id = auth.uid()
    or (public.is_couple_member(couple_id) and public.shares_couple_with(profile_id))
  );
create policy love_language_results_insert on public.love_language_results for insert to authenticated
  with check (profile_id = auth.uid() and public.love_language_in_open_couple(couple_id));
create policy love_language_results_update on public.love_language_results for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and public.love_language_in_open_couple(couple_id));

-- Live update for the "Waiting for {partner}" screen.
alter publication supabase_realtime add table public.love_language_results;
