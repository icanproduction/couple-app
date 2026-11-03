-- v0.6 features (2026-10-27): schema for the 25 new features.
-- Feature ids (F01–F25) match .unlazy/FEATURES.md; UI lives in src/.

-- ============================================================
-- Shared data survives one partner leaving or deleting their account (F01, F02)
-- Before this, deleting the couple's creator cascaded the whole couple away,
-- and deleting any account removed that person's savings transactions (which
-- silently changed the shared balance).
-- ============================================================

alter table public.couples alter column created_by drop not null;
alter table public.couples drop constraint couples_created_by_fkey;
alter table public.couples add constraint couples_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.couple_transactions alter column created_by drop not null;
alter table public.couple_transactions drop constraint couple_transactions_created_by_fkey;
alter table public.couple_transactions add constraint couple_transactions_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- ============================================================
-- Invite codes expire after 7 days and can be renewed (F03)
-- ============================================================

alter table public.couples add column invite_expires_at timestamptz;
update public.couples set invite_expires_at = now() + interval '7 days';
alter table public.couples alter column invite_expires_at set default now() + interval '7 days';
alter table public.couples alter column invite_expires_at set not null;

-- Internal: a fresh 8-character code nobody else holds.
create or replace function public.generate_invite_code()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  for attempt in 1..10 loop
    select string_agg(substr(alphabet, 1 + (get_byte(b, i) % 32), 1), '')
      into v_code
      from (select extensions.gen_random_bytes(8) as b) r, generate_series(0, 7) i;
    if not exists (select 1 from public.couples where invite_code = v_code) then
      return v_code;
    end if;
  end loop;
  raise exception 'Gagal membuat kode undangan, coba lagi';
end;
$$;
revoke execute on function public.generate_invite_code() from public, anon, authenticated;

-- Returns the caller's couple, creating it if needed. A waiting (one-member)
-- couple whose code has expired gets a fresh code on the way out.
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
    if v_couple.invite_expires_at < now()
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

