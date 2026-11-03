-- Game rules the client used to be trusted with (audit F63 + leaf D requests).

-- ============================================================
-- Pet care: one server-side action (cooldown, role, decay, XP)
-- ============================================================

-- One role row per member per pet (ensureCareRoles already merges duplicates).
delete from public.pet_care_roles r
using public.pet_care_roles keep
where r.pet_id = keep.pet_id and r.profile_id = keep.profile_id and r.id > keep.id;
create unique index if not exists pet_care_roles_one_per_member
  on public.pet_care_roles (pet_id, profile_id);

-- Single source of the numbers; scripts/verify/pet-rules.mjs checks that
-- src/types/pet.ts and src/lib/pet.ts still match it.
create or replace function public.pet_care_rules()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'decay_per_hour', 1.25,
    'xp_per_action', 10,
    'xp_per_level', 100,
    'actions', jsonb_build_object(
      'feed',   jsonb_build_object('stat', 'hunger',      'restore', 40, 'cooldown_minutes', 240),
      'play',   jsonb_build_object('stat', 'happiness',   'restore', 30, 'cooldown_minutes', 120),
      'bath',   jsonb_build_object('stat', 'cleanliness', 'restore', 50, 'cooldown_minutes', 360),
      'treat',  jsonb_build_object('stat', 'hunger',      'restore', 15, 'cooldown_minutes', 60),
      'walk',   jsonb_build_object('stat', 'happiness',   'restore', 15, 'cooldown_minutes', 60),
      'cuddle', jsonb_build_object('stat', 'happiness',   'restore', 15, 'cooldown_minutes', 60)
    )
  )
$$;

create or replace function public.pet_mood_of(h integer, ha integer, c integer)
returns text language sql immutable as $$
  select case
    when (h + ha + c) / 3.0 >= 80 then 'thriving'
    when (h + ha + c) / 3.0 >= 60 then 'happy'
    when (h + ha + c) / 3.0 >= 40 then 'neutral'
    when (h + ha + c) / 3.0 >= 20 then 'lonely'
    else 'sad'
  end
$$;

