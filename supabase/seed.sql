-- Local development seed for couple-app (runs on `supabase db reset`).
--
-- Demo accounts (password for both: couple123)
--   raka@couple.local   admin, already paired
--   nadia@couple.local  partner
-- Demo couple invite code: DUA2DEMO (free tier; unlock via the in-app button)
--
-- The Deep Talk packs below are placeholder content written for local testing.
-- The original packs lived only in the deleted hosted project.

-- ============================================================
-- Demo users (profiles are created by the on_auth_user_created trigger)
-- ============================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('couple123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('name', u.name), now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'raka@couple.local', 'Raka'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'nadia@couple.local', 'Nadia')
) as u(id, email, name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email in ('raka@couple.local', 'nadia@couple.local');

update public.profiles set
  gender = 'male', birthday = '1997-03-14', relationship_start_date = '2023-02-11',
  onboarding_complete = true, role = 'admin'
where id = '11111111-1111-4111-8111-111111111111';

update public.profiles set
  gender = 'female', birthday = '1998-09-02', relationship_start_date = '2023-02-11',
  onboarding_complete = true
where id = '22222222-2222-4222-8222-222222222222';

insert into public.couples (id, created_by, invite_code)
values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'DUA2DEMO');

insert into public.couple_members (couple_id, profile_id) values
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111'),
  ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222');

-- Same events seedCalendarEvents() creates when a couple forms.
insert into public.couple_events (couple_id, title, event_date, event_type, is_recurring, event_scope, created_by) values
  ('33333333-3333-4333-8333-333333333333', 'Ulang Tahun Raka',  '1997-03-14', 'birthday',    true, 'couple', '11111111-1111-4111-8111-111111111111'),
  ('33333333-3333-4333-8333-333333333333', 'Ulang Tahun Nadia', '1998-09-02', 'birthday',    true, 'couple', '22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333', 'Anniversary',       '2023-02-11', 'anniversary', true, 'couple', '11111111-1111-4111-8111-111111111111');

-- Deep Talk content (10 free packs) ships in the migration
-- 20261027130000_deep_talk_packs.sql, so it is not seeded here.