create or replace function public.join_couple(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_expires timestamptz;
  v_current uuid;
begin
  if v_uid is null then
    raise exception 'Kamu belum masuk' using errcode = '28000';
  end if;

  select id, invite_expires_at into v_target, v_expires from public.couples
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

  if v_expires < now() then
    raise exception 'Kode undangan sudah kedaluwarsa. Minta pasanganmu membuat kode baru.';
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

-- New code + 7 more days, only while still waiting for a partner.
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
  perform 1 from public.couples where id = v_couple for update;
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
grant execute on function public.regenerate_invite_code() to authenticated;

-- ============================================================
-- Activity feed (F23): written only by triggers, read by both partners.
-- Narrow "light history" variant of the append-only audit pattern: summary
-- never contains private content (letter text, gratitude text, answers).
-- ============================================================

create table public.activities (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  kind       text not null,
  ref_id     uuid,
  summary    text not null,
  url        text,
  created_at timestamptz not null default now()
);
create index activities_couple_created_idx on public.activities (couple_id, created_at desc);

create table public.activity_reads (
  profile_id   uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

grant select on public.activities to authenticated;
grant select, insert, update on public.activity_reads to authenticated;
grant all on public.activities, public.activity_reads to service_role;
alter table public.activities enable row level security;
alter table public.activity_reads enable row level security;
create policy activities_select on public.activities for select to authenticated
  using (public.is_couple_member(couple_id));
create policy activity_reads_own on public.activity_reads for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ============================================================
-- Leave couple (F01). Data stays with the couple; the remaining partner gets
-- a new invite code. The last member leaving deletes the couple (the API
-- route then removes its storage folder).
-- ============================================================

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

  delete from public.pet_care_roles where couple_id = v_couple and profile_id = v_uid;
  delete from public.couple_members where couple_id = v_couple and profile_id = v_uid;

  select count(*) into v_left from public.couple_members where couple_id = v_couple;
  if v_left = 0 then
    delete from public.couples where id = v_couple;
    return jsonb_build_object('couple_id', v_couple, 'deleted', true);
  end if;

  update public.couples
  set invite_code = public.generate_invite_code(), invite_expires_at = now() + interval '7 days'
  where id = v_couple;
  insert into public.activities (couple_id, actor_id, kind, summary, url)
  values (v_couple, v_uid, 'left', 'keluar dari pasangan ini', '/app/profile');
  return jsonb_build_object('couple_id', v_couple, 'deleted', false);
end;
$$;
grant execute on function public.leave_couple() to authenticated;

-- ============================================================
-- Notification preferences + quiet hours (F04). No row = everything on.
-- Hours are Asia/Jakarta; quiet_start > quiet_end wraps past midnight.
-- ============================================================

create table public.notification_prefs (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  kangen      boolean not null default true,
  letters     boolean not null default true,
  moments     boolean not null default true,
  reminders   boolean not null default true,
  activity    boolean not null default true,
  quiet_start smallint check (quiet_start between 0 and 23),
  quiet_end   smallint check (quiet_end between 0 and 23),
  updated_at  timestamptz not null default now(),
  constraint notification_prefs_quiet_pair check ((quiet_start is null) = (quiet_end is null)),
  constraint notification_prefs_quiet_distinct check (quiet_start is null or quiet_start <> quiet_end)
);
grant select, insert, update, delete on public.notification_prefs to authenticated;
grant all on public.notification_prefs to service_role;
alter table public.notification_prefs enable row level security;
create policy notification_prefs_own on public.notification_prefs for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create trigger notification_prefs_touch_updated_at
  before update on public.notification_prefs
  for each row execute function public.touch_updated_at();

-- ============================================================
-- Transactions can be edited and deleted (F06) without breaking the balance
-- ============================================================

-- Who wrote it and which goal it belongs to are fixed after insert.
revoke update on public.couple_transactions from authenticated;
grant update (amount, type, category, note) on public.couple_transactions to authenticated;

-- Deposits are positive, withdrawals negative (the balance trigger sums them).
alter table public.couple_transactions add constraint couple_transactions_sign
  check (type not in ('deposit', 'withdrawal') or ((type = 'deposit') = (amount > 0)));

-- Lock the goal before an edit/delete so concurrent changes are checked in turn…
create or replace function public.lock_goal_for_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.goal_id is not null then
    perform 1 from public.savings_goals where id = old.goal_id for update;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger couple_transactions_lock_goal
  before update or delete on public.couple_transactions
  for each row execute function public.lock_goal_for_change();

-- …and refuse a change that would leave the savings balance below zero.
create or replace function public.check_goal_not_negative()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.goal_id is not null
     and exists (select 1 from public.savings_goals where id = old.goal_id)
     and coalesce((select sum(amount) from public.couple_transactions where goal_id = old.goal_id), 0) < 0 then
    raise exception 'Saldo tabungan jadi minus. Ubah atau hapus penarikannya dulu.';
  end if;
  return null;
end;
$$;
create trigger couple_transactions_not_negative
  after update or delete on public.couple_transactions
  for each row execute function public.check_goal_not_negative();

-- ============================================================
-- Calendar reminders (F09): sent by /api/cron/event-reminders
-- ============================================================

alter table public.couple_events add column remind_days_before smallint
  check (remind_days_before is null or remind_days_before in (0, 1, 3, 7));

create table public.event_reminders_sent (
  event_id        uuid not null references public.couple_events(id) on delete cascade,
  occurrence_date date not null,
  sent_at         timestamptz not null default now(),
  primary key (event_id, occurrence_date)
);
grant all on public.event_reminders_sent to service_role;
alter table public.event_reminders_sent enable row level security;
-- No policies: service role only.

-- ============================================================
-- Moments: favourites (F15), reactions + comments (F14)
-- ============================================================

alter table public.moments add column is_favorite boolean not null default false;

create table public.moment_reactions (
  moment_id  uuid not null references public.moments(id) on delete cascade,
  couple_id  uuid not null references public.couples(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (emoji in ('❤️', '😍', '🥹', '😂', '🔥', '👏')),
  created_at timestamptz not null default now(),
  primary key (moment_id, profile_id)
);

create table public.moment_comments (
  id         uuid primary key default gen_random_uuid(),
  moment_id  uuid not null references public.moments(id) on delete cascade,
  couple_id  uuid not null references public.couples(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index moment_comments_moment_idx on public.moment_comments (moment_id, created_at);

create or replace function public.moment_in_couple(p_moment uuid, p_couple uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.moments where id = p_moment and couple_id = p_couple)
$$;
grant execute on function public.moment_in_couple(uuid, uuid) to authenticated;

grant select, insert, update, delete on public.moment_reactions to authenticated;
grant select, insert, delete on public.moment_comments to authenticated;
grant all on public.moment_reactions, public.moment_comments to service_role;
alter table public.moment_reactions enable row level security;
alter table public.moment_comments enable row level security;

create policy moment_reactions_select on public.moment_reactions for select to authenticated
  using (public.is_couple_member(couple_id));
create policy moment_reactions_insert on public.moment_reactions for insert to authenticated
  with check (profile_id = auth.uid() and public.is_couple_member(couple_id)
              and public.moment_in_couple(moment_id, couple_id));
create policy moment_reactions_update on public.moment_reactions for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and public.is_couple_member(couple_id)
              and public.moment_in_couple(moment_id, couple_id));
create policy moment_reactions_delete on public.moment_reactions for delete to authenticated
  using (profile_id = auth.uid());

create policy moment_comments_select on public.moment_comments for select to authenticated
  using (public.is_couple_member(couple_id));
create policy moment_comments_insert on public.moment_comments for insert to authenticated
  with check (profile_id = auth.uid() and public.is_couple_member(couple_id)
              and public.moment_in_couple(moment_id, couple_id));
create policy moment_comments_delete on public.moment_comments for delete to authenticated
  using (profile_id = auth.uid());

-- ============================================================
-- Mood check-in (F16): one per person per Jakarta day
-- ============================================================

create table public.mood_checkins (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  mood         text not null check (mood in ('senang', 'semangat', 'biasa', 'capek', 'sedih', 'kesal', 'cemas', 'kangen')),
  note         text check (note is null or char_length(note) <= 140),
  checkin_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (profile_id, checkin_date)
);
create index mood_checkins_couple_date_idx on public.mood_checkins (couple_id, checkin_date desc);
grant select, insert, update on public.mood_checkins to authenticated;
grant all on public.mood_checkins to service_role;
alter table public.mood_checkins enable row level security;
create policy mood_checkins_select on public.mood_checkins for select to authenticated
  using (public.is_couple_member(couple_id));
create policy mood_checkins_insert on public.mood_checkins for insert to authenticated
  with check (profile_id = auth.uid() and public.is_couple_member(couple_id));
create policy mood_checkins_update on public.mood_checkins for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid() and public.is_couple_member(couple_id));
create trigger mood_checkins_touch_updated_at
  before update on public.mood_checkins
  for each row execute function public.touch_updated_at();

-- ============================================================
-- Bucket list (F17), fed by hand or by AI date ideas (F21)
-- ============================================================

create table public.bucket_items (
  id             uuid primary key default gen_random_uuid(),
  couple_id      uuid not null references public.couples(id) on delete cascade,
  created_by     uuid references public.profiles(id) on delete set null,
  title          text not null check (char_length(btrim(title)) between 1 and 120),
  note           text check (note is null or char_length(note) <= 500),
  category       text not null default 'lainnya'
                 check (category in ('petualangan', 'kuliner', 'traveling', 'romantis', 'belajar', 'rumah', 'lainnya')),
  source         text not null default 'manual' check (source in ('manual', 'ai')),
  estimated_cost numeric check (estimated_cost is null or estimated_cost >= 0),
  is_done        boolean not null default false,
  done_at        timestamptz,
  moment_id      uuid references public.moments(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index bucket_items_couple_idx on public.bucket_items (couple_id, is_done, created_at desc);
grant select, insert, update, delete on public.bucket_items to authenticated;
grant all on public.bucket_items to service_role;
alter table public.bucket_items enable row level security;
create policy bucket_items_select on public.bucket_items for select to authenticated
  using (public.is_couple_member(couple_id));
create policy bucket_items_insert on public.bucket_items for insert to authenticated
  with check (public.is_couple_member(couple_id) and created_by = auth.uid()
              and (moment_id is null or public.moment_in_couple(moment_id, couple_id)));
create policy bucket_items_update on public.bucket_items for update to authenticated
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id)
              and (moment_id is null or public.moment_in_couple(moment_id, couple_id)));
create policy bucket_items_delete on public.bucket_items for delete to authenticated
  using (public.is_couple_member(couple_id));
create trigger bucket_items_touch_updated_at
  before update on public.bucket_items
  for each row execute function public.touch_updated_at();

-- ============================================================
-- Gratitude jar (F18): notes to your partner, opened one at a time
-- ============================================================

create table public.gratitude_notes (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples(id) on delete cascade,
  from_id    uuid not null references public.profiles(id) on delete cascade,
  to_id      uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 280),
  opened_at  timestamptz,
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);
create index gratitude_notes_to_idx on public.gratitude_notes (to_id, opened_at);
grant select, insert, delete on public.gratitude_notes to authenticated;
grant update (opened_at) on public.gratitude_notes to authenticated;
grant all on public.gratitude_notes to service_role;
alter table public.gratitude_notes enable row level security;
create policy gratitude_notes_select on public.gratitude_notes for select to authenticated
  using (public.is_couple_member(couple_id) and (from_id = auth.uid() or to_id = auth.uid()));
create policy gratitude_notes_insert on public.gratitude_notes for insert to authenticated
  with check (from_id = auth.uid() and public.is_couple_member(couple_id)
              and public.shares_couple_with(to_id) and to_id <> auth.uid());
create policy gratitude_notes_open on public.gratitude_notes for update to authenticated
  using (to_id = auth.uid()) with check (to_id = auth.uid());
create policy gratitude_notes_delete on public.gratitude_notes for delete to authenticated
  using (from_id = auth.uid() and opened_at is null);

-- ============================================================
-- AI date ideas (F21): one row per generation; quota claimed atomically
-- ============================================================

create table public.ai_date_idea_runs (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  input      jsonb not null default '{}',
  ideas      jsonb,
  status     text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  created_at timestamptz not null default now()
);
create index ai_date_idea_runs_couple_idx on public.ai_date_idea_runs (couple_id, created_at desc);
grant select on public.ai_date_idea_runs to authenticated;
grant all on public.ai_date_idea_runs to service_role;
alter table public.ai_date_idea_runs enable row level security;
create policy ai_date_idea_runs_select on public.ai_date_idea_runs for select to authenticated
  using (public.is_couple_member(couple_id));

-- Service role only. Returns the new run id, or null when today's quota
-- (Jakarta day, failed runs excluded) is used up.
create or replace function public.claim_date_idea_run(p_couple uuid, p_profile uuid, p_input jsonb, p_limit integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_day_start timestamptz := ((now() at time zone 'Asia/Jakarta')::date)::timestamp at time zone 'Asia/Jakarta';
begin
  perform 1 from public.couples where id = p_couple for update;
  if (select count(*) from public.ai_date_idea_runs
      where couple_id = p_couple and created_at >= v_day_start and status <> 'failed') >= p_limit then
    return null;
  end if;
  insert into public.ai_date_idea_runs (couple_id, profile_id, input)
  values (p_couple, p_profile, coalesce(p_input, '{}'))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.claim_date_idea_run(uuid, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.claim_date_idea_run(uuid, uuid, jsonb, integer) to service_role;

-- ============================================================
-- Activity triggers (F23). Summaries are written without the actor's name;
-- the UI prefixes "Kamu" or the partner's name.
-- ============================================================

create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_title text;
begin
  case tg_table_name
    when 'moments' then
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.created_by, 'moment', new.id,
              format('menambahkan moment "%s"', left(new.title, 60)), '/app/moments/' || new.id);
    when 'moment_comments' then
      select title into v_title from public.moments where id = new.moment_id;
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.profile_id, 'comment', new.moment_id,
              format('mengomentari moment "%s"', left(coalesce(v_title, ''), 60)), '/app/moments/' || new.moment_id);
    when 'moment_reactions' then
      if tg_op = 'INSERT' then
        select title into v_title from public.moments where id = new.moment_id;
        insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
        values (new.couple_id, new.profile_id, 'reaction', new.moment_id,
                format('memberi %s di moment "%s"', new.emoji, left(coalesce(v_title, ''), 60)), '/app/moments/' || new.moment_id);
      end if;
    when 'mood_checkins' then
      if tg_op = 'INSERT' or new.mood is distinct from old.mood then
        insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
        values (new.couple_id, new.profile_id, 'mood', new.id,
                format('lagi merasa %s hari ini', new.mood), '/app/mood');
      end if;
    when 'bucket_items' then
      if tg_op = 'INSERT' then
        insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
        values (new.couple_id, new.created_by, 'bucket_add', new.id,
                format('menambahkan "%s" ke bucket list', left(new.title, 60)), '/app/bucket-list');
      elsif new.is_done and not old.is_done then
        insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
        values (new.couple_id, auth.uid(), 'bucket_done', new.id,
                format('mencentang "%s" di bucket list', left(new.title, 60)), '/app/bucket-list');
      end if;
    when 'gratitude_notes' then
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.from_id, 'gratitude', new.id,
              'menaruh apresiasi baru di toples', '/app/toples');
    when 'letters' then
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.sender_id, 'letter', new.id,
              'menulis surat rahasia', '/app/letters');
    when 'couple_events' then
      if coalesce(new.event_scope, 'couple') <> 'personal' and new.created_by is not null then
        insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
        values (new.couple_id, new.created_by, 'event', new.id,
                format('menambahkan "%s" ke kalender', left(new.title, 60)), '/app/calendar');
      end if;
    when 'couple_transactions' then
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.created_by, 'saving', new.id,
              case when new.amount >= 0
                then format('menabung Rp %s', replace(to_char(new.amount, 'FM999,999,999,990'), ',', '.'))
                else format('menarik Rp %s dari tabungan', replace(to_char(abs(new.amount), 'FM999,999,999,990'), ',', '.'))
              end, '/app/finance');
    when 'daily_responses' then
      insert into public.activities (couple_id, actor_id, kind, ref_id, summary, url)
      values (new.couple_id, new.profile_id, 'daily', new.id,
              'menjawab pertanyaan hari ini', '/app/home');
    else
      null;
  end case;
  return null;
