// Pet Kita remake, database leaf (spec docs/superpowers/specs/2026-11-04-pet-remake.md,
// acceptance gates 1-14 and 30) against a LOCAL Supabase.
//   node scripts/verify/pet-remake.mjs
//
// Throwaway users through the admin API, couples through create_couple /
// join_couple, an outsider and a no-couple user. Proves, with negative tests:
//   * the migration re-applies as a no-op, and on a copy of the pre-remake
//     schema (rolled back afterwards) an old-style pet like Eric and Kezia's
//     arrives with name, type, created date, level, XP and history intact
//   * sum(ledger) = xp and level = floor(xp/100)+1 for every pet
//   * say hi (once a Jakarta day each, +5 bonus when both), every event source
//     with its cap, the 50 a day couple cap, dedupe on edits and replays
//   * a failing pet_award never blocks saving a Moment, letter or Kangen
//   * RLS: no client writes to the ledger, notes, care roles; nobody deletes
//     the pet; outsiders see nothing; rename works and is logged
//   * the perform_pet_care shim, pet_status states, visits, the note claim
//   * realtime: the partner hears a hi, an outsider hears nothing
//   * scripts/verify/pet-rules.mjs says PET RULES IN SYNC (gate 30)
// Prints "pet remake verification passed" only when every check passes.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')

const MIGRATION = join(root, 'supabase', 'migrations', '20261104120000_pet_remake.sql')
const ENGLISH = join(root, 'supabase', 'migrations', '20261103120000_english_content.sql')

// ---------- local Supabase only ----------
const isLocal = (u) => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(u ?? '')
function readEnvFile(f) {
  const p = join(root, f)
  const out = {}
  if (!existsSync(p)) return out
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
let env = null
for (const f of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  const e = readEnvFile(f)
  if (isLocal(e.NEXT_PUBLIC_SUPABASE_URL) && e.NEXT_PUBLIC_SUPABASE_ANON_KEY && e.SUPABASE_SERVICE_ROLE_KEY) env = e
}
if (!env) {
  const s = spawnSync('supabase', ['status', '-o', 'env'], { cwd: root, encoding: 'utf8' })
  const e = {}
  for (const line of (s.stdout ?? '').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/)
    if (m) e[m[1]] = m[2]
  }
  if (isLocal(e.API_URL) && e.ANON_KEY && e.SERVICE_ROLE_KEY) {
    env = { NEXT_PUBLIC_SUPABASE_URL: e.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: e.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: e.SERVICE_ROLE_KEY }
  }
}
if (!env) {
  console.error('Refusing to run: no local Supabase URL + keys found (.env*.local or `supabase status`)')
  process.exit(1)
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const anonClient = () => createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts)
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts)

// ---------- psql (local container) ----------
function psqlRaw(sql) {
  const r = spawnSync('docker', ['exec', '-i', 'supabase_db_couple-app', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-q', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8', maxBuffer: 64 << 20 })
  return { ok: r.status === 0, out: r.stdout ?? '', err: `${r.stderr ?? ''}${r.error ?? ''}` }
}
// Runs a script, retrying when a concurrent session deadlocks it. Lines
// "R|key|json" come back as { key: value }.
function psql(sql, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = psqlRaw(sql)
    if (r.ok) {
      const out = {}
      for (const line of r.out.split('\n')) {
        const m = line.match(/^R\|([\w-]+)\|(.*)$/)
        if (m) out[m[1]] = JSON.parse(m[2])
      }
      return out
    }
    if (!/deadlock detected|lock timeout|canceling statement due to lock/i.test(r.err) || attempt === 3) {
      throw new Error(`psql ${label} failed: ${r.err.split('\n').filter((l) => /ERROR|DETAIL|CONTEXT|LINE/.test(l)).join(' | ').slice(0, 900)}`)
    }
  }
  return {}
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

// ---------- tiny harness ----------
let pass = 0
const failures = []
const evidence = []
const ok = (name, cond, extra = '') => { if (cond) pass++; else failures.push(`${name}${extra ? ' :: ' + extra : ''}`) }
const created = []
const couples = new Set()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const describe = (r) => r?.error ? `${r.error.hint ?? r.error.code ?? ''} ${r.error.message}` : `data=${JSON.stringify(r?.data)?.slice(0, 160)}`
const jakartaDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const jakartaHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))

async function makeUser(tag, name) {
  const email = `pet-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@verify.local`
  const password = 'verify-pass-123'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } })
  if (error) throw new Error(`createUser ${tag}: ${error.message}`)
  created.push(data.user.id)
  const client = anonClient()
  const { data: auth, error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error(`signIn ${tag}: ${signInError.message}`)
  if (auth.session) await client.realtime.setAuth(auth.session.access_token)
  return { client, id: data.user.id, name }
}
async function pair(tagA, nameA, tagB, nameB) {
  const a = await makeUser(tagA, nameA)
  const c = await a.client.rpc('create_couple')
  if (c.error) throw new Error(`create_couple ${tagA}: ${c.error.message}`)
  couples.add(c.data.id)
  if (!tagB) return { a, cid: c.data.id }
  const b = await makeUser(tagB, nameB)
  const j = await b.client.rpc('join_couple', { p_code: c.data.invite_code })
  if (j.error) throw new Error(`join_couple ${tagB}: ${j.error.message}`)
  return { a, b, cid: c.data.id }
}

const petOf = async (cid) => (await admin.from('couple_pets').select('*').eq('couple_id', cid).maybeSingle()).data
const xpOf = async (cid) => (await petOf(cid))?.xp
const ledger = async (petId) => (await admin.from('pet_warmth_events').select('*').eq('pet_id', petId).order('created_at')).data ?? []
const todaySum = async (petId) => (await ledger(petId)).filter((e) => e.source !== 'legacy' && e.day === jakartaDay()).reduce((s, e) => s + e.points, 0)
const hi = (u, gesture = 'pat') => u.client.rpc('pet_say_hi', { p_gesture: gesture })
const status = (u, petId) => u.client.rpc('pet_status', petId ? { p_pet_id: petId } : {})
const today = () => jakartaDay()

// The state of all pet data, comparable across two runs of the migration.
const STATE_SQL = (oldPet) => `json_build_object(
  'pets_changed', (select count(*) from pre_pets p join public.couple_pets c using (id)
                   where (c.name, c.pet_type, c.created_at, c.xp, c.level) is distinct from (p.name, p.pet_type, p.created_at, p.xp, p.level)),
  'pets_missing', (select count(*) from pre_pets p where not exists (select 1 from public.couple_pets c where c.id = p.id)),
  'counts', json_build_object('logs', (select count(*) from public.pet_care_logs), 'moods', (select count(*) from public.pet_mood_state),
                              'roles', (select count(*) from public.pet_care_roles)),
  'pre_counts', (select row_to_json(x) from pre_counts x),
  'sum_mismatch', (select count(*) from public.couple_pets c
                   where c.xp <> coalesce((select sum(points) from public.pet_warmth_events e where e.pet_id = c.id), 0)),
  'legacy_rows', (select count(*) from public.pet_warmth_events where source = 'legacy'),
  'pets', (select count(*) from public.couple_pets),
  'unhatched', (select count(*) from public.couple_pets where hatched_at is null),
  'old', (select json_build_object('name', name, 'pet_type', pet_type, 'level', level, 'xp', xp, 'created_at', created_at,
                                   'hatched_eq_created', hatched_at = created_at) from public.couple_pets where id = ${q(oldPet)}),
  'old_ledger', (select json_agg(json_build_object('source', source, 'points', points, 'actor', actor_id, 'day', day))
                 from public.pet_warmth_events where pet_id = ${q(oldPet)}),
  'old_logs', (select count(*) from public.pet_care_logs where pet_id = ${q(oldPet)}),
  'old_roles', (select count(*) from public.pet_care_roles where pet_id = ${q(oldPet)}),
  'old_mood', (select count(*) from public.pet_mood_state where pet_id = ${q(oldPet)}),
  'data_hash', md5(coalesce((select string_agg(concat_ws(',', id, name, pet_type, created_at, xp, level, hatched_at), ';' order by id) from public.couple_pets), '')
            || '|' || coalesce((select string_agg(concat_ws(',', id, pet_id, source, points, ref_id, day, created_at), ';' order by id) from public.pet_warmth_events), '')
            || '|' || coalesce((select string_agg(concat_ws(',', profile_id, pet), ';' order by profile_id) from public.notification_prefs), '')),
  'schema_hash', md5(
       coalesce((select string_agg(pg_get_triggerdef(t.oid), ';' order by t.tgname) from pg_trigger t
                 where not t.tgisinternal and t.tgname ~ '(pet|couple_pets)'), '')
    || coalesce((select string_agg(conname || pg_get_constraintdef(oid), ';' order by conname) from pg_constraint
                 where conrelid in ('public.couple_pets'::regclass, 'public.pet_warmth_events'::regclass, 'public.pet_daily_notes'::regclass, 'public.pet_visits'::regclass)), '')
    || coalesce((select string_agg(policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), ';' order by tablename, policyname) from pg_policies
                 where tablename ~ '^(couple_pets|pet_)'), '')
    || coalesce((select string_agg(relname || coalesce(relacl::text, ''), ';' order by relname) from pg_class
                 where relnamespace = 'public'::regnamespace and relname in ('couple_pets', 'pet_care_roles', 'pet_mood_state', 'pet_care_logs',
                   'pet_warmth_events', 'pet_daily_notes', 'pet_visits', 'notification_prefs')), '')
    || coalesce((select string_agg(attname || coalesce(attacl::text, ''), ';' order by attname) from pg_attribute
                 where attrelid in ('public.couple_pets'::regclass, 'public.pet_mood_state'::regclass) and attnum > 0), '')
    || coalesce((select string_agg(proname || pg_get_function_identity_arguments(oid) || prosrc || coalesce(proacl::text, ''), ';' order by proname, oid)
                 from pg_proc where pronamespace = 'public'::regnamespace and (proname ~ '^pet_' or proname in ('adopt_pet', 'perform_pet_care'))), '')
    || coalesce((select string_agg(tablename, ';' order by tablename) from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename ~ '^(couple_pets|pet_)'), '')
    || coalesce((select string_agg(indexname || indexdef, ';' order by indexname) from pg_indexes where tablename ~ '^(couple_pets|pet_)'), ''))
)`

