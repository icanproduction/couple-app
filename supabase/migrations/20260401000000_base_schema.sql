-- Base schema for couple-app V2
--
-- Reconstructed 2026-10-26 for local development. The original V2 tables were
-- created directly in the hosted Supabase project (kmyjwklsqshptnspnhvg), which
-- no longer exists, and were never captured as a migration. Source of truth for
-- this file: src/types/database.ts (generated types), upsert onConflict targets
-- in src/, and the RLS model described in FEATURE_KNOWLEDGE_BANK.md section 15.
--
-- couples.is_premium / unlocked_at are added later by
-- 20260604120000_add_premium_tier_to_couples.sql.

create extension if not exists pgcrypto;

-- ============================================================
-- Core: profiles, couples, couple_members
-- ============================================================

create table public.profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  name                    text,
  birthday                date,
  relationship_start_date date,
  avatar_url              text,
  gender                  text,
  role                    text default 'user',
  onboarding_complete     boolean not null default false,
  created_at              timestamptz not null default now()
);

-- Signup only calls auth.signUp(), so the profile row is created here.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, nullif(new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.couples (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid not null references public.profiles(id) on delete cascade,
  invite_code text not null unique,
  created_at  timestamptz not null default now()
);

create table public.couple_members (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  unique (couple_id, profile_id)
);
create index couple_members_profile_id_idx on public.couple_members (profile_id);

-- joinCouple() counts members before inserting, but RLS hides a couple's rows
-- from a user who is not in it yet, so enforce the 2-member cap here as well.
create or replace function public.enforce_couple_size()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.couple_members where couple_id = new.couple_id) >= 2 then
    raise exception 'Pasangan ini sudah penuh' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger couple_members_max_two
  before insert on public.couple_members
  for each row execute function public.enforce_couple_size();

-- ============================================================
-- RLS helpers (security definer so policies don't recurse)
-- ============================================================

create or replace function public.get_my_couple_id()
returns uuid language sql stable security definer set search_path = public as $$
  select couple_id from public.couple_members
  where profile_id = auth.uid()
  order by joined_at
  limit 1
$$;

create or replace function public.is_couple_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.couple_members
    where couple_id = cid and profile_id = auth.uid()
  )
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.shares_couple_with(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.couple_members me
    join public.couple_members them on them.couple_id = me.couple_id
    where me.profile_id = auth.uid() and them.profile_id = pid
  )
$$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ============================================================
-- Assessments & results
-- ============================================================

create table public.assessment_results (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  couple_id  uuid references public.couples(id) on delete cascade,
  answers    jsonb not null,
  scores     jsonb not null,
  taken_at   timestamptz not null default now()
);

create table public.mbti_results (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  couple_id  uuid references public.couples(id) on delete cascade,
  mbti_type  text not null,
  answers    jsonb not null,
  scores     jsonb not null,
  taken_at   timestamptz default now()
);

create table public.spending_results (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  spending_type text not null,
  scores        jsonb not null,
  answers       jsonb not null,
  created_at    timestamptz default now(),
  unique (couple_id, profile_id)
);

-- ============================================================
-- Daily questions
-- ============================================================

