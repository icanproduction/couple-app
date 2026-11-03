-- Fixes from the v0.6 review (2026-10-27). Ids (R…) match .unlazy/FINDINGS-v06.md.

-- ============================================================
-- R1: a couple someone left is closed for good. The remaining partner keeps
-- the archive, but nobody new can join it and read the old relationship
-- (letters, moments, moods). A new relationship starts in a new couple.
-- ============================================================

alter table public.couples add column closed_at timestamptz;

create or replace function public.leave_couple()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_couple uuid;
  v_left integer;
begin
  if v_uid is null then
    raise exception 'Kamu belum masuk' using errcode = '28000';
  end if;
  select couple_id into v_couple from public.couple_members where profile_id = v_uid;
  if v_couple is null then
    raise exception 'Kamu belum punya pasangan';
  end if;
  perform 1 from public.couples where id = v_couple for update;

  -- The leaver's own test results go with them, not with the archive.
  update public.assessment_results set couple_id = null where profile_id = v_uid and couple_id = v_couple;
  update public.mbti_results set couple_id = null where profile_id = v_uid and couple_id = v_couple;
  update public.spending_results set couple_id = null where profile_id = v_uid and couple_id = v_couple;
  delete from public.pet_care_roles where couple_id = v_couple and profile_id = v_uid;
  delete from public.couple_members where couple_id = v_couple and profile_id = v_uid;

  select count(*) into v_left from public.couple_members where couple_id = v_couple;
  if v_left = 0 then
    delete from public.couples where id = v_couple;
    return jsonb_build_object('couple_id', v_couple, 'deleted', true);
  end if;

  update public.couples
  set closed_at = now(), invite_expires_at = now()
  where id = v_couple;
  insert into public.activities (couple_id, actor_id, kind, summary, url)
  values (v_couple, v_uid, 'left', 'keluar dari pasangan ini', '/app/profile');
  return jsonb_build_object('couple_id', v_couple, 'deleted', false);
end;
$$;

create or replace function public.regenerate_invite_code()
returns public.couples
language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid := public.get_my_couple_id();
  v_row public.couples;
begin
  if v_couple is null then
    raise exception 'Kamu belum punya pasangan';
  end if;
  select * into v_row from public.couples where id = v_couple for update;
  if v_row.closed_at is not null then
    raise exception 'Ruang ini sudah ditutup karena pasanganmu keluar. Mulai ruang baru untuk mengundang orang lain.';
  end if;
  if (select count(*) from public.couple_members where couple_id = v_couple) >= 2 then
    raise exception 'Pasanganmu sudah terhubung, kode undangan tidak diperlukan lagi';
  end if;
  update public.couples
  set invite_code = public.generate_invite_code(), invite_expires_at = now() + interval '7 days'
  where id = v_couple
  returning * into v_row;
  return v_row;
end;
$$;

-- create_couple: never hand out a fresh code for a closed couple.
create or replace function public.create_couple()
returns public.couples
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_couple public.couples;
begin
  if v_uid is null then
    raise exception 'Kamu belum masuk' using errcode = '28000';
  end if;

  select c.* into v_couple
  from public.couples c join public.couple_members m on m.couple_id = c.id
  where m.profile_id = v_uid
  for update of c;
  if found then
    if v_couple.closed_at is null
       and v_couple.invite_expires_at < now()
       and (select count(*) from public.couple_members where couple_id = v_couple.id) < 2 then
      update public.couples
      set invite_code = public.generate_invite_code(), invite_expires_at = now() + interval '7 days'
      where id = v_couple.id
      returning * into v_couple;
    end if;
    return v_couple;
  end if;

  for attempt in 1..5 loop
    insert into public.couples (created_by, invite_code)
    values (v_uid, public.generate_invite_code())
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

