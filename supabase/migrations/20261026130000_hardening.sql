-- Security + integrity hardening from the 2026-10-26 audit.
-- Finding ids (F<n>) refer to the audit ledger.

-- ============================================================
-- Couples: no more open listing; create/join only through RPCs (F1, F3, F7, F21)
-- ============================================================

drop policy if exists couples_select on public.couples;
drop policy if exists couples_insert on public.couples;
create policy couples_select on public.couples for select to authenticated
  using (public.is_couple_member(id) or public.is_admin());

drop policy if exists couple_members_insert on public.couple_members;

-- One couple per person. Every page looks the couple up with .single().
create unique index if not exists couple_members_one_couple_per_profile
  on public.couple_members (profile_id);

create or replace function public.enforce_couple_size()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Lock the couple so two concurrent joins can't both see one member.
  perform 1 from public.couples where id = new.couple_id for update;
  if (select count(*) from public.couple_members where couple_id = new.couple_id) >= 2 then
    raise exception 'Pasangan ini sudah penuh' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Returns the caller's couple, creating it (with a fresh invite code) if needed.
create or replace function public.create_couple()
returns public.couples
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_couple public.couples;
  v_code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_uid is null then
    raise exception 'Kamu belum masuk' using errcode = '28000';
  end if;

  select c.* into v_couple
  from public.couples c join public.couple_members m on m.couple_id = c.id
  where m.profile_id = v_uid;
  if found then
    return v_couple;
  end if;

  for attempt in 1..5 loop
    select string_agg(substr(alphabet, 1 + (get_byte(b, i) % 32), 1), '')
      into v_code
      from (select extensions.gen_random_bytes(8) as b) r, generate_series(0, 7) i;
    insert into public.couples (created_by, invite_code)
    values (v_uid, v_code)
    on conflict (invite_code) do nothing
    returning * into v_couple;
    exit when found;
  end loop;
  if v_couple.id is null then
    raise exception 'Gagal membuat kode undangan, coba lagi';
  end if;

  insert into public.couple_members (couple_id, profile_id) values (v_couple.id, v_uid);
  return v_couple;
end;
$$;

-- Joins the couple behind an invite code. A caller who is alone in their own
-- couple leaves (and deletes) it only after the target is known to have room.
create or replace function public.join_couple(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_current uuid;
begin
  if v_uid is null then
    raise exception 'Kamu belum masuk' using errcode = '28000';
  end if;

  select id into v_target from public.couples
  where invite_code = upper(btrim(coalesce(p_code, '')))
  for update;
  if v_target is null then
    raise exception 'Kode undangan tidak ditemukan';
  end if;

  if exists (select 1 from public.couple_members where couple_id = v_target and profile_id = v_uid) then
    return v_target;
  end if;

  if (select count(*) from public.couple_members where couple_id = v_target) >= 2 then
    raise exception 'Pasangan ini sudah penuh';
  end if;

  select couple_id into v_current from public.couple_members where profile_id = v_uid;
  if v_current is not null then
    if (select count(*) from public.couple_members where couple_id = v_current) > 1 then
      raise exception 'Kamu sudah terhubung dengan pasangan lain';
    end if;
    delete from public.couples where id = v_current;
  end if;

  insert into public.couple_members (couple_id, profile_id) values (v_target, v_uid);
  return v_target;
end;
$$;

grant execute on function public.create_couple(), public.join_couple(text) to authenticated;

-- ============================================================
-- Letters: content only through read_letter() once unlocked (F57)
-- ============================================================

drop policy if exists letters_member_all on public.letters;

revoke select on public.letters from authenticated;
grant select (id, couple_id, sender_id, receiver_id, photo_url, occasion, occasion_label,
              unlock_date, is_opened, opened_at, created_at)
  on public.letters to authenticated;

create policy letters_select on public.letters for select to authenticated
  using (public.is_couple_member(couple_id));
create policy letters_insert on public.letters for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_couple_member(couple_id)
    and receiver_id <> sender_id
    and public.shares_couple_with(receiver_id)
  );