end;
$$;

create trigger moments_activity after insert on public.moments
  for each row execute function public.log_activity();
create trigger moment_comments_activity after insert on public.moment_comments
  for each row execute function public.log_activity();
create trigger moment_reactions_activity after insert on public.moment_reactions
  for each row execute function public.log_activity();
create trigger mood_checkins_activity after insert or update on public.mood_checkins
  for each row execute function public.log_activity();
create trigger bucket_items_activity after insert or update on public.bucket_items
  for each row execute function public.log_activity();
create trigger gratitude_notes_activity after insert on public.gratitude_notes
  for each row execute function public.log_activity();
create trigger letters_activity after insert on public.letters
  for each row execute function public.log_activity();
create trigger couple_events_activity after insert on public.couple_events
  for each row execute function public.log_activity();
create trigger couple_transactions_activity after insert on public.couple_transactions
  for each row execute function public.log_activity();
create trigger daily_responses_activity after insert on public.daily_responses
  for each row execute function public.log_activity();

-- ============================================================
-- Deep Talk packs can be free with every level open (Deep Talk content pack)
-- ============================================================

alter table public.deep_talk_packs add column is_free boolean not null default false;

drop policy if exists deep_talk_questions_read on public.deep_talk_questions;
create policy deep_talk_questions_read on public.deep_talk_questions for select to authenticated
  using (
    public.is_admin()
    or public.my_couple_is_premium()
    or exists (
      select 1 from public.deep_talk_levels l
      join public.deep_talk_packs p on p.id = l.pack_id
      where l.id = level_id and (l.level_number = 1 or p.is_free)
    )
  );

-- ============================================================
-- Realtime between partners (F24). postgres_changes honours RLS.
-- ============================================================

alter publication supabase_realtime add table
  public.activities,
  public.moments,
  public.moment_comments,
  public.moment_reactions,
  public.mood_checkins,
  public.bucket_items,
  public.gratitude_notes,
  public.couple_events,
  public.couple_transactions,
  public.savings_goals;