function oldPerformPetCare() {
  const src = readFileSync(ENGLISH, 'utf8')
  const m = src.match(/CREATE OR REPLACE FUNCTION public\.perform_pet_care\(p_pet_id uuid, p_action text\)[\s\S]*?\n\$function\$\s*\n;/)
  if (!m) throw new Error('could not find the old perform_pet_care in 20261103120000_english_content.sql')
  return m[0]
}

// Puts the database back to the schema before the remake (inside a
// transaction that is rolled back): this is also the rollback plan, 5.5 step 6.
const UNINSTALL_SQL = () => `
drop trigger if exists activities_pet_warmth on public.activities;
drop trigger if exists miss_you_pet_warmth on public.miss_you;
drop trigger if exists game_sessions_pet_warmth on public.game_sessions;
drop trigger if exists deep_talk_progress_pet_warmth on public.deep_talk_progress;
drop trigger if exists couple_pets_check_write on public.couple_pets;
drop trigger if exists couple_pets_after_insert on public.couple_pets;
drop trigger if exists couple_pets_after_rename on public.couple_pets;
drop table if exists public.pet_visits, public.pet_daily_notes, public.pet_warmth_events;
drop function if exists public.pet_award(uuid, uuid, text, uuid, text, text);
drop function if exists public.pet_on_activity();
drop function if exists public.pet_on_kangen();
drop function if exists public.pet_on_game_session();
drop function if exists public.pet_on_deep_talk();
drop function if exists public.pet_check_write();
drop function if exists public.pet_after_insert();
drop function if exists public.pet_after_rename();
drop function if exists public.adopt_pet(text, text);
drop function if exists public.pet_say_hi(text);
drop function if exists public.pet_status(uuid);
drop function if exists public.pet_mark_visit(uuid, integer, boolean);
drop function if exists public.pet_claim_note(uuid, date, text);
drop function if exists public.pet_rules();
alter table public.couple_pets drop constraint if exists couple_pets_pet_type_check;
alter table public.couple_pets drop constraint if exists couple_pets_name_check;
alter table public.couple_pets drop column if exists hatched_at;
alter table public.notification_prefs drop column if exists pet;
do $$ begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'couple_pets') then
    alter publication supabase_realtime drop table public.couple_pets;
  end if;
end $$;
grant insert, update, delete on public.pet_care_roles to authenticated;
grant delete on public.pet_mood_state to authenticated;
grant insert (pet_id, updated_at) on public.pet_mood_state to authenticated;
grant update, delete on public.pet_care_logs to authenticated;
revoke insert on public.couple_pets from authenticated;
grant insert, delete on public.couple_pets to authenticated;
${oldPerformPetCare()}
`