-- No update/delete: a sealed letter can't be edited or re-dated.

create or replace function public.read_letter(p_letter_id uuid)
returns table (id uuid, content text, is_opened boolean, opened_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_letter public.letters;
begin
  select * into v_letter from public.letters l where l.id = p_letter_id;
  if not found or not public.is_couple_member(v_letter.couple_id) then
    raise exception 'Surat tidak ditemukan';
  end if;
  if v_letter.sender_id <> auth.uid() and v_letter.unlock_date > now() then
    raise exception 'Surat ini masih terkunci';
  end if;
  if v_letter.receiver_id = auth.uid() and not coalesce(v_letter.is_opened, false) then
    update public.letters set is_opened = true, opened_at = now()
    where letters.id = p_letter_id
    returning * into v_letter;
  end if;
  return query select v_letter.id, v_letter.content, v_letter.is_opened, v_letter.opened_at;
end;
$$;
grant execute on function public.read_letter(uuid) to authenticated;

-- ============================================================
-- Writer columns must be the caller (integrity)
-- ============================================================

drop policy if exists miss_you_member_all on public.miss_you;
create policy miss_you_select on public.miss_you for select to authenticated
  using (public.is_couple_member(couple_id));
create policy miss_you_insert on public.miss_you for insert to authenticated
  with check (public.is_couple_member(couple_id) and sender_id = auth.uid());
create policy miss_you_respond on public.miss_you for update to authenticated
  using (public.is_couple_member(couple_id) and receiver_id = auth.uid())
  with check (public.is_couple_member(couple_id) and receiver_id = auth.uid());

drop policy if exists couple_transactions_member_all on public.couple_transactions;
create policy couple_transactions_select on public.couple_transactions for select to authenticated
  using (public.is_couple_member(couple_id));
create policy couple_transactions_insert on public.couple_transactions for insert to authenticated
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy couple_transactions_modify on public.couple_transactions for update to authenticated
  using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
create policy couple_transactions_delete on public.couple_transactions for delete to authenticated
  using (public.is_couple_member(couple_id));

drop policy if exists pet_care_logs_member_all on public.pet_care_logs;
create policy pet_care_logs_select on public.pet_care_logs for select to authenticated
  using (exists (select 1 from public.couple_pets p where p.id = pet_id and public.is_couple_member(p.couple_id)));
create policy pet_care_logs_insert on public.pet_care_logs for insert to authenticated
  with check (done_by = auth.uid()
    and exists (select 1 from public.couple_pets p where p.id = pet_id and public.is_couple_member(p.couple_id)));

-- ============================================================
-- Daily answers: partner's answer only after you've answered (F80)
-- ============================================================

create or replace function public.has_answered_daily(p_couple uuid, p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.daily_responses
    where couple_id = p_couple and profile_id = auth.uid() and answered_date = p_date
  )
$$;
grant execute on function public.has_answered_daily(uuid, date) to authenticated;

drop policy if exists daily_responses_member_all on public.daily_responses;
create policy daily_responses_select on public.daily_responses for select to authenticated
  using (
    profile_id = auth.uid()
    or (public.is_couple_member(couple_id) and public.has_answered_daily(couple_id, answered_date))
  );
create policy daily_responses_write_own on public.daily_responses for insert to authenticated
  with check (profile_id = auth.uid() and public.is_couple_member(couple_id));
create policy daily_responses_update_own on public.daily_responses for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid() and public.is_couple_member(couple_id));

-- ============================================================
-- AI daily questions: read-only for users; written by the API with the
-- service role, one claim per couple per day (F23)
-- ============================================================

drop policy if exists ai_daily_questions_member_all on public.ai_daily_questions;
create policy ai_daily_questions_select on public.ai_daily_questions for select to authenticated
  using (public.is_couple_member(couple_id));
revoke insert, update, delete on public.ai_daily_questions from authenticated;
-- question is filled after the claim succeeds
alter table public.ai_daily_questions alter column question drop not null;