create or replace function public.perform_pet_care(p_pet_id uuid, p_action text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_rules jsonb := public.pet_care_rules();
  v_rule jsonb := v_rules -> 'actions' -> p_action;
  v_pet public.couple_pets;
  v_mood public.pet_mood_state;
  v_last timestamptz;
  v_decay integer;
  h integer; ha integer; c integer;
  v_before text; v_after text;
  v_stat text;
  v_restore integer;
begin
  if v_rule is null then
    raise exception 'Aksi perawatan tidak dikenal';
  end if;
  v_stat := v_rule ->> 'stat';
  v_restore := (v_rule ->> 'restore')::integer;

  -- Lock the pet: serialises two taps / two devices.
  select * into v_pet from public.couple_pets where id = p_pet_id for update;
  if not found or not public.is_couple_member(v_pet.couple_id) then
    raise exception 'Pet tidak ditemukan';
  end if;

  -- Role: members with role rows may only do their own actions.
  if exists (select 1 from public.pet_care_roles where pet_id = p_pet_id and profile_id = v_uid)
     and not exists (
       select 1 from public.pet_care_roles
       where pet_id = p_pet_id and profile_id = v_uid and p_action = any (actions)
     ) then
    raise exception 'Ini tugas pasanganmu';
  end if;

  select max(done_at) into v_last
  from public.pet_care_logs where pet_id = p_pet_id and action_type = p_action;
  if v_last is not null
     and v_last + make_interval(mins => (v_rule ->> 'cooldown_minutes')::integer) > now() then
    raise exception 'Masih cooldown, coba lagi nanti';
  end if;

  select * into v_mood from public.pet_mood_state where pet_id = p_pet_id for update;
  if not found then
    insert into public.pet_mood_state (pet_id) values (p_pet_id) returning * into v_mood;
  end if;

  v_decay := greatest(0, floor(
    extract(epoch from (now() - coalesce(v_mood.updated_at, now()))) / 3600
    * (v_rules ->> 'decay_per_hour')::numeric
  ))::integer;
  h  := greatest(0, v_mood.hunger - v_decay);
  ha := greatest(0, v_mood.happiness - v_decay);
  c  := greatest(0, v_mood.cleanliness - v_decay);
  v_before := public.pet_mood_of(h, ha, c);

  if v_stat = 'hunger' then h := least(100, h + v_restore);
  elsif v_stat = 'happiness' then ha := least(100, ha + v_restore);
  else c := least(100, c + v_restore);
  end if;
  v_after := public.pet_mood_of(h, ha, c);

  update public.pet_mood_state set
    hunger = h, happiness = ha, cleanliness = c, mood = v_after,
    thriving_since = case
      when v_after <> 'thriving' then null
      when v_before = 'thriving' and v_mood.thriving_since is not null then v_mood.thriving_since
      else now()
    end,
    updated_at = now()
  where id = v_mood.id;

  insert into public.pet_care_logs (pet_id, action_type, done_by) values (p_pet_id, p_action, v_uid);

  update public.couple_pets set
    xp = xp + (v_rules ->> 'xp_per_action')::integer,
    level = (xp + (v_rules ->> 'xp_per_action')::integer) / (v_rules ->> 'xp_per_level')::integer + 1
  where id = p_pet_id;

  return jsonb_build_object('hunger', h, 'happiness', ha, 'cleanliness', c, 'mood', v_after);
end;
$$;
grant execute on function public.perform_pet_care(uuid, text), public.pet_care_rules() to authenticated;

-- Stats, XP and logs change only through perform_pet_care.
revoke update on public.pet_mood_state from authenticated;
revoke insert on public.pet_mood_state from authenticated;
grant insert (pet_id, updated_at) on public.pet_mood_state to authenticated;  -- defaults only
revoke insert on public.pet_care_logs from authenticated;
revoke update on public.couple_pets from authenticated;
grant update (name) on public.couple_pets to authenticated;

-- ============================================================
-- Kangen: 30-minute cooldown, 10 per Jakarta day (MissYouButton)
-- ============================================================

create or replace function public.enforce_kangen_limits()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
begin
  if exists (
    select 1 from public.miss_you
    where sender_id = new.sender_id and created_at > now() - interval '30 minutes'
  ) then
    raise exception 'Tunggu sebentar sebelum kirim kangen lagi';
  end if;
  if (select count(*) from public.miss_you where sender_id = new.sender_id and created_at >= v_day_start) >= 10 then
    raise exception 'Kangen hari ini sudah habis, coba lagi besok';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger miss_you_limits
  before insert on public.miss_you
  for each row execute function public.enforce_kangen_limits();

-- ============================================================
-- Savings: no withdrawal below zero; opening balances become transactions
-- ============================================================

create or replace function public.prevent_goal_overdraw()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.goal_id is not null and new.amount < 0 then
    perform 1 from public.savings_goals where id = new.goal_id for update;
    if coalesce((select sum(amount) from public.couple_transactions where goal_id = new.goal_id), 0) + new.amount < 0 then
      raise exception 'Saldo tabungan tidak cukup';
    end if;
  end if;
  return new;
end;
$$;

create trigger couple_transactions_no_overdraw
  before insert on public.couple_transactions
  for each row execute function public.prevent_goal_overdraw();

-- Goals created before the balance trigger kept their opening amount only in
-- current_amount; record it as a deposit so the next transaction keeps it.
insert into public.couple_transactions (couple_id, goal_id, amount, type, category, note, created_by)
select g.couple_id, g.id, g.current_amount - coalesce(s.total, 0), 'deposit', 'tabungan', 'Saldo awal', c.created_by
from public.savings_goals g
join public.couples c on c.id = g.couple_id
left join (select goal_id, sum(amount) as total from public.couple_transactions group by goal_id) s on s.goal_id = g.id
where g.current_amount - coalesce(s.total, 0) > 0;