-- ============================================================
-- R3 + R7: joining no longer silently wipes a couple that holds memories, and
-- both couples are locked in id order so two crossing joins can't lose one.
-- Callers get hint COUPLE_HAS_DATA and must retry with p_discard => true
-- (through /api/couple/join, which also removes the old couple's photos).
-- ============================================================

drop function if exists public.join_couple(text);

create or replace function public.couple_has_data(p_couple uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.couples where id = p_couple and closed_at is not null)
      or exists (select 1 from public.moments where couple_id = p_couple)
      or exists (select 1 from public.letters where couple_id = p_couple)
      or exists (select 1 from public.savings_goals where couple_id = p_couple)
      or exists (select 1 from public.couple_transactions where couple_id = p_couple)
      or exists (select 1 from public.bucket_items where couple_id = p_couple)
      or exists (select 1 from public.mood_checkins where couple_id = p_couple)
      or exists (select 1 from public.daily_responses where couple_id = p_couple)
      or exists (select 1 from public.gratitude_notes where couple_id = p_couple)
      or exists (select 1 from public.couple_pets where couple_id = p_couple)
      or exists (select 1 from public.wishlist_items where couple_id = p_couple)
      or exists (select 1 from public.wedding_budget_items where couple_id = p_couple)
$$;
revoke execute on function public.couple_has_data(uuid) from public, anon, authenticated;

create or replace function public.join_couple(p_code text, p_discard boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_target public.couples;
  v_current uuid;
begin
  if v_uid is null then
    raise exception 'Kamu belum masuk' using errcode = '28000';
  end if;

  select * into v_target from public.couples
  where invite_code = upper(btrim(coalesce(p_code, '')));
  if v_target.id is null then
    raise exception 'Kode undangan tidak ditemukan';
  end if;

  select couple_id into v_current from public.couple_members where profile_id = v_uid;
  if v_current = v_target.id then
    return v_target.id;
  end if;

  -- Lock both couples in a fixed order, then re-read under the lock.
  perform 1 from public.couples
  where id in (v_target.id, coalesce(v_current, v_target.id))
  order by id
  for update;
  select * into v_target from public.couples where id = v_target.id;
  select couple_id into v_current from public.couple_members where profile_id = v_uid;

  if v_target.closed_at is not null then
    raise exception 'Kode ini sudah tidak berlaku karena ruang pasangannya sudah ditutup';
  end if;
  if (select count(*) from public.couple_members where couple_id = v_target.id) >= 2 then
    raise exception 'Pasangan ini sudah penuh';
  end if;
  if v_target.invite_expires_at < now() then
    raise exception 'Kode undangan sudah kedaluwarsa. Minta pasanganmu membuat kode baru.';
  end if;

  if v_current is not null then
    if (select count(*) from public.couple_members where couple_id = v_current) > 1 then
      raise exception 'Kamu sudah terhubung dengan pasangan lain';
    end if;
    if not p_discard and public.couple_has_data(v_current) then
      raise exception 'Ruang pasanganmu yang sekarang masih menyimpan kenangan. Bergabung akan menghapus semuanya.'
        using hint = 'COUPLE_HAS_DATA';
    end if;
    delete from public.couples where id = v_current;
  end if;

  insert into public.couple_members (couple_id, profile_id) values (v_target.id, v_uid);
  return v_target.id;
end;
$$;
grant execute on function public.join_couple(text, boolean) to authenticated;

-- ============================================================
-- R1: letters are readable only by their sender and receiver
-- ============================================================

drop policy if exists letters_select on public.letters;
create policy letters_select on public.letters for select to authenticated
  using (public.is_couple_member(couple_id) and (sender_id = auth.uid() or receiver_id = auth.uid()));

create or replace function public.read_letter(p_letter_id uuid)
returns table (id uuid, content text, is_opened boolean, opened_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_letter public.letters;
begin
  select * into v_letter from public.letters l where l.id = p_letter_id;
  if not found or not public.is_couple_member(v_letter.couple_id)
     or auth.uid() not in (v_letter.sender_id, v_letter.receiver_id) then
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

-- ============================================================
-- R1: spending results belong to their owner (the partner can read, not write)
-- ============================================================

alter table public.spending_results alter column couple_id drop not null;
drop policy if exists spending_results_member_all on public.spending_results;
create policy spending_results_select on public.spending_results for select to authenticated
  using (profile_id = auth.uid() or public.is_couple_member(couple_id));
create policy spending_results_write_own on public.spending_results for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and (couple_id is null or public.is_couple_member(couple_id)));

-- ============================================================
-- R2: a transaction / savings entry must point at a goal of the same couple
-- ============================================================

drop policy if exists couple_transactions_insert on public.couple_transactions;
create policy couple_transactions_insert on public.couple_transactions for insert to authenticated
  with check (
    public.is_couple_member(couple_id) and created_by = auth.uid()
    and (goal_id is null or exists (
      select 1 from public.savings_goals g where g.id = goal_id and g.couple_id = couple_transactions.couple_id))
  );

drop policy if exists savings_entries_member_all on public.savings_entries;
create policy savings_entries_member_all on public.savings_entries for all to authenticated
  using (public.is_couple_member(couple_id))
  with check (
    public.is_couple_member(couple_id)
    and exists (select 1 from public.savings_goals g where g.id = goal_id and g.couple_id = savings_entries.couple_id)
  );

-- Deleting a goal takes its history with it in one statement (was two client
-- calls that could half-fail).
alter table public.couple_transactions drop constraint couple_transactions_goal_id_fkey;
alter table public.couple_transactions add constraint couple_transactions_goal_id_fkey
  foreign key (goal_id) references public.savings_goals(id) on delete cascade;

-- ============================================================
-- R4: couples and memberships change only through the RPCs
-- ============================================================

drop policy if exists couples_delete on public.couples;
drop policy if exists couple_members_delete on public.couple_members;

-- ============================================================
-- R8: deleting something also removes its lines from the activity feed
-- ============================================================

create or replace function public.forget_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.activities where couple_id = old.couple_id and ref_id = old.id;
  return null;
end;
$$;

create trigger moments_forget_activity after delete on public.moments
  for each row execute function public.forget_activity();
create trigger bucket_items_forget_activity after delete on public.bucket_items
  for each row execute function public.forget_activity();
create trigger couple_events_forget_activity after delete on public.couple_events
  for each row execute function public.forget_activity();
create trigger couple_transactions_forget_activity after delete on public.couple_transactions
  for each row execute function public.forget_activity();
create trigger gratitude_notes_forget_activity after delete on public.gratitude_notes
  for each row execute function public.forget_activity();
create trigger letters_forget_activity after delete on public.letters
  for each row execute function public.forget_activity();
create trigger mood_checkins_forget_activity after delete on public.mood_checkins
  for each row execute function public.forget_activity();

-- ============================================================
-- R9: a generation that died mid-way stops holding a quota slot after 5 min
-- ============================================================

create or replace function public.claim_date_idea_run(p_couple uuid, p_profile uuid, p_input jsonb, p_limit integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_day_start timestamptz := ((now() at time zone 'Asia/Jakarta')::date)::timestamp at time zone 'Asia/Jakarta';
begin
  perform 1 from public.couples where id = p_couple for update;
  if (select count(*) from public.ai_date_idea_runs
      where couple_id = p_couple and created_at >= v_day_start
        and (status = 'done' or (status = 'pending' and created_at > now() - interval '5 minutes'))) >= p_limit then
    return null;
  end if;
  insert into public.ai_date_idea_runs (couple_id, profile_id, input)
  values (p_couple, p_profile, coalesce(p_input, '{}'))
  returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================
-- R10: deleting an account keeps the partner's game history and pet log
-- ============================================================

alter table public.game_sessions alter column created_by drop not null;
alter table public.game_sessions drop constraint game_sessions_created_by_fkey;
alter table public.game_sessions add constraint game_sessions_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.pet_care_logs alter column done_by drop not null;
alter table public.pet_care_logs drop constraint pet_care_logs_done_by_fkey;
alter table public.pet_care_logs add constraint pet_care_logs_done_by_fkey
  foreign key (done_by) references public.profiles(id) on delete set null;

-- ============================================================
-- R12: realtime DELETE events carry only the primary key; give reactions a
-- surrogate id so they don't broadcast (moment_id, profile_id) to everyone.
-- ============================================================

alter table public.moment_reactions drop constraint moment_reactions_pkey;
alter table public.moment_reactions add column id uuid not null default gen_random_uuid();
alter table public.moment_reactions add primary key (id);
alter table public.moment_reactions add constraint moment_reactions_one_per_person unique (moment_id, profile_id);