async function main() {
  const migration = readFileSync(MIGRATION, 'utf8')
  ok('migration has no transaction control (runner wraps it, the copy test rolls it back)', !/^\s*(begin|commit|rollback)\s*;/im.test(migration))

  // ================= users and couples =================
  const P1 = await pair('a', 'Ayu', 'b', 'Bima')         // hi, moments, moods, kangen, status, realtime, rename
  const P2 = await pair('c', 'Citra', 'd', 'Dodi')       // games + fault injection; C is the outsider for P1
  const P3 = await pair('e', 'Eka', 'f', 'Fajar')        // the 50 a day cap
  const P4 = await pair('s', 'Sari')                     // solo couple (waiting for a partner)
  const P5 = await pair('h', 'Hana', 'i', 'Indra')       // no pet, then an imported pet one hi from a level
  const P6 = await pair('j', 'Jaya', 'k', 'Kirana')      // old-style pet (migration + shim)
  const P7 = await pair('m', 'Maya', 'n', 'Nico')        // moment social, jar, daily, letter
  const P8 = await pair('o', 'Oki', 'p', 'Putri')        // plan, bucket done, saving
  const P9 = await pair('q', 'Qori', 'r', 'Rudi')        // deep talk, one-sided glowing
  const loner = await makeUser('x', 'Xena')               // no couple
  const anon = anonClient()
  const { A, B } = { A: P1.a, B: P1.b }
  const C = P2.a

  // ================= gate 1 + 2: the migration =================
  // 1a. A second run on the live local DB changes nothing.
  const liveBefore = psql(`begin;
    create temp table pre_pets on commit drop as select id, name, pet_type, created_at, xp, level from public.couple_pets;
    create temp table pre_counts on commit drop as select (select count(*) from public.pet_care_logs) logs, (select count(*) from public.pet_mood_state) moods, (select count(*) from public.pet_care_roles) roles;
    select 'R|s|' || (${STATE_SQL(randomUUID())})::text; commit;`, 'live snapshot')
  const reapply = psqlRaw(migration)
  ok('migration re-applies on the live local DB without an error', reapply.ok, reapply.err.split('\n').filter((l) => /ERROR/.test(l)).join(' '))
  const liveAfter = psql(`begin;
    create temp table pre_pets on commit drop as select id, name, pet_type, created_at, xp, level from public.couple_pets;
    create temp table pre_counts on commit drop as select (select count(*) from public.pet_care_logs) logs, (select count(*) from public.pet_mood_state) moods, (select count(*) from public.pet_care_roles) roles;
    select 'R|s|' || (${STATE_SQL(randomUUID())})::text; commit;`, 'live snapshot 2')
  ok('re-applying on the live DB is a no-op (data and schema hashes identical)',
    liveBefore.s?.data_hash === liveAfter.s?.data_hash && liveBefore.s?.schema_hash === liveAfter.s?.schema_hash,
    `${liveBefore.s?.data_hash}/${liveAfter.s?.data_hash} ${liveBefore.s?.schema_hash}/${liveAfter.s?.schema_hash}`)
  psqlRaw(`notify pgrst, 'reload schema';`)

  // 1b. On a copy of the pre-remake schema, with an old-style pet seeded like
  //     Eric and Kezia's: apply, apply again, then use the pet. Rolled back.
  const J = P6.a
  const K = P6.b
  const oldPet = randomUUID()
  const simSql = `begin;
set local lock_timeout = '20s';
${UNINSTALL_SQL()}
select 'R|pre|' || json_build_object(
  'has_ledger', to_regclass('public.pet_warmth_events') is not null,
  'has_hatched', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'couple_pets' and column_name = 'hatched_at'),
  'old_care', (select prosrc ~ 'cooldown' from pg_proc where proname = 'perform_pet_care' and pronamespace = 'public'::regnamespace),
  'member_delete', has_table_privilege('authenticated', 'public.couple_pets', 'DELETE'),
  'member_roles', has_table_privilege('authenticated', 'public.pet_care_roles', 'UPDATE'))::text;
insert into public.couple_pets (id, couple_id, pet_type, name, level, xp, created_at)
values (${q(oldPet)}, ${q(P6.cid)}, 'cat', 'Mochi', 13, 1234, '2026-06-01 10:00:00+07');
insert into public.pet_mood_state (pet_id, mood, hunger, happiness, cleanliness, thriving_since, updated_at)
values (${q(oldPet)}, 'happy', 64, 71, 58, null, now() - interval '5 hours');
insert into public.pet_care_roles (couple_id, pet_id, profile_id, actions) values
  (${q(P6.cid)}, ${q(oldPet)}, ${q(J.id)}, '{feed,treat,bath}'),
  (${q(P6.cid)}, ${q(oldPet)}, ${q(K.id)}, '{play,walk,cuddle}');
insert into public.pet_care_logs (pet_id, action_type, done_by, done_at)
select ${q(oldPet)}, (array['feed','play','bath','treat','walk','cuddle'])[1 + g % 6],
       case when g % 2 = 0 then ${q(J.id)}::uuid else ${q(K.id)}::uuid end, now() - g * interval '3 hours'
from generate_series(1, 40) g;
create temp table pre_pets on commit drop as select id, name, pet_type, created_at, xp, level from public.couple_pets;
create temp table pre_counts on commit drop as select (select count(*) from public.pet_care_logs) logs, (select count(*) from public.pet_mood_state) moods, (select count(*) from public.pet_care_roles) roles;
${migration}
select 'R|run1|' || (${STATE_SQL(oldPet)})::text;
${migration}
select 'R|run2|' || (${STATE_SQL(oldPet)})::text;
select 'R|holes|' || json_build_object(
  'member_delete', has_table_privilege('authenticated', 'public.couple_pets', 'DELETE'),
  'member_roles_write', has_table_privilege('authenticated', 'public.pet_care_roles', 'INSERT')
                     or has_table_privilege('authenticated', 'public.pet_care_roles', 'UPDATE')
                     or has_table_privilege('authenticated', 'public.pet_care_roles', 'DELETE'),
  'member_mood_insert', has_column_privilege('authenticated', 'public.pet_mood_state', 'pet_id', 'INSERT'),
  'member_xp_insert', has_column_privilege('authenticated', 'public.couple_pets', 'xp', 'INSERT'),
  'member_name_update', has_column_privilege('authenticated', 'public.couple_pets', 'name', 'UPDATE'))::text;
set local request.jwt.claims = ${q(JSON.stringify({ sub: J.id, role: 'authenticated' }))};
set local role authenticated;
select 'R|visit|' || public.pet_mark_visit(${q(oldPet)})::text;
select 'R|status0|' || public.pet_status(${q(oldPet)})::text;
select 'R|hi|' || public.pet_say_hi('snack')::text;
select 'R|care|' || public.perform_pet_care(${q(oldPet)}, 'play')::text;
select 'R|history|' || json_build_object('logs', (select count(*) from public.pet_care_logs where pet_id = ${q(oldPet)}),
                                          'roles', (select count(*) from public.pet_care_roles where pet_id = ${q(oldPet)}),
                                          'mood', (select count(*) from public.pet_mood_state where pet_id = ${q(oldPet)}))::text;
reset role;
select 'R|after|' || json_build_object('xp', xp, 'level', level,
  'sum', (select sum(points) from public.pet_warmth_events where pet_id = ${q(oldPet)})) from public.couple_pets where id = ${q(oldPet)};
rollback;`
  const sim = psql(simSql, 'pre-remake copy')
  ok('copy: the uninstall restores the pre-remake schema (no ledger, no hatched_at, old care RPC, the two holes open)',
    sim.pre?.has_ledger === false && sim.pre?.has_hatched === false && sim.pre?.old_care === true
    && sim.pre?.member_delete === true && sim.pre?.member_roles === true, JSON.stringify(sim.pre))
  const r1 = sim.run1
  ok('copy run 1: every pet keeps name, type, created date, XP and level', r1?.pets_changed === 0 && r1?.pets_missing === 0, JSON.stringify(r1))
  ok('copy run 1: old care logs, mood rows and care roles keep their row counts',
    JSON.stringify(r1?.counts) === JSON.stringify(r1?.pre_counts), `${JSON.stringify(r1?.counts)} vs ${JSON.stringify(r1?.pre_counts)}`)
  ok('copy run 1: the old pet is whole (Mochi, cat, level 13, 1234 XP, created 1 June)',
    r1?.old?.name === 'Mochi' && r1?.old?.pet_type === 'cat' && r1?.old?.level === 13 && r1?.old?.xp === 1234
    && new Date(r1?.old?.created_at).toISOString() === '2026-06-01T03:00:00.000Z', JSON.stringify(r1?.old))
  ok('copy run 1: the old pet is home (hatched_at = created_at) with its 40 logs, 2 roles, 1 mood row',
    r1?.old?.hatched_eq_created === true && r1?.old_logs === 40 && r1?.old_roles === 2 && r1?.old_mood === 1, JSON.stringify(r1))
  ok('copy run 1: one legacy ledger row equal to its XP, no actor, nothing else',
    r1?.old_ledger?.length === 1 && r1.old_ledger[0].source === 'legacy' && r1.old_ledger[0].points === 1234 && r1.old_ledger[0].actor === null
    && r1.old_ledger[0].day === '2026-06-01', JSON.stringify(r1?.old_ledger))
  ok('copy run 1: sum(ledger) = xp for every pet, one legacy row per pet, every existing pet hatched',
    r1?.sum_mismatch === 0 && r1?.legacy_rows === r1?.pets && r1?.unhatched === 0, JSON.stringify(r1))
  ok('copy run 2 (second apply) is a no-op: data and schema hashes identical',
    !!r1 && sim.run2?.data_hash === r1.data_hash && sim.run2?.schema_hash === r1.schema_hash && sim.run2?.legacy_rows === r1.legacy_rows,
    `${r1?.data_hash}/${sim.run2?.data_hash} ${r1?.schema_hash}/${sim.run2?.schema_hash}`)
  ok('copy: both holes closed (no member DELETE on couple_pets, no member writes to care roles), mood rows read-only, xp not insertable, rename kept',
    sim.holes?.member_delete === false && sim.holes?.member_roles_write === false && sim.holes?.member_mood_insert === false
    && sim.holes?.member_xp_insert === false && sim.holes?.member_name_update === true, JSON.stringify(sim.holes))
  ok('copy: first visit to the migrated pet starts at its level (no flood of level-up overlays), intro not seen yet',
    sim.visit?.first_visit === true && sim.visit?.celebrated_level === 13 && sim.visit?.intro_seen_at === null, JSON.stringify(sim.visit))
  ok('copy: pet_status of the migrated pet: level 13, Grown, migrated, home, dozy (legacy warmth is not recent warmth)',
    sim.status0?.level === 13 && sim.status0?.stage === 'grown' && sim.status0?.migrated === true && sim.status0?.hatched === true
    && sim.status0?.mood === 'dozy' && sim.status0?.into_level === 34, JSON.stringify(sim.status0))
  ok('copy: the migrated pet takes a hi (+5) and the old care RPC adds nothing more that day',
    sim.hi?.counted === true && sim.hi?.points === 5 && sim.hi?.xp === 1239 && sim.hi?.level === 13
    && sim.care?.hunger === 100 && sim.care?.mood === 'thriving' && sim.after?.xp === 1239 && Number(sim.after?.sum) === 1239,
    `${JSON.stringify(sim.hi)} ${JSON.stringify(sim.care)} ${JSON.stringify(sim.after)}`)
  ok('copy: the history is still readable by the couple after the remake', sim.history?.logs === 40 && sim.history?.roles === 2 && sim.history?.mood === 1, JSON.stringify(sim.history))
  evidence.push(`copy of pre-remake schema: old pet Mochi cat L${r1?.old?.level} ${r1?.old?.xp} XP kept, ${r1?.old_logs} logs/${r1?.old_roles} roles/${r1?.old_mood} mood kept, legacy row ${r1?.old_ledger?.[0]?.points}, run 2 hash equal: ${sim.run2?.data_hash === r1?.data_hash && sim.run2?.schema_hash === r1?.schema_hash}`)

  // ================= adopt =================
  const ad1 = await A.client.rpc('adopt_pet', { p_type: 'cat', p_name: '  Mochi  ' })
  ok('adopt_pet creates the pet (name trimmed, level 1, 0 XP, not hatched)',
    !ad1.error && ad1.data?.name === 'Mochi' && ad1.data?.pet_type === 'cat' && ad1.data?.level === 1 && ad1.data?.xp === 0 && ad1.data?.hatched_at === null, describe(ad1))
  const pet1 = ad1.data?.id
  const ad2 = await B.client.rpc('adopt_pet', { p_type: 'dog', p_name: 'Kopi' })
  ok('the partner adopting too gets the same pet back', !ad2.error && ad2.data?.id === pet1 && ad2.data?.pet_type === 'cat', describe(ad2))
  const { data: adoptAct } = await admin.from('activities').select('kind, actor_id, summary, url').eq('couple_id', P1.cid).eq('kind', 'pet')
  ok('adoption writes one feed line "adopted a cat called Mochi"', adoptAct?.length === 1 && adoptAct[0].summary === 'adopted a cat called Mochi'
    && adoptAct[0].actor_id === A.id && adoptAct[0].url === '/app/pet', JSON.stringify(adoptAct))
  for (const [name, args, hint] of [
    ['a parrot', { p_type: 'parrot', p_name: 'Rio' }, 'PET_INVALID'],
    ['an empty name', { p_type: 'dog', p_name: '   ' }, 'PET_INVALID'],
    ['a 21-character name', { p_type: 'dog', p_name: 'x'.repeat(21) }, 'PET_INVALID'],
  ]) {
    const r = await P9.a.client.rpc('adopt_pet', args)
    ok(`adopt_pet rejects ${name}`, r.error?.hint === hint, describe(r))
  }
  ok('adopt_pet without a couple is refused', (await loner.client.rpc('adopt_pet', { p_type: 'cat', p_name: 'Solo' })).error?.hint === 'PET_NO_COUPLE')
  // Race: both partners adopt at the same moment.
  const [race1, race2] = await Promise.all([
    P7.a.client.rpc('adopt_pet', { p_type: 'dog', p_name: 'Boba' }),
    P7.b.client.rpc('adopt_pet', { p_type: 'cat', p_name: 'Tahu' }),
  ])
  const { count: p7Pets } = await admin.from('couple_pets').select('*', { count: 'exact', head: true }).eq('couple_id', P7.cid)
  ok('two adopts at once: one pet, both callers get it', !race1.error && !race2.error && race1.data?.id === race2.data?.id && p7Pets === 1, `${describe(race1)} | ${describe(race2)}`)
  const pet7 = race1.data?.id
  for (const P of [P2, P3, P8, P9]) {
    const r = await P.a.client.rpc('adopt_pet', { p_type: 'dog', p_name: 'Kopi' })
    if (r.error) throw new Error(`adopt for ${P.a.name}: ${r.error.message}`)
  }
  const solo = await P4.a.client.rpc('adopt_pet', { p_type: 'cat', p_name: 'Boba' })
  ok('a solo couple can adopt', !solo.error && !!solo.data?.id, describe(solo))

  // ================= gate 14 (start) + realtime set-up =================
  const st0 = await status(A)
  ok('pet_status() with no id = my pet; a new pet is dozy, Little, level 1, not hatched, not migrated, no his yet',
    !st0.error && st0.data?.pet_id === pet1 && st0.data?.mood === 'dozy' && st0.data?.stage === 'little' && st0.data?.level === 1
    && st0.data?.hatched === false && st0.data?.migrated === false && st0.data?.said_hi_today?.length === 0
    && st0.data?.day === today() && st0.data?.night === (jakartaHour() >= 22 || jakartaHour() < 6), describe(st0))
  ok('pet_status() is null for a couple with no pet yet', (await status(P5.a)).data === null)
  ok('pet_status(other couple\'s pet) is refused for an outsider', (await status(C, pet1)).error?.hint === 'PET_NOT_FOUND')
  ok('pet_status for anon is refused', !!(await anon.rpc('pet_status', { p_pet_id: pet1 })).error)

  const heardB = []
  const heardC = []
  const listen = async (client, sink, tag) => {
    const ch = client.channel(`pet-${tag}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pet_warmth_events', filter: `pet_id=eq.${pet1}` }, (p) => sink.push(p))
    const state = await new Promise((resolve) => {
      const t = setTimeout(() => resolve('TIMEOUT'), 10000)
      ch.subscribe((s) => { if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { clearTimeout(t); resolve(s) } })
    })
    ok(`realtime: ${tag} subscribed to pet_warmth_events`, state === 'SUBSCRIBED', state)
    return ch
  }
  const chB = await listen(B.client, heardB, 'partner')
  const chC = await listen(C.client, heardC, 'outsider')
  await sleep(1500)

  // ================= gate 4 + 5: say hi =================
  const h1 = await hi(A, 'snack')
  ok('A says hi: counted, +5, not both yet, not hatched', !h1.error && h1.data?.counted === true && h1.data?.points === 5
    && h1.data?.both_today === false && h1.data?.xp === 5 && h1.data?.hatched === false, describe(h1))
  const h2 = await hi(A, 'play')
  ok('gate 4: A\'s second hi the same Jakarta day: counted = false, XP unchanged', !h2.error && h2.data?.counted === false && h2.data?.points === 0
    && h2.data?.xp === 5 && (await xpOf(P1.cid)) === 5, describe(h2))
  const l1 = (await ledger(pet1)).filter((e) => e.source === 'hi')
  ok('the hi row: actor A, gesture snack, Jakarta day', l1.length === 1 && l1[0].actor_id === A.id && l1[0].gesture === 'snack' && l1[0].day === today(), JSON.stringify(l1))
  const t0 = Date.now()
  while (heardB.length === 0 && Date.now() - t0 < 5000) await sleep(100)
  ok('realtime: the partner hears the hi within 5 s', heardB.length >= 1 && heardB[0].new?.source === 'hi', `${heardB.length} events`)
  const h3 = await hi(B, 'pat')
  ok('B says hi: +5 +5 (both today), the pet is home', !h3.error && h3.data?.counted === true && h3.data?.points === 10 && h3.data?.both_today === true
    && h3.data?.xp === 15 && h3.data?.hatched === true && h3.data?.just_hatched === true, describe(h3))
  const [h4, h5] = await Promise.all([hi(A, 'pat'), hi(B, 'snack')])
  ok('gate 5: both said hi: XP rose by exactly 15 and further calls add 0', h4.data?.counted === false && h5.data?.counted === false && (await xpOf(P1.cid)) === 15,
    `${describe(h4)} ${describe(h5)}`)
  const { data: hiActs } = await admin.from('activities').select('actor_id, summary').eq('couple_id', P1.cid).eq('kind', 'pet').like('summary', 'said hi%')
  ok('one "said hi to Mochi" feed line per person per day', hiActs?.length === 2 && hiActs.every((a) => a.summary === 'said hi to Mochi')
    && new Set(hiActs.map((a) => a.actor_id)).size === 2, JSON.stringify(hiActs))
  ok('pet_say_hi rejects an unknown gesture', (await hi(A, 'poke')).error?.hint === 'PET_INVALID')
  ok('pet_say_hi without a couple is refused', (await hi(loner)).error?.hint === 'PET_NO_COUPLE')
  ok('pet_say_hi with no pet yet is refused', (await hi(P5.a)).error?.hint === 'PET_NOT_FOUND')
  const st1 = await status(B)
  ok('status after both his: cozy at 15, both today, two presence entries with gestures, no counts per person',
    st1.data?.mood === 'cozy' && st1.data?.warmth_72h === 15 && st1.data?.both_today === true && st1.data?.said_hi_today?.length === 2
    && st1.data.said_hi_today.every((x) => ['pat', 'snack'].includes(x.gesture) && !('count' in x)), describe(st1))
  // Solo: two his at once from one person, exactly one counts; the pet hatches alone.
  const [s1, s2] = await Promise.all([hi(P4.a, 'pat'), hi(P4.a, 'play')])
  ok('two his at once by one person: exactly one counts; a solo couple hatches on its first hi',
    [s1, s2].filter((r) => r.data?.counted).length === 1 && [s1, s2].some((r) => r.data?.just_hatched === true) && (await xpOf(P4.cid)) === 5,
    `${describe(s1)} | ${describe(s2)}`)

  // ================= gate 6: Moments =================
  const mom = (u, cid, title) => u.client.from('moments').insert({ couple_id: cid, created_by: u.id, title, moment_date: today() }).select('id, created_at').single()
  const m1 = await mom(A, P1.cid, 'Ramen in Blok M')
  const xpM1 = await xpOf(P1.cid)
  const m1Row = (await ledger(pet1)).find((e) => e.source === 'moment' && e.ref_id === m1.data?.id)
  ok('gate 6: a Moment awards 10 in the same transaction (ledger row stamped with the Moment\'s own transaction time)',
    !m1.error && xpM1 === 25 && m1Row?.points === 10 && m1Row?.actor_id === A.id
    && new Date(m1Row.created_at).getTime() === new Date(m1.data.created_at).getTime(), `${describe(m1)} xp=${xpM1} ${JSON.stringify(m1Row)}`)
  const m2 = await mom(B, P1.cid, 'Sunday market')
  ok('a second Moment that day awards 10', !m2.error && (await xpOf(P1.cid)) === 35)
  const m3 = await mom(A, P1.cid, 'Late night martabak')
  const m3Row = (await ledger(pet1)).find((e) => e.ref_id === m3.data?.id)
  ok('gate 6: a third Moment that day awards 0 (and leaves no ledger row)', !m3.error && (await xpOf(P1.cid)) === 35 && !m3Row)

  // ================= gate 8: mood edits and Kangen =================
  const moodIns = await A.client.from('mood_checkins').insert({ couple_id: P1.cid, profile_id: A.id, mood: 'senang' }).select('id').single()
  ok('A\'s mood check-in awards 3', !moodIns.error && (await xpOf(P1.cid)) === 38, describe(moodIns))
  ok('no comfort pose for a light mood', ((await status(A)).data?.comfort_for ?? ['x']).length === 0)
  const moodUpd = await A.client.from('mood_checkins').update({ mood: 'sedih' }).eq('id', moodIns.data?.id).select('id')
  const { count: moodActs } = await admin.from('activities').select('*', { count: 'exact', head: true }).eq('couple_id', P1.cid).eq('kind', 'mood')
  ok('gate 8: changing today\'s mood writes a feed line but does not award again', !moodUpd.error && moodActs === 2 && (await xpOf(P1.cid)) === 38, `${describe(moodUpd)} acts=${moodActs}`)
  const stHeavy = await status(B)
  ok('gate 14: comfort_for names the member whose mood today is heavy', JSON.stringify(stHeavy.data?.comfort_for) === JSON.stringify([A.id]), describe(stHeavy))
  await B.client.from('mood_checkins').insert({ couple_id: P1.cid, profile_id: B.id, mood: 'capek' })
  ok('B\'s mood awards 3 (per person, not per couple); both heavy moods listed', (await xpOf(P1.cid)) === 41
    && ((await status(A)).data?.comfort_for ?? []).length === 2)
  const kangen = (u, cid, to) => u.client.from('miss_you').insert({ couple_id: cid, sender_id: u.id, receiver_id: to })
  const k1 = await kangen(A, P1.cid, B.id)
  ok('A\'s Kangen awards 3', !k1.error && (await xpOf(P1.cid)) === 44, describe(k1))
  // The Kangen rate limit (30 min) would block a second one; move the first back.
  await admin.from('miss_you').update({ created_at: new Date(Date.now() - 31 * 60000).toISOString() }).eq('sender_id', A.id)
  const k2 = await kangen(A, P1.cid, B.id)
  ok('gate 8: a second Kangen from the same sender that day saves but awards 0', !k2.error && (await xpOf(P1.cid)) === 44, describe(k2))
  const k3 = await kangen(B, P1.cid, A.id)
  ok('a Kangen from the other partner awards 3', !k3.error && (await xpOf(P1.cid)) === 47, describe(k3))
  const stGlow = await status(A)
  ok('gate 14: glowing at 47 warmth in 72 h with both contributing', stGlow.data?.mood === 'glowing' && stGlow.data?.warmth_72h === 47, describe(stGlow))

  // ================= gate 7: the couple cap of 50 =================
  const pet3 = (await petOf(P3.cid))?.id
  const E2 = P3.a
  const F2 = P3.b
  await hi(E2); await hi(F2)
  await mom(E2, P3.cid, 'Bakso at noon'); await mom(F2, P3.cid, 'Kopi susu run')
  const letter = (u, cid, to, content = 'A letter for later') => u.client.from('letters').insert({
    couple_id: cid, sender_id: u.id, receiver_id: to, content, unlock_date: new Date(Date.now() + 86400000).toISOString() }).select('id').single()
  await letter(E2, P3.cid, F2.id)                                  // 43
  const lF = await letter(F2, P3.cid, E2.id)                       // 8, clamped to 7
  const clamped = (await ledger(pet3)).find((e) => e.ref_id === lF.data?.id)
  ok('gate 7: an award that crosses 50 is clamped to what is left (7 of 8)', clamped?.points === 7 && (await todaySum(pet3)) === 50, JSON.stringify(clamped))
  await E2.client.from('gratitude_notes').insert({ couple_id: P3.cid, from_id: E2.id, to_id: F2.id, body: 'Thanks for the soup' })
  await E2.client.from('mood_checkins').insert({ couple_id: P3.cid, profile_id: E2.id, mood: 'senang' })
  await kangen(E2, P3.cid, F2.id)
  await E2.client.from('daily_responses').insert({ couple_id: P3.cid, profile_id: E2.id, question_index: 1, answer: 'Nasi goreng' })
  await E2.client.from('bucket_items').insert({ couple_id: P3.cid, created_by: E2.id, title: 'Climb Papandayan' })
  const p3 = await petOf(P3.cid)
  ok('gate 7: after the cap, Jar, mood, Kangen, daily answer and plans add nothing; the day stays at 50',
    p3?.xp === 50 && (await todaySum(pet3)) === 50, `xp=${p3?.xp}`)
  const maxDay = psql(`select 'R|m|' || json_build_object('max', coalesce(max(s), 0), 'over', count(*) filter (where s > 50))::text
    from (select pet_id, day, sum(points) s from public.pet_warmth_events where source <> 'legacy' group by pet_id, day) x;`, 'daily max')
  ok('gate 7: no pet in the database has more than 50 non-legacy warmth on any Jakarta day', maxDay.m?.over === 0 && maxDay.m?.max <= 50, JSON.stringify(maxDay.m))

  // ================= every other source, with its cap =================
  const M = P7.a
  const N = P7.b
  const m7 = await mom(M, P7.cid, 'Sate by the river')
  for (let i = 0; i < 4; i++) await (i % 2 ? N : M).client.from('moment_comments').insert({ moment_id: m7.data?.id, couple_id: P7.cid, profile_id: (i % 2 ? N : M).id, body: `Comment ${i}` })
  await N.client.from('moment_reactions').insert({ moment_id: m7.data?.id, couple_id: P7.cid, profile_id: N.id, emoji: '🔥' })
  const l7a = await ledger(pet7)
  ok('Moment social: comments and reactions pay 2 each, 3 a day per couple', l7a.filter((e) => e.source === 'moment_social').map((e) => e.points).join() === '2,2,2'
    && (await xpOf(P7.cid)) === 16, JSON.stringify(l7a.map((e) => [e.source, e.points])))
  const jar = (u, cid, to) => u.client.from('gratitude_notes').insert({ couple_id: cid, from_id: u.id, to_id: to, body: 'Thank you for today' })
  await jar(M, P7.cid, N.id); await jar(M, P7.cid, N.id); await jar(N, P7.cid, M.id)
  ok('Jar: 5 per person, once a day', (await xpOf(P7.cid)) === 26)
  const daily = (u, cid) => u.client.from('daily_responses').insert({ couple_id: cid, profile_id: u.id, question_index: 2, answer: 'Sunsets at Ancol' })
  await daily(M, P7.cid); await daily(N, P7.cid)
  ok('Daily answer: 4 per person', (await xpOf(P7.cid)) === 34)
  const lt1 = await letter(M, P7.cid, N.id, 'SENTINEL letter body')
  await letter(M, P7.cid, N.id)
  ok('Letter: 8 once per person per day', !lt1.error && (await xpOf(P7.cid)) === 42)
  // Samakan v2 (migration 20261104121000), when present: only a finished set pays.
  if (psql(`select 'R|t|' || json_build_object('ok', to_regclass('public.samakan_sets') is not null)::text;`, 'samakan check').t?.ok) {
    const open = await admin.from('samakan_sets').insert({ couple_id: P7.cid, created_by: M.id, source: 'bank', theme: 'food' }).select('id').single()
    await admin.from('activities').insert({ couple_id: P7.cid, actor_id: M.id, kind: 'samakan', ref_id: open.data?.id, summary: 'started a Samakan set', url: '/app/games/samakan' })
    ok('Samakan v2: starting a set pays nothing', !open.error && (await xpOf(P7.cid)) === 42, describe(open))
    await admin.from('samakan_sets').update({ status: 'done', finished_at: new Date().toISOString(), finished_by: N.id }).eq('id', open.data?.id)
    await admin.from('activities').insert({ couple_id: P7.cid, actor_id: N.id, kind: 'samakan', ref_id: open.data?.id, summary: 'finished a Samakan set: 4 of 7 matches', url: '/app/games/samakan' })
    await admin.from('activities').insert({ couple_id: P7.cid, actor_id: N.id, kind: 'samakan', ref_id: open.data?.id, summary: 'finished a Samakan set: 4 of 7 matches', url: '/app/games/samakan' })
    const s7 = (await ledger(pet7)).filter((e) => e.source === 'game')
    ok('Samakan v2: a finished set pays 8 once, to whoever finished it', (await xpOf(P7.cid)) === 50 && s7.length === 1 && s7[0].detail === 'samakan' && s7[0].actor_id === N.id, JSON.stringify(s7))
  } else {
    evidence.push('samakan_sets not present: Samakan v2 path not exercised')
  }

  const O = P8.a
  const Pp = P8.b
  const pet8 = (await petOf(P8.cid))?.id
  await O.client.from('couple_events').insert({ couple_id: P8.cid, title: 'Anniversary dinner', event_date: today(), event_type: 'date', created_by: O.id })
  const b1 = await O.client.from('bucket_items').insert({ couple_id: P8.cid, created_by: O.id, title: 'See Bromo at sunrise' }).select('id').single()
  const b2 = await Pp.client.from('bucket_items').insert({ couple_id: P8.cid, created_by: Pp.id, title: 'Learn to make rendang' }).select('id').single()
  const b3 = await Pp.client.from('bucket_items').insert({ couple_id: P8.cid, created_by: Pp.id, title: 'Night market in Solo' }).select('id').single()
  ok('Plans: calendar events and bucket adds pay 2, twice a day per couple', (await xpOf(P8.cid)) === 4)
  const done = (u, id, v = true) => u.client.from('bucket_items').update({ is_done: v }).eq('id', id)
  await done(O, b1.data?.id)
  ok('Bucket done: 10', (await xpOf(P8.cid)) === 14)
  await done(O, b1.data?.id, false); await done(Pp, b1.data?.id, true)
  ok('a bucket item checked again does not pay twice', (await xpOf(P8.cid)) === 14)
  await done(Pp, b2.data?.id); await done(Pp, b3.data?.id)
  ok('Bucket done: 2 a day per couple', (await xpOf(P8.cid)) === 24)
  const tx = (u, amount, type) => u.client.from('couple_transactions').insert({ couple_id: P8.cid, created_by: u.id, amount, type })
  await tx(O, -20000, 'withdrawal')
  ok('Savings: money out pays nothing', (await xpOf(P8.cid)) === 24)
  await tx(O, 50000, 'deposit'); await tx(Pp, 1, 'deposit')
  ok('Savings: money in pays 4, once a day per couple, whatever the amount', (await xpOf(P8.cid)) === 28)
  const l8 = await ledger(pet8)
  ok('every ledger row of a source event carries the event id (dedupe key)', l8.every((e) => e.ref_id), JSON.stringify(l8.map((e) => e.source)))
  const [hO, hP] = await Promise.all([hi(O, 'pat'), hi(Pp, 'play')])
  ok('both partners say hi at the same instant: +15 in total, exactly one gets the both-of-you bonus',
    hO.data?.counted && hP.data?.counted && hO.data.points + hP.data.points === 15 && [hO.data.points, hP.data.points].sort().join() === '10,5'
    && (await xpOf(P8.cid)) === 43, `${describe(hO)} ${describe(hP)}`)

  // ================= gate 9: games =================
  const D = P2.b
  const pet2 = (await petOf(P2.cid))?.id
  const gs = await admin.from('game_sessions').insert({ couple_id: P2.cid, created_by: C.id, partner_id: D.id, status: 'playing', round_types: ['tebak_pasangan'] }).select('id').single()  // copy-ok: stored value
  ok('set-up: a legacy Samakan session', !gs.error, describe(gs))
  await admin.from('game_sessions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', gs.data?.id)
  const g1 = (await ledger(pet2)).filter((e) => e.source === 'game')
  ok('gate 9: a Samakan session moving to completed awards 8, credited to its creator', (await xpOf(P2.cid)) === 8 && g1[0]?.detail === 'samakan' && g1[0]?.actor_id === C.id, JSON.stringify(g1))
  await admin.from('game_sessions').update({ status: 'playing' }).eq('id', gs.data?.id)
  await admin.from('game_sessions').update({ status: 'completed' }).eq('id', gs.data?.id)
  ok('gate 9: completing the same session again awards 0', (await xpOf(P2.cid)) === 8)
  const tt = await C.client.rpc('two_truths_create', { p_statements: ['I love durian', 'I have been to Raja Ampat', 'I can whistle'], p_lie_index: 1, p_story: null })
  ok('gate 9: a Two Truths round awards 5', !tt.error && (await xpOf(P2.cid)) === 13, describe(tt))
  const ttg = await D.client.rpc('two_truths_guess', { p_round_id: tt.data, p_index: 1 })
  ok('gate 9: the guess on the same round (second feed row, same round id) awards 0', !ttg.error && (await xpOf(P2.cid)) === 13, describe(ttg))
  await admin.from('activities').insert({ couple_id: P2.cid, actor_id: D.id, kind: 'samakan', ref_id: randomUUID(), summary: 'started a Samakan set', url: '/app/games/samakan' })
  await admin.from('activities').insert({ couple_id: P2.cid, actor_id: D.id, kind: 'samakan', summary: 'wants to play Samakan now', url: '/app/games/samakan' })
  ok('a Samakan v2 feed row for a set that is not done (start, live invite) pays nothing', (await xpOf(P2.cid)) === 13)
  await C.client.rpc('complete_deep_talk_level', { p_pack_id: '66666666-0000-4000-8000-000000000001', p_level_number: 1 })
  ok('game cap: the third game of the day is clamped to 20 game warmth (Deep Talk gives 7 of 10)', (await xpOf(P2.cid)) === 20)
  const tt2 = await D.client.rpc('two_truths_create', { p_statements: ['One', 'Two', 'Three'], p_lie_index: 0, p_story: null })
  ok('game cap: a fourth game that day awards 0', !tt2.error && (await xpOf(P2.cid)) === 20, describe(tt2))

  const Q = P9.a
  const R = P9.b
  const pack = '66666666-0000-4000-8000-000000000001'
  const dt1 = await Q.client.rpc('complete_deep_talk_level', { p_pack_id: pack, p_level_number: 1 })
  ok('gate 9: a newly completed Deep Talk level awards 10', !dt1.error && (await xpOf(P9.cid)) === 10, describe(dt1))
  await Q.client.rpc('complete_deep_talk_level', { p_pack_id: pack, p_level_number: 1 })
  ok('gate 9: completing the same Deep Talk level again awards 0', (await xpOf(P9.cid)) === 10)
  await admin.from('deep_talk_progress').delete().eq('couple_id', P9.cid)
  await Q.client.rpc('complete_deep_talk_level', { p_pack_id: pack, p_level_number: 1 })
  ok('a deleted and re-created Deep Talk progress row does not pay level 1 again', (await xpOf(P9.cid)) === 10)
  await Q.client.rpc('complete_deep_talk_level', { p_pack_id: pack, p_level_number: 2 })
  ok('Deep Talk level 2 awards 10 (20 game warmth)', (await xpOf(P9.cid)) === 20)
  await hi(Q)
  await mom(Q, P9.cid, 'Pempek after work'); await mom(Q, P9.cid, 'Rain on the roof')
  const stOne = await status(R)
  ok('gate 14: 45 warmth from one partner only is cozy, not glowing', stOne.data?.warmth_72h === 45 && stOne.data?.mood === 'cozy', describe(stOne))
  await hi(R)
  ok('gate 14: once the other partner contributes too, glowing', (await status(R)).data?.mood === 'glowing')
  const S = P4.a
  await mom(S, P4.cid, 'Solo walk at GBK'); await mom(S, P4.cid, 'New plant')
  for (const t of ['Visit Ubud', 'Swim at Pink Beach']) {
    const b = await S.client.from('bucket_items').insert({ couple_id: P4.cid, created_by: S.id, title: t }).select('id').single()
    await done(S, b.data?.id)
  }
  const stSolo = await status(S)
  ok('gate 14: a solo couple glows at 45+ alone', stSolo.data?.warmth_72h >= 45 && stSolo.data?.mood === 'glowing', describe(stSolo))

  // ================= gate 10: a failing pet never blocks the event =================
  const xp2 = await xpOf(P2.cid)
  const fault = psql(`begin;
set local lock_timeout = '20s';
create or replace function public.pet_award(p_couple uuid, p_actor uuid, p_source text, p_ref_id uuid default null,
  p_detail text default null, p_gesture text default null) returns integer language plpgsql as $f$
begin raise exception 'forced pet failure'; end $f$;
set local request.jwt.claims = ${q(JSON.stringify({ sub: C.id, role: 'authenticated' }))};
set local role authenticated;
insert into public.moments (couple_id, created_by, title, moment_date) values (${q(P2.cid)}, ${q(C.id)}, 'Fault test moment', current_date);
insert into public.letters (couple_id, sender_id, receiver_id, content, unlock_date) values (${q(P2.cid)}, ${q(C.id)}, ${q(D.id)}, 'Fault test letter', now() + interval '1 day');
insert into public.miss_you (couple_id, sender_id, receiver_id) values (${q(P2.cid)}, ${q(C.id)}, ${q(D.id)});
reset role;
select 'R|forced|' || json_build_object(
  'moments', (select count(*) from public.moments where couple_id = ${q(P2.cid)} and title = 'Fault test moment'),
  'letters', (select count(*) from public.letters where couple_id = ${q(P2.cid)} and content = 'Fault test letter'),
  'kangen', (select count(*) from public.miss_you where couple_id = ${q(P2.cid)} and sender_id = ${q(C.id)}),
  'xp', (select xp from public.couple_pets where couple_id = ${q(P2.cid)}))::text;
rollback;
begin;
set local lock_timeout = '20s';
-- The real pet_award, failing inside (its own handler must swallow it).
alter table public.pet_warmth_events add constraint pet_verify_fail check (false) not valid;
set local request.jwt.claims = ${q(JSON.stringify({ sub: D.id, role: 'authenticated' }))};
set local role authenticated;
insert into public.moments (couple_id, created_by, title, moment_date) values (${q(P2.cid)}, ${q(D.id)}, 'Fault test inner', current_date);
reset role;
select 'R|inner|' || json_build_object(
  'moments', (select count(*) from public.moments where couple_id = ${q(P2.cid)} and title = 'Fault test inner'),
  'xp', (select xp from public.couple_pets where couple_id = ${q(P2.cid)}),
  'sum', (select sum(points) from public.pet_warmth_events where couple_id = ${q(P2.cid)}))::text;
rollback;`, 'fault injection')
  ok('gate 10: with pet_award forced to raise, a Moment, a letter and a Kangen still save',
    fault.forced?.moments === 1 && fault.forced?.letters === 1 && fault.forced?.kangen === 1 && fault.forced?.xp === xp2, JSON.stringify(fault.forced))
  ok('gate 10: an error inside pet_award returns 0 and leaves no half-written warmth',
    fault.inner?.moments === 1 && fault.inner?.xp === xp2 && Number(fault.inner?.sum) === xp2, JSON.stringify(fault.inner))
  // Another session holds the pet row: the Moment waits at most ~2 s, saves, and simply earns nothing.
  const holder = spawn('docker', ['exec', '-i', 'supabase_db_couple-app', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-q'], { stdio: ['pipe', 'ignore', 'ignore'] })
  const held = new Promise((r) => holder.on('close', r))
  holder.stdin.end(`begin; select 1 from public.couple_pets where id = ${q(pet2)} for update; select pg_sleep(6); rollback;`)
  await sleep(1000)
  const tLock = Date.now()
  const mLock = await mom(C, P2.cid, 'Moment while the pet is busy')
  const took = Date.now() - tLock
  ok('gate 10: a pet row locked elsewhere delays a Moment by the 2 s bound at most; the Moment saves without warmth',
    !mLock.error && took < 5000 && (await xpOf(P2.cid)) === xp2 && !(await ledger(pet2)).some((e) => e.ref_id === mLock.data?.id), `${describe(mLock)} took=${took}ms`)
  await held
  // Three Moments at the same moment: the cap of 2 holds under concurrency.
  await Promise.all([mom(C, P2.cid, 'Parallel one'), mom(D, P2.cid, 'Parallel two'), mom(C, P2.cid, 'Parallel three')])
  ok('three Moments at once: exactly 2 pay (+20)', (await xpOf(P2.cid)) === xp2 + 20, String(await xpOf(P2.cid)))

  // ================= gate 11: no pet =================
  const H = P5.a
  const I = P5.b
  const n1 = await mom(H, P5.cid, 'No pet moment')
  const n2 = await H.client.from('mood_checkins').insert({ couple_id: P5.cid, profile_id: H.id, mood: 'biasa' })
  const n3 = await kangen(H, P5.cid, I.id)
  const n4 = await letter(H, P5.cid, I.id)
  const { count: noPetRows } = await admin.from('pet_warmth_events').select('*', { count: 'exact', head: true }).eq('couple_id', P5.cid)
  ok('gate 11: a couple with no pet saves Moments, moods, Kangen, letters with no ledger rows and no errors',
    !n1.error && !n2.error && !n3.error && !n4.error && noPetRows === 0, `${describe(n1)} ${describe(n2)} ${describe(n3)} ${describe(n4)}`)

  // ================= level up: an imported pet one hi from level 2 =================
  const imp = await admin.from('couple_pets').insert({ couple_id: P5.cid, pet_type: 'dog', name: 'Kopi', xp: 95, level: 1 }).select('*').single()
  const impLedger = await ledger(imp.data?.id)
  ok('a pet inserted with XP (service role import) gets a legacy row equal to its XP, and no adoption line',
    !imp.error && impLedger.length === 1 && impLedger[0].source === 'legacy' && impLedger[0].points === 95, `${describe(imp)} ${JSON.stringify(impLedger)}`)
  const up = await hi(H, 'pat')
  const { data: upAct } = await admin.from('activities').select('actor_id, summary').eq('couple_id', P5.cid).eq('kind', 'pet').like('summary', 'helped%')
  ok('crossing 100 levels the pet up (2) and writes "helped Kopi reach level 2" for the actor',
    up.data?.leveled_up === true && up.data?.level === 2 && up.data?.xp === 100 && upAct?.length === 1
    && upAct[0].summary === 'helped Kopi reach level 2' && upAct[0].actor_id === H.id, `${describe(up)} ${JSON.stringify(upAct)}`)

  // ================= gate 12: RLS and grants =================
  const deny = (r) => !!r.error || (r.data ?? []).length === 0
  const evRow = (await ledger(pet1))[0]
  ok('gate 12: member INSERT into pet_warmth_events rejected',
    !!(await A.client.from('pet_warmth_events').insert({ pet_id: pet1, couple_id: P1.cid, source: 'hi', points: 50 })).error)
  ok('gate 12: member UPDATE of pet_warmth_events rejected', deny(await A.client.from('pet_warmth_events').update({ points: 999 }).eq('id', evRow.id).select('id')))
  ok('gate 12: member DELETE of pet_warmth_events rejected', deny(await A.client.from('pet_warmth_events').delete().eq('id', evRow.id).select('id')))
  ok('ledger untouched by member writes', (await ledger(pet1)).find((e) => e.id === evRow.id)?.points === evRow.points)
  ok('gate 12: member INSERT into pet_daily_notes rejected',
    !!(await A.client.from('pet_daily_notes').insert({ pet_id: pet1, couple_id: P1.cid, note_date: today(), status: 'ready', source: 'template', line: 'Hi' })).error)
  const pet6 = randomUUID()
  const imp6 = await admin.from('couple_pets').insert({ id: pet6, couple_id: P6.cid, pet_type: 'cat', name: 'Mochi', level: 13, xp: 1234, created_at: '2026-06-01T03:00:00Z', hatched_at: '2026-06-01T03:00:00Z' })
  await admin.from('pet_mood_state').insert({ pet_id: pet6, mood: 'happy', hunger: 64, happiness: 71, cleanliness: 58 })
  await admin.from('pet_care_roles').insert([{ couple_id: P6.cid, pet_id: pet6, profile_id: J.id, actions: ['feed', 'treat', 'bath'] },
    { couple_id: P6.cid, pet_id: pet6, profile_id: K.id, actions: ['play', 'walk', 'cuddle'] }])
  await admin.from('pet_care_logs').insert(Array.from({ length: 12 }, (_, g) => ({ pet_id: pet6, action_type: ['feed', 'play', 'bath'][g % 3], done_by: g % 2 ? J.id : K.id,
    done_at: new Date(Date.now() - (g + 1) * 3 * 3600000).toISOString() })))
  ok('set-up: an old-style pet with roles, mood and logs (service role)', !imp6.error, describe(imp6))
  const roleRow = (await admin.from('pet_care_roles').select('id, actions').eq('pet_id', pet6).eq('profile_id', K.id).single()).data
  ok('gate 12: a member can no longer rewrite care roles (update)', deny(await K.client.from('pet_care_roles').update({ actions: ['feed', 'play', 'bath', 'treat', 'walk', 'cuddle'] }).eq('id', roleRow.id).select('id')))
  ok('gate 12: ... nor insert', !!(await K.client.from('pet_care_roles').insert({ couple_id: P6.cid, pet_id: pet6, profile_id: K.id, actions: ['feed'] })).error)
  ok('gate 12: ... nor delete', deny(await K.client.from('pet_care_roles').delete().eq('pet_id', pet6).select('id')))
  ok('care roles unchanged', JSON.stringify((await admin.from('pet_care_roles').select('actions').eq('id', roleRow.id).single()).data?.actions) === JSON.stringify(roleRow.actions))
  ok('gate 12: a member can no longer delete the pet', deny(await J.client.from('couple_pets').delete().eq('id', pet6).select('id')))
  const { count: logs6 } = await admin.from('pet_care_logs').select('*', { count: 'exact', head: true }).eq('pet_id', pet6)
  ok('the pet and its whole history survive the delete attempt', !!(await petOf(P6.cid)) && logs6 === 12, String(logs6))
  ok('old mood rows and logs are read-only for members',
    !!(await J.client.from('pet_mood_state').insert({ pet_id: pet6, updated_at: new Date().toISOString() })).error
    && deny(await J.client.from('pet_mood_state').update({ hunger: 100 }).eq('pet_id', pet6).select('id'))
    && deny(await J.client.from('pet_mood_state').delete().eq('pet_id', pet6).select('id'))
    && !!(await J.client.from('pet_care_logs').insert({ pet_id: pet6, action_type: 'feed', done_by: J.id })).error
    && deny(await J.client.from('pet_care_logs').delete().eq('pet_id', pet6).select('id')))
  ok('XP, level and hatched_at are not writable by members',
    deny(await A.client.from('couple_pets').update({ xp: 9999 }).eq('id', pet1).select('id'))
    && deny(await A.client.from('couple_pets').update({ level: 40 }).eq('id', pet1).select('id'))
    && deny(await A.client.from('couple_pets').update({ hatched_at: null }).eq('id', pet1).select('id'))
    && (await xpOf(P1.cid)) === 47)
  const ren = await B.client.from('couple_pets').update({ name: '  Kopi ' }).eq('id', pet1).select('name')
  const { data: renAct } = await admin.from('activities').select('actor_id, summary').eq('couple_id', P1.cid).like('summary', 'renamed%')
  ok('gate 12: update couple_pets set name succeeds (trimmed) and writes "renamed the pet to Kopi"',
    !ren.error && ren.data?.[0]?.name === 'Kopi' && renAct?.length === 1 && renAct[0].summary === 'renamed the pet to Kopi' && renAct[0].actor_id === B.id,
    `${describe(ren)} ${JSON.stringify(renAct)}`)
  ok('rename to an empty or 21-character name is rejected',
    (await B.client.from('couple_pets').update({ name: '  ' }).eq('id', pet1)).error?.hint === 'PET_INVALID'
    && (await B.client.from('couple_pets').update({ name: 'y'.repeat(21) }).eq('id', pet1)).error?.hint === 'PET_INVALID')
  const direct = await P9.a.client.from('couple_pets').insert({ couple_id: P9.cid, pet_type: 'dog', name: 'Dua' })
  ok('a second pet per couple is rejected', !!direct.error)
  ok('a client insert with XP is rejected (only couple, type and name are insertable)',
    !!(await P8.a.client.from('couple_pets').insert({ couple_id: P8.cid, pet_type: 'cat', name: 'Kaya', xp: 500 })).error)
  ok('member cannot call pet_award or pet_claim_note',
    !!(await A.client.rpc('pet_award', { p_couple: P1.cid, p_actor: A.id, p_source: 'moment' })).error
    && !!(await A.client.rpc('pet_claim_note', { p_pet_id: pet1 })).error)
  for (const [table, filter] of [['pet_warmth_events', 'pet_id'], ['pet_daily_notes', 'pet_id'], ['couple_pets', 'id'], ['pet_visits', 'pet_id']]) {
    const r = await C.client.from(table).select('*').eq(filter, pet1)
    ok(`outsider sees nothing in ${table}`, !!r.error || (r.data ?? []).length === 0, describe(r))
    const a = await anon.from(table).select('*').eq(filter, pet1)
    ok(`anon sees nothing in ${table}`, !!a.error || (a.data ?? []).length === 0, describe(a))
  }
  ok('outsider cannot say hi to, visit or read another couple\'s pet',
    !!(await C.client.rpc('pet_mark_visit', { p_pet_id: pet1 })).error && !!(await C.client.rpc('perform_pet_care', { p_pet_id: pet1, p_action: 'feed' })).error)
  ok('anon cannot call the pet RPCs', !!(await anon.rpc('pet_say_hi', { p_gesture: 'pat' })).error && !!(await anon.rpc('adopt_pet', { p_type: 'cat', p_name: 'X' })).error)
  ok('realtime: an outsider subscribed to the same pet heard nothing', heardC.length === 0, `${heardC.length} events`)
  await B.client.removeChannel(chB); await C.client.removeChannel(chC)

  // ================= gate 13: the perform_pet_care shim =================
  const c1 = await J.client.rpc('perform_pet_care', { p_pet_id: pet6, p_action: 'play' })   // K's job in the old roles
  ok('gate 13: perform_pet_care returns hunger, happiness, cleanliness, mood and ignores the old roles',
    !c1.error && c1.data?.hunger === 100 && c1.data?.happiness === 100 && c1.data?.cleanliness === 100 && c1.data?.mood === 'thriving', describe(c1))
  const c2 = await J.client.rpc('perform_pet_care', { p_pet_id: pet6, p_action: 'play' })
  ok('gate 13: calling it again right away raises no cooldown error', !c2.error && c2.data?.mood === 'thriving', describe(c2))
  const hi6 = (await ledger(pet6)).filter((e) => e.source === 'hi')
  ok('gate 13: it counts as that user\'s hi (play gesture), once', hi6.length === 1 && hi6[0].actor_id === J.id && hi6[0].gesture === 'play' && (await xpOf(P6.cid)) === 1239, JSON.stringify(hi6))
  await K.client.rpc('perform_pet_care', { p_pet_id: pet6, p_action: 'bath' })
  const p6 = await petOf(P6.cid)
  ok('the partner\'s old-style tap is their hi (+5 +5 both); level 13 is kept', p6?.xp === 1249 && p6?.level === 13, JSON.stringify(p6))
  ok('the shim writes nothing to the old tables', (await admin.from('pet_care_logs').select('*', { count: 'exact', head: true }).eq('pet_id', pet6)).count === 12)

  // ================= visits =================
  const v1 = await J.client.rpc('pet_mark_visit', { p_pet_id: pet6 })
  ok('first visit: starts at the current level, intro not seen, no previous visit',
    !v1.error && v1.data?.first_visit === true && v1.data?.celebrated_level === 13 && v1.data?.intro_seen_at === null && v1.data?.previous_seen_at === null, describe(v1))
  const v2 = await J.client.rpc('pet_mark_visit', { p_pet_id: pet6, p_intro_seen: true, p_celebrated_level: 99 })
  ok('intro marked seen once; celebrated_level never passes the level',
    !v2.error && v2.data?.first_visit === false && !!v2.data?.intro_seen_at && v2.data?.celebrated_level === 13 && v2.data?.previous_seen_at === v1.data?.last_seen_at, describe(v2))
  const v3 = await J.client.rpc('pet_mark_visit', { p_pet_id: pet6, p_celebrated_level: 3 })
  ok('celebrated_level never goes down; intro stays seen', v3.data?.celebrated_level === 13 && v3.data?.intro_seen_at === v2.data?.intro_seen_at, describe(v3))
  const vK = await K.client.from('pet_visits').select('*')
  ok('pet_visits: own rows only (the partner does not see mine)', !vK.error && (vK.data ?? []).length === 0, describe(vK))
  ok('pet_visits: no direct client writes', !!(await J.client.from('pet_visits').insert({ pet_id: pet6, profile_id: K.id })).error
    && deny(await J.client.from('pet_visits').update({ celebrated_level: 1 }).eq('pet_id', pet6).select('pet_id')))
  const st6 = await status(K, pet6)
  ok('status of the migrated pet: migrated (intro once per person), home, Grown', st6.data?.migrated === true && st6.data?.hatched === true && st6.data?.stage === 'grown', describe(st6))

  // ================= the daily note claim (service role) =================
  const cl1 = await admin.rpc('pet_claim_note', { p_pet_id: pet1 })
  const cl2 = await admin.rpc('pet_claim_note', { p_pet_id: pet1 })
  ok('note claim: the first caller claims, the next one is told someone is on it',
    cl1.data?.claimed === true && cl1.data?.attempt === 1 && cl1.data?.note?.status === 'pending' && cl2.data?.claimed === false && cl2.data?.reason === 'busy',
    `${describe(cl1)} ${describe(cl2)}`)
  // Age the claim with triggers off (touch_updated_at would stamp it now()).
  const ageClaim = () => psql(`set session_replication_role = replica;
    update public.pet_daily_notes set updated_at = now() - interval '21 seconds' where pet_id = ${q(pet1)} and note_date = ${q(today())};`, 'age claim')
  ageClaim()
  const cl3 = await admin.rpc('pet_claim_note', { p_pet_id: pet1 })
  ageClaim()
  const cl4 = await admin.rpc('pet_claim_note', { p_pet_id: pet1 })
  ok('note claim: a stale claim is taken over once, then attempts are used up (max 2 a day)',
    cl3.data?.claimed === true && cl3.data?.attempt === 2 && cl4.data?.claimed === false && cl4.data?.reason === 'attempts', `${describe(cl3)} ${describe(cl4)}`)
  const noUsage = await admin.from('pet_daily_notes').update({ status: 'ready', source: 'ai', line: 'Three Kangens before lunch. I counted.' }).eq('pet_id', pet1).select('pet_id')
  ok('an AI note without its token and cost columns is rejected', !!noUsage.error, describe(noUsage))
  const saved = await admin.from('pet_daily_notes').update({ status: 'ready', source: 'ai', line: 'Three Kangens before lunch. I counted.', title: '', highlight: 'Kangen',
    pose: 'cozy', model: 'claude-sonnet-5-5', input_tokens: 350, cache_read_tokens: 1100, cache_write_tokens: 0, output_tokens: 90, cost_usd: 0.0018 }).eq('pet_id', pet1).select('*')
  ok('the server saves a ready AI note with usage', !saved.error && saved.data?.[0]?.status === 'ready', describe(saved))
  ok('note claim: once ready, nobody claims again', (await admin.rpc('pet_claim_note', { p_pet_id: pet1 })).data?.reason === 'ready')
  const notesA = await A.client.from('pet_daily_notes').select('line')
  const notesC = await C.client.from('pet_daily_notes').select('line')
  ok('both partners read the note; an outsider does not', notesA.data?.[0]?.line === 'Three Kangens before lunch. I counted.' && (notesC.data ?? []).length === 0)
  const tomorrow = new Date(Date.parse(`${today()}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)  // Jakarta today + 1
  await admin.from('pet_daily_notes').insert({ pet_id: pet1, couple_id: P1.cid, note_date: tomorrow, status: 'pending', attempts: 1, cost_usd: 0.015,
    updated_at: new Date(Date.now() - 60000).toISOString() })
  ok('note claim: no call once the day\'s cost reached $0.015', (await admin.rpc('pet_claim_note', { p_pet_id: pet1, p_note_date: tomorrow })).data?.reason === 'budget')
  const pet4 = (await petOf(P4.cid))?.id
  psql(`update public.pet_warmth_events set created_at = created_at - interval '8 days' where pet_id = ${q(pet4)};`, 'quiet couple')
  const quiet = await admin.rpc('pet_claim_note', { p_pet_id: pet4 })
  ok('note claim: no call (template) when the couple earned nothing in 7 days', quiet.data?.claimed === false && quiet.data?.reason === 'quiet', describe(quiet))
  ok('a member cannot write a note', deny(await A.client.from('pet_daily_notes').update({ line: 'hacked' }).eq('pet_id', pet1).select('pet_id')))

  // ================= gate 14 (window) + Jakarta day boundary =================
  psql(`update public.pet_warmth_events set created_at = created_at - interval '73 hours',
        day = ((created_at - interval '73 hours') at time zone 'Asia/Jakarta')::date where pet_id = ${q(pet1)};`, 'age P1')
  const stOld = await status(A)
  ok('gate 14: warmth older than 72 h no longer counts: dozy below 8', stOld.data?.mood === 'dozy' && stOld.data?.warmth_72h === 0, describe(stOld))
  const newDay = await hi(A, 'pat')
  ok('caps are per Jakarta day: on a new day the hi counts again', newDay.data?.counted === true && newDay.data?.points === 5, describe(newDay))
  ok('dozy is woken by any event: still dozy at 5, cozy once past 8', (await status(A)).data?.mood === 'dozy'
    && !(await mom(B, P1.cid, 'Coffee at Kemang')).error && (await status(A)).data?.mood === 'cozy')

  // ================= gate 3: the ledger equals XP, everywhere =================
  const inv = psql(`select 'R|inv|' || json_build_object(
    'pets', count(*),
    'sum_mismatch', count(*) filter (where c.xp <> coalesce(s.total, 0)),
    'level_mismatch', count(*) filter (where c.level <> c.xp / 100 + 1),
    'mine_level_mismatch', count(*) filter (where c.level <> c.xp / 100 + 1 and c.couple_id = any (${q(`{${[...couples].join(',')}}`)}::uuid[])),
    'negative', (select count(*) from public.pet_warmth_events where points < 0))::text
    from public.couple_pets c left join (select pet_id, sum(points) total from public.pet_warmth_events group by pet_id) s on s.pet_id = c.id;`, 'invariant')
  ok('gate 3: for every pet, sum(pet_warmth_events.points) = couple_pets.xp', inv.inv?.sum_mismatch === 0 && inv.inv?.negative === 0, JSON.stringify(inv.inv))
  ok('gate 3: for every pet, level = floor(xp/100) + 1', inv.inv?.level_mismatch === 0, JSON.stringify(inv.inv))

  // ================= account deletion keeps the couple's warmth =================
  const before1 = await xpOf(P1.cid)
  await admin.auth.admin.deleteUser(B.id)
  created.splice(created.indexOf(B.id), 1)
  const after1 = await ledger(pet1)
  ok('deleting an account keeps the partner\'s pet and ledger (actor becomes null), sum still = xp',
    (await xpOf(P1.cid)) === before1 && after1.some((e) => e.actor_id === null) && after1.reduce((s, e) => s + e.points, 0) === before1)

  // ================= gate 30: rules in sync =================
  const rules = spawnSync(process.execPath, [join(here, 'pet-rules.mjs')], { cwd: root, encoding: 'utf8' })
  ok('gate 30: pet-rules.mjs prints PET RULES IN SYNC', /PET RULES IN SYNC/.test(rules.stdout), `${rules.stdout}${rules.stderr}`.slice(-400))

  evidence.push(`hi: A +5, again counted=false; B +10 (both) -> 15; Moments 10/10/0; caps hold (max ${maxDay.m?.max}/day); ledger = xp on ${inv.inv?.pets} pets`)
}

try { await main() } catch (e) { failures.push(`crash: ${e.stack ?? e.message}`) }
finally {
  const { data: leftovers } = await admin.from('couple_members').select('couple_id').in('profile_id', created)
  for (const m of leftovers ?? []) couples.add(m.couple_id)
  for (const id of couples) await admin.from('couples').delete().eq('id', id)
  for (const id of created) await admin.auth.admin.deleteUser(id)
}

for (const e of evidence) console.log(`EVIDENCE ${e}`)
console.log(`${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`FAIL ${f}`)
if (failures.length) process.exit(1)
console.log('pet remake verification passed')
process.exit(0)