-- ============================================================
-- Savings balance maintained by the database (F58, F59, F62)
-- current_amount = sum of the goal's signed transactions (withdrawals < 0)
-- ============================================================

create or replace function public.sync_goal_balance()
returns trigger language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  foreach gid in array array[
    case when tg_op <> 'INSERT' then old.goal_id end,
    case when tg_op <> 'DELETE' then new.goal_id end
  ] loop
    if gid is not null then
      update public.savings_goals
      set current_amount = coalesce((select sum(amount) from public.couple_transactions where goal_id = gid), 0)
      where id = gid;
    end if;
  end loop;
  return null;
end;
$$;

create trigger couple_transactions_sync_goal
  after insert or update or delete on public.couple_transactions
  for each row execute function public.sync_goal_balance();

-- ============================================================
-- One pet per couple, one mood row per pet (F64)
-- ============================================================

create unique index if not exists couple_pets_one_per_couple on public.couple_pets (couple_id);
create unique index if not exists pet_mood_state_one_per_pet on public.pet_mood_state (pet_id);

-- ============================================================
-- Samakan: at most one open session per couple (F30, F41)
-- ============================================================

create unique index if not exists game_sessions_one_open_per_couple
  on public.game_sessions (couple_id) where status in ('waiting', 'playing');

-- ============================================================
-- Deep Talk: premium gate in the database (F48) + atomic completion (F45, F49, F50)
-- ============================================================

create or replace function public.my_couple_is_premium()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select c.is_premium from public.couples c
    join public.couple_members m on m.couple_id = c.id
    where m.profile_id = auth.uid()
  ), false)
$$;
grant execute on function public.my_couple_is_premium() to authenticated;

drop policy if exists deep_talk_questions_read on public.deep_talk_questions;
create policy deep_talk_questions_read on public.deep_talk_questions for select to authenticated
  using (
    public.is_admin()
    or public.my_couple_is_premium()
    or exists (select 1 from public.deep_talk_levels l where l.id = level_id and l.level_number = 1)
  );

-- Adds a level to completed_levels without a read-modify-write race and
-- returns true only the first time that level is completed.
create or replace function public.complete_deep_talk_level(p_pack_id uuid, p_level_number integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid := public.get_my_couple_id();
  v_before integer[];
  v_after integer[];
  v_playable integer[];
begin
  if v_couple is null then
    raise exception 'Kamu belum punya pasangan';
  end if;

  select completed_levels into v_before from public.deep_talk_progress
  where couple_id = v_couple and pack_id = p_pack_id
  for update;

  v_after := (
    select array_agg(distinct x order by x)
    from unnest(coalesce(v_before, '{}') || p_level_number) x
  );
  v_playable := (
    select coalesce(array_agg(level_number order by level_number), '{}')
    from public.deep_talk_levels
    where pack_id = p_pack_id and coalesce(question_count, 0) > 0
  );

  insert into public.deep_talk_progress
    (couple_id, pack_id, level_number, current_question_index, completed_levels, is_completed, last_played_at)
  values
    (v_couple, p_pack_id, p_level_number, 0, v_after, v_playable <@ v_after, now())
  on conflict (couple_id, pack_id) do update
    set completed_levels = excluded.completed_levels,
        is_completed = excluded.is_completed,
        last_played_at = now();

  return not (p_level_number = any (coalesce(v_before, '{}')));
end;
$$;
grant execute on function public.complete_deep_talk_level(uuid, integer) to authenticated;

-- ============================================================
-- Push subscriptions: one owner per browser endpoint (F28)
-- ============================================================

alter table public.push_subscriptions drop constraint if exists push_subscriptions_profile_id_endpoint_key;
create unique index if not exists push_subscriptions_endpoint_key on public.push_subscriptions (endpoint);

-- Moves an endpoint to the caller (a shared device switching accounts).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth_key text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Kamu belum masuk' using errcode = '28000';
  end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth_key)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth_key)
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id,
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        created_at = now();
end;
$$;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