create table public.daily_responses (
  id             uuid primary key default gen_random_uuid(),
  couple_id      uuid not null references public.couples(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  question_index integer not null,
  answer         text not null,
  answered_date  date not null default current_date,
  created_at     timestamptz default now(),
  unique (couple_id, profile_id, answered_date)
);

create table public.ai_daily_questions (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples(id) on delete cascade,
  question_date date not null default current_date,
  question      text not null,
  context_used  jsonb,
  generated_by  text not null,
  created_at    timestamptz default now(),
  unique (couple_id, question_date)
);

-- ============================================================
-- Calendar, letters, kangen
-- ============================================================

create table public.couple_events (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples(id) on delete cascade,
  title        text not null,
  description  text,
  location     text,
  event_date   date not null,
  event_type   text not null,
  event_scope  text default 'couple',
  is_recurring boolean not null default false,
  is_completed boolean default false,
  budget       numeric,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index couple_events_couple_id_idx on public.couple_events (couple_id, event_date);

create table public.letters (
  id             uuid primary key default gen_random_uuid(),
  couple_id      uuid not null references public.couples(id) on delete cascade,
  sender_id      uuid not null references public.profiles(id) on delete cascade,
  receiver_id    uuid not null references public.profiles(id) on delete cascade,
  content        text not null,
  photo_url      text,
  occasion       text,
  occasion_label text,
  unlock_date    timestamptz not null,
  is_opened      boolean default false,
  opened_at      timestamptz,
  created_at     timestamptz default now()
);

create table public.miss_you (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples(id) on delete cascade,
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  receiver_id  uuid not null references public.profiles(id) on delete cascade,
  responded    boolean default false,
  responded_at timestamptz,
  created_at   timestamptz default now()
);

-- ============================================================
-- Finance
-- ============================================================

create table public.savings_goals (
  id             uuid primary key default gen_random_uuid(),
  couple_id      uuid not null references public.couples(id) on delete cascade,
  name           text not null,
  target_amount  numeric not null,
  current_amount numeric not null default 0,
  target_date    date,
  created_at     timestamptz not null default now()
);

create table public.savings_entries (
  id         uuid primary key default gen_random_uuid(),
  goal_id    uuid not null references public.savings_goals(id) on delete cascade,
  couple_id  uuid not null references public.couples(id) on delete cascade,
  amount     numeric not null,
  month      text not null,
  note       text,
  created_at timestamptz not null default now(),
  unique (goal_id, month)
);

create table public.couple_transactions (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples(id) on delete cascade,
  goal_id    uuid references public.savings_goals(id) on delete set null,
  amount     numeric not null,
  type       text not null,
  category   text,
  note       text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);

create table public.wishlist_items (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples(id) on delete cascade,
  name         text not null,
  price        numeric,
  link         text,
  image_url    text,
  owner_type   text,
  owner_id     uuid references public.profiles(id) on delete set null,
  is_purchased boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.wedding_budget_items (
  id             uuid primary key default gen_random_uuid(),
  couple_id      uuid not null references public.couples(id) on delete cascade,
  category       text not null,
  name           text not null,
  estimated_cost numeric not null default 0,
  actual_cost    numeric,
  is_paid        boolean not null default false,
  notes          text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- Pet
-- ============================================================

create table public.couple_pets (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples(id) on delete cascade,
  pet_type   text not null,
  name       text not null,
  level      integer not null default 1,
  xp         integer not null default 0,
  created_at timestamptz default now()
);

create table public.pet_mood_state (
  id             uuid primary key default gen_random_uuid(),
  pet_id         uuid not null references public.couple_pets(id) on delete cascade,
  mood           text not null default 'happy',
  hunger         integer not null default 70,
  happiness      integer not null default 70,
  cleanliness    integer not null default 70,
  thriving_since timestamptz,
  updated_at     timestamptz default now()
);

create table public.pet_care_roles (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples(id) on delete cascade,
  pet_id     uuid not null references public.couple_pets(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actions    text[] not null default '{}'
);

create table public.pet_care_logs (
  id          uuid primary key default gen_random_uuid(),
  pet_id      uuid not null references public.couple_pets(id) on delete cascade,
  action_type text not null,
  done_by     uuid not null references public.profiles(id) on delete cascade,
  done_at     timestamptz default now()
);

-- ============================================================
-- Games: Deep Talk + Samakan
-- ============================================================

create table public.deep_talk_packs (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  description  text,
  icon_name    text,
  color        text,
  sort_order   integer default 0,
  is_published boolean default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table public.deep_talk_levels (
  id             uuid primary key default gen_random_uuid(),
  pack_id        uuid not null references public.deep_talk_packs(id) on delete cascade,
  level_number   integer not null,
  title          text not null,
  description    text,
  question_count integer default 0,
  unique (pack_id, level_number)
);

create table public.deep_talk_questions (
  id             uuid primary key default gen_random_uuid(),
  level_id       uuid not null references public.deep_talk_levels(id) on delete cascade,
  question_text  text not null,
  sort_order     integer default 0,
  target_partner integer,
  is_active      boolean default true,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- The admin panel creates packs and questions but has no UI for levels, so a
-- new pack gets three empty levels to fill. (Local assumption: the original
-- hosted packs were seeded by SQL; this keeps the admin flow usable.)
create or replace function public.create_default_deep_talk_levels()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.deep_talk_levels (pack_id, level_number, title)
  values (new.id, 1, 'Ringan'), (new.id, 2, 'Lebih Dalam'), (new.id, 3, 'Paling Dalam')
  on conflict (pack_id, level_number) do nothing;
  return new;
end;
$$;

create trigger deep_talk_packs_default_levels
  after insert on public.deep_talk_packs
  for each row execute function public.create_default_deep_talk_levels();

-- The app reads deep_talk_levels.question_count (0 = "Segera Hadir") but never
-- writes it; the admin panel only inserts/updates/deletes questions.
create or replace function public.sync_deep_talk_question_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare lid uuid;
begin
  foreach lid in array array[
    case when tg_op <> 'INSERT' then old.level_id end,
    case when tg_op <> 'DELETE' then new.level_id end
  ] loop
    if lid is not null then
      update public.deep_talk_levels
      set question_count = (
        select count(*) from public.deep_talk_questions
        where level_id = lid and is_active is not false
      )
      where id = lid;
    end if;
  end loop;
  return null;
end;
$$;

create trigger deep_talk_questions_sync_count
  after insert or update or delete on public.deep_talk_questions
  for each row execute function public.sync_deep_talk_question_count();

create table public.deep_talk_progress (
  id                     uuid primary key default gen_random_uuid(),
  couple_id              uuid not null references public.couples(id) on delete cascade,
  pack_id                uuid not null references public.deep_talk_packs(id) on delete cascade,
  level_number           integer not null default 1,
  current_question_index integer not null default 0,
  completed_levels       integer[] not null default '{}',
  is_completed           boolean default false,
  started_at             timestamptz default now(),
  last_played_at         timestamptz default now(),
  unique (couple_id, pack_id)
);

create table public.game_sessions (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples(id) on delete cascade,
  created_by   uuid not null references public.profiles(id) on delete cascade,
  partner_id   uuid references public.profiles(id) on delete set null,
  chapter_id   text not null default 'hari-pertama',
  status       text not null default 'waiting',
  rounds       jsonb not null default '[]',
  round_types  text[] not null,
  total_score  integer not null default 0,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  completed_at timestamptz
);

-- ============================================================
-- Push notifications
-- ============================================================

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth_key   text not null,
  created_at timestamptz default now(),
  unique (profile_id, endpoint)
);

-- ============================================================
-- Data API grants
-- Newer Supabase no longer grants table privileges to API roles on new public
-- tables, so grant them explicitly. RLS below still decides which rows.
-- anon gets nothing: every policy targets signed-in users.
-- ============================================================

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant execute on function
  public.get_my_couple_id(), public.is_couple_member(uuid), public.is_admin(),
  public.shares_couple_with(uuid), public.my_role()
to authenticated, service_role;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles             enable row level security;
alter table public.couples              enable row level security;
alter table public.couple_members       enable row level security;
alter table public.assessment_results   enable row level security;
alter table public.mbti_results         enable row level security;
alter table public.spending_results     enable row level security;
alter table public.daily_responses      enable row level security;
alter table public.ai_daily_questions   enable row level security;
alter table public.couple_events        enable row level security;
alter table public.letters              enable row level security;
alter table public.miss_you             enable row level security;
alter table public.savings_goals        enable row level security;
alter table public.savings_entries      enable row level security;
alter table public.couple_transactions  enable row level security;
alter table public.wishlist_items       enable row level security;
alter table public.wedding_budget_items enable row level security;
alter table public.couple_pets          enable row level security;
alter table public.pet_mood_state       enable row level security;
alter table public.pet_care_roles       enable row level security;
alter table public.pet_care_logs        enable row level security;
alter table public.deep_talk_packs      enable row level security;
alter table public.deep_talk_levels     enable row level security;
alter table public.deep_talk_questions  enable row level security;
alter table public.deep_talk_progress   enable row level security;
alter table public.game_sessions        enable row level security;
alter table public.push_subscriptions   enable row level security;

-- profiles: own row + partner's row; admins see and manage everyone.
-- A user may not change their own role (only an admin can).
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_couple_with(id) or public.is_admin());
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role is not distinct from public.my_role());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- couples: readable by any signed-in user so an invite code can be looked up
-- before joining; only members can delete; premium is flipped server-side.
create policy couples_select on public.couples for select to authenticated
  using (true);
create policy couples_insert on public.couples for insert to authenticated
  with check (created_by = auth.uid());
create policy couples_delete on public.couples for delete to authenticated
  using (public.is_couple_member(id) or created_by = auth.uid());

-- couple_members: see your own couple; add or remove only yourself.
create policy couple_members_select on public.couple_members for select to authenticated
  using (profile_id = auth.uid() or public.is_couple_member(couple_id) or public.is_admin());
create policy couple_members_insert on public.couple_members for insert to authenticated
  with check (profile_id = auth.uid());
create policy couple_members_delete on public.couple_members for delete to authenticated
  using (profile_id = auth.uid());

-- Tables scoped by couple_id: full access for members of that couple.
do $$
declare t text;
begin
  foreach t in array array[
    'spending_results', 'daily_responses', 'ai_daily_questions', 'couple_events',
    'letters', 'miss_you', 'savings_goals', 'savings_entries', 'couple_transactions',
    'wishlist_items', 'wedding_budget_items', 'couple_pets', 'pet_care_roles',
    'deep_talk_progress', 'game_sessions'
  ] loop
    execute format(
      'create policy %1$s_member_all on public.%1$I for all to authenticated
         using (public.is_couple_member(couple_id))
         with check (public.is_couple_member(couple_id))', t);
    execute format(
      'create policy %1$s_admin_select on public.%1$I for select to authenticated
         using (public.is_admin())', t);
  end loop;
end $$;

-- Per-person results that may exist before the couple is formed.
do $$
declare t text;
begin
  foreach t in array array['assessment_results', 'mbti_results'] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using (profile_id = auth.uid() or public.is_couple_member(couple_id) or public.is_admin())', t);
    execute format(
      'create policy %1$s_write_own on public.%1$I for all to authenticated
         using (profile_id = auth.uid()) with check (profile_id = auth.uid())', t);
  end loop;
end $$;

-- Pet child tables are scoped through couple_pets.
create policy pet_mood_state_member_all on public.pet_mood_state for all to authenticated
  using (exists (select 1 from public.couple_pets p where p.id = pet_id and public.is_couple_member(p.couple_id)))
  with check (exists (select 1 from public.couple_pets p where p.id = pet_id and public.is_couple_member(p.couple_id)));
create policy pet_care_logs_member_all on public.pet_care_logs for all to authenticated
  using (exists (select 1 from public.couple_pets p where p.id = pet_id and public.is_couple_member(p.couple_id)))
  with check (exists (select 1 from public.couple_pets p where p.id = pet_id and public.is_couple_member(p.couple_id)));

-- Deep Talk content: everyone signed in can read; admins manage it.
do $$
declare t text;
begin
  foreach t in array array['deep_talk_packs', 'deep_talk_levels', 'deep_talk_questions'] loop
    execute format(
      'create policy %1$s_read on public.%1$I for select to authenticated using (true)', t);
    execute format(
      'create policy %1$s_admin_write on public.%1$I for all to authenticated
         using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Push subscriptions: own rows only (sending uses the service role).
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy push_subscriptions_admin_select on public.push_subscriptions for select to authenticated
  using (public.is_admin());

-- ============================================================
-- Storage: public avatars bucket, files under <user_id>/
-- ============================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy avatars_public_read on storage.objects for select
  using (bucket_id = 'avatars');
create policy avatars_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
