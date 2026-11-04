// Layout audit: every page at phone widths, with long content, empty content
// and a partner-less user. Looks for things a person would see as "broken":
//   - text drawn over other text or over a control (overlap)
//   - horizontal scrolling of the whole page
//   - clipped text (overflow hidden, no ellipsis / line-clamp)
//   - content that can never be scrolled out from under the bottom nav
//   - sheets/modals that don't fit the screen or overlap inside
//   - console errors / page crashes
//
//   node scripts/verify/layout-audit.mjs [--only=/app/home,/app/mood] [--widths=360,390] [--keep]
//
// Needs the dev server on :3030 and local Supabase. Report + screenshots go to
// .unlazy/layout-audit/. Prints "LAYOUT AUDIT PASSED" when nothing is found.
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')
const { createServerClient } = require('@supabase/ssr')
const { chromium } = require('playwright')

const env = {}
for (const f of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  const p = join(root, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(URL_ ?? '')) {
  console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not local (${URL_})`)
  process.exit(1)
}
const APP = 'http://localhost:3030'
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true] }))
const WIDTHS = String(args.widths ?? '360,390').split(',').map(Number)
const ONLY = args.only ? String(args.only).split(',') : null
const OUT = join(root, '.unlazy', 'layout-audit')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const mk = () => createClient(URL_, ANON, opts)
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts)
const PASSWORD = 'layout-audit-123'
const created = []
const couples = []
const jpeg = new Blob([readFileSync(join(here, 'fixtures', 'moment-gps.jpg'))], { type: 'image/jpeg' })

function must(label, { data, error }) {
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

async function makeUser(tag, name) {
  const client = mk()
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@layout.local`
  const { data, error } = await client.auth.signUp({ email, password: PASSWORD })
  if (error || !data.user) throw new Error(`signUp ${tag}: ${error?.message}`)
  created.push(data.user.id)
  if (name) {
    must(`profile ${tag}`, await client.from('profiles').update({
      name, birthday: '1997-03-14', relationship_start_date: '2023-02-11', gender: tag.startsWith('b') ? 'female' : 'male', onboarding_complete: true,
    }).eq('id', data.user.id))
  }
  return { client, id: data.user.id, email }
}

async function pair(a, b) {
  const couple = must('create_couple', await a.client.rpc('create_couple'))
  couples.push(couple.id)
  if (b) must('join_couple', await b.client.rpc('join_couple', { p_code: couple.invite_code }))
  return couple
}

const jakartaDay = (offsetDays = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(Date.now() + offsetDays * 86400000))
const jakartaWeekday = (key) => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'long' }).format(new Date(`${key}T12:00:00+07:00`))

/**
 * Today's pet note, already written (and yesterday's, which is still "today"
 * before 05:00 WIB). A real couple has one after the first visit of the day;
 * without it every page visit that shows the pet would ask Claude for one.
 */
async function seedPetNotes(petId, cid, long) {
  for (const day of [jakartaDay(0), jakartaDay(-1)]) {
    must('pet note', await admin.from('pet_daily_notes').upsert({
      pet_id: petId, couple_id: cid, note_date: day, kind: jakartaWeekday(day) === 'Monday' ? 'weekly' : 'daily',
      status: 'ready', source: 'template', pose: long ? 'proud' : 'cozy',
      title: long ? 'A big week for the two of you, with three Moments and a Jar note' : null,
      line: long
        ? 'You two were everywhere this week: a picnic in Bogor, two long Daily Question answers, a letter that waits until February and a Jar note I keep reading again. I napped in the sun and felt very proud of my people.'
        : 'Hi. I just moved in and I am still sniffing every corner.',
      highlight: long ? 'Raka Aditya Pratama Wijayakusuma said hi before breakfast three days in a row, and Nadia answered every Daily Question.' : null,
    }, { onConflict: 'pet_id,note_date' }))
  }
}

/** A valid Samakan v2 bank set (7 rounds, fixed kind order) with long text. */
function samakanRounds(tag) {
  const R = [
    { kind: 'match', prompt: 'After a long week, which Friday night sounds better to you right now, honestly?', options: ['A quiet dinner at home', 'Out late with friends'] },
    { kind: 'guess', prompt: 'Which breakfast would your partner pick on a slow Sunday morning at a hotel in Bandung?', options: ['Nasi uduk with extra tempe', 'Pancakes and strong coffee', 'Bubur ayam from the cart', 'Just fruit and juice'] },
    { kind: 'scale', prompt: 'How much do you enjoy planning every detail of a trip before you go anywhere?', low: 'Let it happen', high: 'Spreadsheet everything' },
    { kind: 'guess', prompt: 'Where would your partner choose to spend a free afternoon in the city?', options: ['A bookshop with a cafe', 'The gym, then a long nap', 'A mall with good aircon', 'A park with street food'] },
    { kind: 'match', prompt: 'Rainy evening at home: a movie marathon or a long talk over hot tea?', options: ['Movie marathon', 'Long talk over tea'] },
    { kind: 'scale', prompt: 'How important is it to you that we eat dinner together every single night?', low: 'Not a big deal', high: 'Very important to me' },
    { kind: 'guess', prompt: 'What would your partner do first with a surprise day off from work?', options: ['Sleep until noon', 'Call their mom', 'Clean the whole house', 'Plan a quick trip'] },
  ]
  return R.map((r, i) => ({ options: [], talk: 'Ask each other about the last time this came up and what you would change.', source: 'general', bank_id: `layout-${tag}-${i}`, ...r }))
}
/** Answer arguments for a round: `v` picks a different answer per person. */
function samakanAnswer(round, v) {
  if (round.kind === 'match') return { p_round_id: round.id, p_pick: v % 2 }
  if (round.kind === 'guess') return { p_round_id: round.id, p_pick: v % 4, p_guess: (v + 1) % 4 }
  return { p_round_id: round.id, p_pick: 2 + v, p_guess: 3 }
}

const LONG = {
  title: 'Piknik sore di Kebun Raya Bogor sambil nyobain semua jajanan di sepanjang jalan Suryakencana sampai matahari terbenam',
  place: 'Kebun Raya Bogor, Jl. Ir. H. Juanda No.13, Paledang, Kecamatan Bogor Tengah, Kota Bogor, Jawa Barat',
  text: 'Hari yang panjang tapi menyenangkan banget. Kita jalan dari pagi, nyasar dua kali, ketemu kucing lucu di dekat danau, terus hujan deras pas mau pulang jadi neduh di warung kopi sambil cerita soal rencana tahun depan. ',
}

async function seedFull() {
  const a = await makeUser('a-full', 'Raka Aditya Pratama Wijayakusuma')
  const b = await makeUser('b-full', 'Nadia Kusumawardhani Salsabila Putri')
  const couple = await pair(a, b)
  const cid = couple.id
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
  const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(Date.now() - 86400000))

  // Pet Kita: a grown pet (XP from before the remake arrives as one legacy
  // ledger row; the longest name allowed), adopted first so the warmth ledger
  // fills from the Moments, moods, letters and Jar notes seeded below.
  const pet = must('pet', await admin.from('couple_pets').insert({ couple_id: cid, pet_type: 'cat', name: 'Mochi Si Kucing Oren', xp: 1450, level: 15 }).select().single())

  // Moments with long text, photos, GPS, comments and reactions.
  const momentIds = []
  for (let i = 0; i < 3; i++) {
    const m = must('moment', await a.client.from('moments').insert({
      couple_id: cid, created_by: a.id,
      title: (LONG.title + ' ' + (i + 1)).slice(0, 100),
      moment_date: i === 0 ? today : `2025-${String(10 - i).padStart(2, '0')}-${today.slice(8, 10)}`,
      location_name: LONG.place, latitude: -6.5971 + i * 0.01, longitude: 106.799 + i * 0.01,
      description: LONG.text.repeat(3).slice(0, 900), is_favorite: i === 0,
    }).select().single())
    momentIds.push(m.id)
    for (let p = 0; p < (i === 0 ? 7 : 2); p++) {
      const path = `${cid}/${m.id}/p${p}.jpg`
      must('upload', await a.client.storage.from('moments').upload(path, jpeg, { contentType: 'image/jpeg' }))
      must('photo row', await a.client.from('moment_photos').insert({ moment_id: m.id, couple_id: cid, storage_path: path, sort_order: p }))
    }
  }
  for (const [who, body] of [[a, 'Ini salah satu hari terbaik kita tahun ini, harus diulang lagi pas musim hujan selesai ya sayang!'], [b, 'Setuju banget!! Next time bawa payung dan jangan lupa beli asinan Bogor yang di dekat stasiun itu 😂']]) {
    must('comment', await who.client.from('moment_comments').insert({ moment_id: momentIds[0], couple_id: cid, profile_id: who.id, body }))
  }
  must('reaction', await a.client.from('moment_reactions').insert({ moment_id: momentIds[0], couple_id: cid, profile_id: a.id, emoji: '😍' }))
  must('reaction', await b.client.from('moment_reactions').insert({ moment_id: momentIds[0], couple_id: cid, profile_id: b.id, emoji: '🥹' }))

  // Finance: long goal name, big numbers, several goals.
  const goal = must('goal', await a.client.from('savings_goals').insert({
    couple_id: cid, name: 'Dana Pernikahan Impian di Bali Bersama Keluarga Besar', target_amount: 1250000000, target_date: '2028-12-31',
  }).select().single())
  must('goal2', await a.client.from('savings_goals').insert({ couple_id: cid, name: 'Liburan ke Jepang', target_amount: 45000000 }))
  for (const [amount, type, category, note] of [
    [350000000, 'deposit', 'tabungan', 'Setoran bonus akhir tahun dari kantor dan hasil jualan kamera lama'],
    [-12500000, 'withdrawal', 'persiapan_nikah', 'DP gedung resepsi + tester katering untuk keluarga besar dua pihak'],
    [7500000, 'deposit', 'tabungan', null],
  ]) must('tx', await a.client.from('couple_transactions').insert({ couple_id: cid, goal_id: goal.id, amount, type, category, note, created_by: a.id }))

  // Calendar.
  for (const ev of [
    { title: 'Makan malam anniversary di restoran rooftop yang dulu tempat kita pertama kali ketemu', event_type: 'date_plan', event_date: today, location: LONG.place, budget: 2750000, remind_days_before: 1 },
    { title: 'Ulang Tahun Nadia Kusumawardhani', event_type: 'birthday', event_date: '1998-09-02', is_recurring: true },
    { title: 'Fitting baju pengantin', event_type: 'event', event_date: '2026-12-05', event_scope: 'personal', description: LONG.text },
  ]) must('event', await a.client.from('couple_events').insert({ couple_id: cid, created_by: a.id, event_scope: 'couple', is_recurring: false, ...ev }))

  // Connection features.
  for (const [i, title] of [
    'Naik kereta panorama dari Jakarta ke Bandung terus lanjut camping di Ranca Upas sambil lihat rusa dan bintang malam',
    'Masak rendang bareng resep nenek',
    'Belajar diving bersertifikat di Labuan Bajo',
    'Nonton konser band favorit di GBK',
  ].entries()) must('bucket', await a.client.from('bucket_items').insert({
    couple_id: cid, created_by: a.id, title, category: ['traveling', 'kuliner', 'petualangan', 'romantis'][i],
    note: i === 0 ? LONG.text : null, estimated_cost: [3500000, 250000, 12000000, 1800000][i],
    is_done: i === 3, done_at: i === 3 ? new Date().toISOString() : null, moment_id: i === 3 ? momentIds[1] : null, source: i === 2 ? 'ai' : 'manual',
  }))
  must('mood a', await a.client.from('mood_checkins').insert({ couple_id: cid, profile_id: a.id, mood: 'semangat', note: 'Proyek kantor akhirnya selesai dan klien puas banget, malam ini pengin rayain kecil-kecilan berdua sambil makan martabak!!', checkin_date: today }))
  must('mood b', await b.client.from('mood_checkins').insert({ couple_id: cid, profile_id: b.id, mood: 'capek', note: 'Meeting dari pagi sampai sore tanpa jeda, kepala rasanya penuh banget, butuh dipeluk dan tidur cepat malam ini', checkin_date: today }))
  must('mood b2', await b.client.from('mood_checkins').insert({ couple_id: cid, profile_id: b.id, mood: 'kangen', checkin_date: yesterday }))
  for (const body of ['Makasih udah selalu jemput aku walaupun kantormu jauh banget dan macetnya gila-gilaan tiap Jumat sore.', 'Makasih udah dengerin cerita panjangku semalam tanpa motong sekalipun.']) {
    must('gratitude', await b.client.from('gratitude_notes').insert({ couple_id: cid, from_id: b.id, to_id: a.id, body }))
  }
  const firstNote = must('notes', await a.client.from('gratitude_notes').select('id').eq('to_id', a.id).limit(1))
  must('open note', await a.client.from('gratitude_notes').update({ opened_at: new Date().toISOString() }).eq('id', firstNote[0].id))
  for (const [who, date, answer] of [[a, yesterday, LONG.text], [b, yesterday, 'Momen favoritku waktu kita kehujanan di Bogor terus akhirnya ngobrol lama di warung kopi.'], [a, today, 'Waktu kamu masakin sup pas aku sakit.']]) {
    must('daily', await who.client.from('daily_responses').insert({ couple_id: cid, profile_id: who.id, question_index: 3, answer, answered_date: date }))
  }
  must('letter', await a.client.from('letters').insert({ couple_id: cid, sender_id: a.id, receiver_id: b.id, content: 'Untukmu di masa depan.', occasion: 'anniversary', occasion_label: 'Anniversary ke-4 kita yang penuh cerita', unlock_date: '2027-02-11T00:00:00Z' }))
  must('letter2', await b.client.from('letters').insert({ couple_id: cid, sender_id: b.id, receiver_id: a.id, content: 'Surat yang sudah bisa dibuka.', occasion: 'random', unlock_date: new Date(Date.now() - 3600000).toISOString() }))
  must('wishlist', await a.client.from('wishlist_items').insert({ couple_id: cid, name: 'Kamera mirrorless full-frame dengan lensa 24-70mm f/2.8 untuk dokumentasi perjalanan', price: 38500000, owner_type: 'me', owner_id: a.id }))
  must('ai run', await admin.from('ai_date_idea_runs').insert({
    couple_id: cid, profile_id: a.id, status: 'done', input: { budget: 'sedang', vibe: 'romantis', setting: 'bebas', city: 'Bandung' },
    ideas: [1, 2, 3].map((n) => ({ title: `Piknik senja di bukit dengan pemandangan kota Bandung nomor ${n}`.slice(0, 80), description: LONG.text.slice(0, 290), estimated_cost_idr: 450000 * n, category: 'romantis', tips: 'Datang sebelum jam lima sore supaya dapat spot terbaik dan bawa jaket karena anginnya dingin.' })),
  }))
  // Both said hi today: the pet is home. Its note is already written.
  must('hi a', await a.client.rpc('pet_say_hi', { p_gesture: 'snack' }))
  must('hi b', await b.client.rpc('pet_say_hi', { p_gesture: 'play' }))
  await seedPetNotes(pet.id, cid, true)

  // Deep Talk: levels 1-4 done, so the level 5 page plays instead of redirecting.
  const pack = must('pack', await admin.from('deep_talk_packs').select('id').eq('slug', 'bahasa-sayang').single())
  for (const n of [1, 2, 3, 4]) must(`deep talk level ${n}`, await a.client.rpc('complete_deep_talk_level', { p_pack_id: pack.id, p_level_number: n }))

  // Samakan v2: one finished set with its read-out (so the results page never
  // asks Claude for one), then an open set mid-way: two rounds revealed, one
  // waiting on Nadia, one skipped.
  const done = must('samakan set 1', await admin.rpc('samakan_insert_set', { p_couple: cid, p_creator: a.id, p_source: 'bank', p_theme: 'weekends', p_reason: null, p_rounds: samakanRounds('done') }))
  const doneRounds = must('samakan rounds 1', await admin.from('samakan_rounds').select('id, kind, position').eq('set_id', done.id).order('position'))
  for (const r of doneRounds) {
    must('answer a', await a.client.rpc('samakan_answer', samakanAnswer(r, 0)))
    must('answer b', await b.client.rpc('samakan_answer', samakanAnswer(r, r.position % 2 ? 1 : 0)))
  }
  must('readout', await admin.rpc('samakan_save_readout', { p_set_id: done.id, p_readout: {
    headline: 'You two agree on Friday nights and almost nothing about breakfast',
    note: 'Five of seven rounds matched. Raka guessed every one of Nadia\'s answers about free afternoons, and you both want dinner together most nights, even when the week is long and the traffic on the way home is terrible.',
    ask: 'Which slow Sunday breakfast would you both actually enjoy, if neither of you had to cook it?',
    by: 'template',
  } }))
  const doneRow = must('set 1 status', await admin.from('samakan_sets').select('status, readout_status').eq('id', done.id).single())
  if (doneRow.status !== 'done' || doneRow.readout_status !== 'done') throw new Error(`samakan set 1 not finished: ${JSON.stringify(doneRow)}`)
  const open = must('samakan set 2', await admin.rpc('samakan_insert_set', { p_couple: cid, p_creator: b.id, p_source: 'bank', p_theme: 'food', p_reason: null, p_rounds: samakanRounds('open') }))
  if (open.existing) throw new Error('samakan set 2: an open set was already there')
  const openRounds = must('samakan rounds 2', await admin.from('samakan_rounds').select('id, kind, position').eq('set_id', open.id).order('position'))
  for (const r of openRounds.slice(0, 3)) must('answer a', await a.client.rpc('samakan_answer', samakanAnswer(r, 1)))
  for (const r of openRounds.slice(0, 2)) must('answer b', await b.client.rpc('samakan_answer', samakanAnswer(r, 1)))
  must('skip', await b.client.rpc('samakan_skip', { p_round_id: openRounds[4].id }))

  // A finished game from the first Samakan (read-only "Older games").
  const v1Rounds = [
    { type: 'pilih_sama', roundIndex: 0, config: { type: 'pilih_sama', storyPrompt: 'Libur panjang akhirnya datang dan kalian bebas pergi ke mana saja selama seminggu penuh, mau ke mana?', options: ['Pantai di Lombok yang sepi', 'Gunung dan kebun teh di Puncak'] }, hostAnswer: 'Pantai di Lombok yang sepi', guestAnswer: 'Gunung dan kebun teh di Puncak', score: 0 },
    { type: 'slider_sama', roundIndex: 1, config: { type: 'slider_sama', storyPrompt: '', question: 'Seberapa suka kamu bangun pagi di hari libur untuk olahraga bareng?', minLabel: 'Mending tidur', maxLabel: 'Semangat banget' }, hostAnswer: 7, guestAnswer: 4, score: 12 },
    { type: 'tebak_angka', roundIndex: 2, config: { type: 'tebak_angka', storyPrompt: '', question: 'Dari 1 sampai 10, seberapa sering kamu kangen masakan rumah waktu lagi jauh?' }, hostAnswer: 9, guestAnswer: 8, score: 18 },
    { type: 'tebak_pasangan', roundIndex: 3, config: { type: 'tebak_pasangan', storyPrompt: '', questionForSelf: 'Kalau dapat hadiah kejutan, kamu paling senang dapat apa dari pasanganmu?', questionForPartner: 'Pasanganmu paling senang dapat apa?', options: ['Surat tulisan tangan yang panjang', 'Makan malam di tempat baru', 'Barang yang sudah lama diincar', 'Seharian tanpa HP berdua'] }, hostAnswer: { real: 'Surat tulisan tangan yang panjang', guess: 'Makan malam di tempat baru' }, guestAnswer: { real: 'Barang yang sudah lama diincar', guess: 'Surat tulisan tangan yang panjang' }, score: 20 },
  ]
  const lastMonth = new Date(Date.now() - 40 * 86400000).toISOString()
  const v1 = must('v1 game', await admin.from('game_sessions').insert({
    couple_id: cid, created_by: a.id, partner_id: b.id, chapter_id: 'hari-pertama', status: 'completed', rounds: v1Rounds,
    round_types: v1Rounds.map((r) => r.type), total_score: 50, created_at: lastMonth, completed_at: lastMonth,
  }).select('id').single())

  // Two Truths: one round Raka already guessed, one from Nadia waiting for him.
  const tt1 = must('two truths 1', await b.client.rpc('two_truths_create', { p_statements: ['Aku pernah ketinggalan kereta terakhir ke Bogor dan jalan kaki dua jam', 'Aku belum pernah naik pesawat sendirian', 'Aku bisa masak rendang tanpa lihat resep sama sekali'], p_lie_index: 2, p_story: LONG.text.slice(0, 300) }))
  must('two truths guess', await a.client.rpc('two_truths_guess', { p_round_id: tt1, p_index: 1 }))
  const tt2 = must('two truths 2', await b.client.rpc('two_truths_create', { p_statements: ['Aku pernah menang lomba makan kerupuk tingkat RW waktu SD', 'Aku takut banget sama kupu-kupu yang besar', 'Aku pernah ketemu artis idola di bandara Soekarno-Hatta'], p_lie_index: 0, p_story: null }))

  const { data: openLetter } = await admin.from('letters').select('id').eq('couple_id', cid).eq('receiver_id', a.id).limit(1)
  return {
    name: 'full', user: a, partner: b, cid, code: couple.invite_code,
    params: { momentId: momentIds[0], letterId: openLetter?.[0]?.id, packSlug: 'bahasa-sayang', level: '5', setId: open.id, sessionId: v1.id, roundId: tt2 },
    // Second instances of dynamic routes, in another state.
    extra: [`/app/games/samakan/set/${done.id}`, `/app/games/two-truths/${tt1}`, '/app/games/deep-talk/bahasa-sayang/4'],
  }
}

async function seedEmpty() {
  const c = await makeUser('c-empty', 'Dimas')
  const d = await makeUser('d-empty', 'Ayu')
  const couple = await pair(c, d)
  // A pet that just moved in: Dimas said hi, Ayu hasn't yet (not home).
  const pet = must('adopt', await c.client.rpc('adopt_pet', { p_type: 'dog', p_name: 'Kopi' }))
  must('hi c', await c.client.rpc('pet_say_hi', { p_gesture: 'pat' }))
  await seedPetNotes(pet.id, couple.id, false)
  return { name: 'empty', user: c, cid: couple.id, code: couple.invite_code, params: { packSlug: 'seru-aja', level: '1' } }
}

/** Paired, with long names, no pet yet: the adopt screen with a partner. */
async function seedAdopt() {
  const f = await makeUser('f-adopt', 'Galih Prasetyo Adinegoro Wicaksono')
  const g = await makeUser('g-adopt', 'Ratna Sekar Ayuningtyas Kusumadewi')
  const couple = await pair(f, g)
  return { name: 'adopt', user: f, cid: couple.id, code: couple.invite_code, params: {}, only: ['/app/home', '/app/pet', '/app/pet/adopt', '/app/games', '/app/games/samakan'] }
}

async function seedSolo() {
  const e = await makeUser('e-solo', 'Bayu Satriawan Nugroho')
  const couple = await pair(e, null)
  return { name: 'solo', user: e, cid: couple.id, code: couple.invite_code, params: { packSlug: 'uang-kita', level: '2' } }
}

/** Session cookies exactly as the app's @supabase/ssr server client reads them. */
async function cookiesFor(client) {
  const { data: { session } } = await client.auth.getSession()
  const jar = new Map()
  const ssr = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => { for (const { name, value } of list) { if (value) jar.set(name, value); else jar.delete(name) } },
    },
  })
  const { error } = await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
  if (error) throw new Error(`setSession: ${error.message}`)
  for (let i = 0; i < 20 && jar.size === 0; i++) await new Promise((r) => setTimeout(r, 25))
  return [...jar].map(([name, value]) => ({ name, value, domain: 'localhost', path: '/' }))
}

// Every page.tsx under src/app → route template.
function routeTemplates() {
  const out = []
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (f === 'page.tsx') out.push('/' + relative(join(root, 'src', 'app'), dir).split('\\').join('/'))
    }
  }
  walk(join(root, 'src', 'app'))
  return out.map((r) => (r === '/' ? '/' : r.replace(/\/$/, ''))).map((r) => (r === '/.' ? '/' : r))
}

function resolveRoute(tpl, params, code) {
  const map = {
    '[momentId]': params.momentId, '[letterId]': params.letterId, '[packSlug]': params.packSlug,
    '[level]': params.level, '[code]': code, '[packId]': null,
    '[setId]': params.setId, '[sessionId]': params.sessionId, '[roundId]': params.roundId,
  }
  let ok = true
  const path = tpl.replace(/\[[^\]]+\]/g, (seg) => { const v = map[seg]; if (!v) ok = false; return v ?? seg })
  return ok ? path : null
}

// ---------------------------------------------------------------------------
// In-page checks (runs in the browser).
function pageChecks({ scope }) {
  const W = window.innerWidth
  const H = window.innerHeight
  const issues = []
  const root = scope ? document.querySelector(scope) : document.body
  if (!root) return { issues: [{ kind: 'no-scope', detail: scope }] }

  const visible = (el) => {
    for (let n = el, child = null; n && n !== document.documentElement; child = n, n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false
      // A closed <details> draws only its <summary>. The rest still measures
      // (content-visibility: hidden keeps its layout), but nobody sees it.
      if (n.tagName === 'DETAILS' && !n.open && child && child.tagName !== 'SUMMARY') return false
    }
    const r = el.getBoundingClientRect()
    return r.width > 0.5 && r.height > 0.5
  }
  const describe = (el) => {
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 4).join('.')
    // SVG elements have no innerText; their text is textContent.
    const text = ((el.innerText ?? el.textContent) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 40)
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${text ? ` "${text}"` : ''}`
  }
  const isFixed = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const p = getComputedStyle(n).position
      if (p === 'fixed' || p === 'sticky') return n
    }
    return null
  }
  // A dialog shown inside the page (e.g. over the pet room, with its own
  // backdrop) is a layer of its own, like fixed chrome: it is meant to cover
  // what's under it. Its contents are checked on their own (scoped run in
  // auditPage), never against the page beneath.
  const layerOf = (el) => (scope ? null : el.closest('[role=dialog]'))
  const absAncestor = (el, depth = 3) => {
    for (let n = el, i = 0; n && i < depth; n = n.parentElement, i++) if (getComputedStyle(n).position === 'absolute') return true
    return false
  }
  const scrollClipAncestor = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return n
    }
    return null
  }
  const sy = window.scrollY
  // Visible part of an element: its rect cut by every ancestor that clips
  // (overflow hidden/clip/auto, line-clamp, truncate). Text runs of a
  // truncated span extend past the ellipsis; only the visible part counts.
  const clipRect = (el, r) => {
    let x1 = r.left, x2 = r.right, y1 = r.top, y2 = r.bottom
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n)
      const cx = !/visible/.test(s.overflowX), cy = !/visible/.test(s.overflowY)
      if (!cx && !cy) continue
      const a = n.getBoundingClientRect()
      if (cx) { x1 = Math.max(x1, a.left); x2 = Math.min(x2, a.right) }
      if (cy) { y1 = Math.max(y1, a.top); y2 = Math.min(y2, a.bottom) }
    }
    return { x1, x2, y1, y2 }
  }
  const srOnly = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.position === 'absolute' && (s.clip !== 'auto' || s.clipPath !== 'none') && n.getBoundingClientRect().width <= 1) return true
    }
    return false
  }

  // 1) Horizontal page overflow.
  const sw = document.documentElement.scrollWidth
  if (!scope && sw > W + 1) {
    const culprits = []
    for (const el of document.body.querySelectorAll('*')) {
      if (!visible(el)) continue
      const r = el.getBoundingClientRect()
      if (r.right > W + 1 && !scrollClipAncestor(el)) culprits.push(`${describe(el)} right=${Math.round(r.right)}`)
      if (culprits.length >= 4) break
    }
    issues.push({ kind: 'horizontal-scroll', detail: `scrollWidth ${sw} > ${W}`, culprits })
  }

  // 2) Collect text boxes (from text nodes) and controls.
  const boxes = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue
    const el = t.parentElement
    if (!el || !visible(el) || srOnly(el) || el.closest('script,style,noscript,[aria-hidden="true"] svg')) continue
    const range = document.createRange()
    range.selectNodeContents(t)
    for (const raw of range.getClientRects()) {
      if (raw.width < 1 || raw.height < 1) continue
      const inset = raw.height * 0.18 // glyph boxes include leading; compare ink areas
      const r = clipRect(el, { left: raw.left, right: raw.right, top: raw.top + inset, bottom: raw.bottom - inset })
      if (r.x2 - r.x1 < 1 || r.y2 - r.y1 < 1) continue
      boxes.push({ type: 'text', el, x1: r.x1, x2: r.x2, y1: r.y1 + sy, y2: r.y2 + sy, fixed: isFixed(el), layer: layerOf(el) })
    }
  }
  for (const el of root.querySelectorAll('button, a[href], input:not([type=hidden]), textarea, select, [role=button], svg')) {
    if (!visible(el) || srOnly(el)) continue
    const r = clipRect(el, el.getBoundingClientRect())
    if (r.x2 - r.x1 < 1 || r.y2 - r.y1 < 1) continue
    boxes.push({ type: el.tagName === 'svg' ? 'icon' : 'control', el, x1: r.x1, x2: r.x2, y1: r.y1 + sy, y2: r.y2 + sy, fixed: isFixed(el), layer: layerOf(el) })
  }

  // 3) Overlaps between boxes that aren't nested and scroll together.
  const seen = new Set()
  const overlaps = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      if (a.fixed !== b.fixed) continue // fixed chrome vs content is checked in (5)
      if (a.layer !== b.layer) continue // an in-page dialog vs what it covers: dialog checked on its own
      if (a.type !== 'text' && b.type !== 'text') {
        // control vs control: only real if they overlap noticeably
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue
        if (a.type === 'icon' || b.type === 'icon') continue
        // a button deliberately floated over a card (favourite star, delete) is a pattern, not a collision
        if (getComputedStyle(a.el).position === 'absolute' || getComputedStyle(b.el).position === 'absolute') continue
      }
      if (a.type === 'text' && b.type === 'text' && a.el === b.el) continue
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue
      const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)
      const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)
      if (w < 2 || h < 2 || w * h < 8) continue
      const textOnIcon = (a.type === 'icon' && b.type === 'text') || (b.type === 'icon' && a.type === 'text')
      if (textOnIcon) {
        const t = a.type === 'text' ? a : b
        if (absAncestor(t.el)) continue // badges on icons are intentional
      }
      if ((a.type === 'control' && b.type === 'text') || (b.type === 'control' && a.type === 'text')) {
        const t = a.type === 'text' ? a : b
        const c = a.type === 'text' ? b : a
        if (c.el.contains(t.el) || absAncestor(t.el, 2)) continue
      }
      const key = `${describe(a.el)}|${describe(b.el)}`
      if (seen.has(key)) continue
      seen.add(key)
      overlaps.push({ kind: `overlap-${a.type}-${b.type}`, a: describe(a.el), b: describe(b.el), area: Math.round(w * h), at: Math.round(Math.max(a.y1, b.y1)) })
    }
  }
  issues.push(...overlaps.slice(0, 15))

  // 3b) Text spilling out of the card/pill that holds it (e.g. a long amount
  // running past a tile's border). The nearest ancestor with a border or a
  // rounded background is the "box"; visible text must stay inside it.
  const boxOf = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n)
      const bordered = parseFloat(s.borderLeftWidth) > 0 || parseFloat(s.borderRightWidth) > 0
      const filled = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent' && parseFloat(s.borderTopLeftRadius) > 0
      if (bordered || filled) return n
    }
    return null
  }
  const spilled = new Set()
  for (const t of boxes) {
    if (t.type !== 'text' || spilled.has(t.el)) continue
    const box = boxOf(t.el)
    if (!box) continue
    const r = box.getBoundingClientRect()
    if (t.x2 > r.right + 1.5 || t.x1 < r.left - 1.5) {
      spilled.add(t.el)
      issues.push({ kind: 'text-escapes-box', a: describe(t.el), b: describe(box), detail: `text ${Math.round(t.x1)}..${Math.round(t.x2)} box ${Math.round(r.left)}..${Math.round(r.right)}` })
    }
    if (spilled.size >= 6) break
  }

  // 4) Clipped text.
  for (const el of root.querySelectorAll('*')) {
    if (!visible(el) || srOnly(el) || /^(INPUT|TEXTAREA|SELECT|svg|path|IMG|CANVAS|IFRAME)$/i.test(el.tagName)) continue
    const s = getComputedStyle(el)
    const hidX = /(hidden|clip)/.test(s.overflowX)
    const hidY = /(hidden|clip)/.test(s.overflowY)
    if (!hidX && !hidY) continue
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!hasText) continue
    const clamp = s.webkitLineClamp && s.webkitLineClamp !== 'none'
    if (hidX && el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== 'ellipsis' && !clamp) {
      issues.push({ kind: 'clipped-text-x', a: describe(el), detail: `${el.scrollWidth}>${el.clientWidth}` })
    }
    if (hidY && el.scrollHeight > el.clientHeight + 2 && !clamp && s.textOverflow !== 'ellipsis' && el.clientHeight > 0) {
      issues.push({ kind: 'clipped-text-y', a: describe(el), detail: `${el.scrollHeight}>${el.clientHeight}` })
    }
  }

  // 5) Content stuck under fixed chrome when scrolled to the very bottom/top.
  if (!scope) {
    const fixedEls = [...document.body.querySelectorAll('*')].filter((el) => visible(el) && getComputedStyle(el).position === 'fixed')
    const nav = fixedEls.find((el) => el.tagName === 'NAV')
    if (nav) {
      const navTop = nav.getBoundingClientRect().top
      const maxScroll = document.documentElement.scrollHeight - H
      const bottomOffset = maxScroll - sy // content y (page coords) → viewport y at max scroll = y - maxScroll
      for (const b of boxes) {
        if (b.fixed) continue
        const top = b.y1 - maxScroll, bottom = b.y2 - maxScroll
        if (bottom > navTop + 1 && top < H) {
          issues.push({ kind: 'under-bottom-nav', a: describe(b.el), detail: `bottom ${Math.round(bottom)} > nav ${Math.round(navTop)}` })
          break
        }
      }
      void bottomOffset
      // other fixed elements overlapping the nav (floating buttons, toasts)
      for (const f of fixedEls) {
        if (f === nav || nav.contains(f) || f.contains(nav)) continue
        const r = f.getBoundingClientRect()
        const nr = nav.getBoundingClientRect()
        const w = Math.min(r.right, nr.right) - Math.max(r.left, nr.left)
        const h = Math.min(r.bottom, nr.bottom) - Math.max(r.top, nr.top)
        if (w > 2 && h > 2 && r.height < H * 0.9) issues.push({ kind: 'fixed-over-nav', a: describe(f), detail: `${Math.round(w)}x${Math.round(h)}` })
      }
    }
  } else {
    // Sheet/dialog must fit the viewport horizontally and be reachable vertically.
    const r = root.getBoundingClientRect()
    if (r.left < -1 || r.right > W + 1) issues.push({ kind: 'dialog-wider-than-screen', a: describe(root), detail: `${Math.round(r.left)}..${Math.round(r.right)}` })
    const s = getComputedStyle(root)
    if (r.height > H + 1 && !/(auto|scroll)/.test(s.overflowY)) issues.push({ kind: 'dialog-taller-than-screen', a: describe(root), detail: `${Math.round(r.height)} > ${H}` })
  }

  // 6) Tiny tap targets (warning only).
  const small = []
  for (const el of root.querySelectorAll('button, a[href], [role=button], input[type=checkbox], input[type=radio]')) {
    if (!visible(el)) continue
    const r = el.getBoundingClientRect()
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline'
    if (!inline && (r.width < 24 || r.height < 24)) small.push(describe(el))
  }
  return { issues, smallTargets: small.slice(0, 8) }
}

// ---------------------------------------------------------------------------
const INTERACTIONS = /^(\+\s*)?(tambah|tulis|catat|edit|ubah|buat|isi|target baru|tambah impian|tulis surat|masukkan)/i

/** One browser context per dataset × width, signed in through the real login form. */
async function openSession(browser, { width, email }) {
  const context = await browser.newContext({ viewport: { width, height: Math.round(width * 2.05) }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'id-ID', timezoneId: 'Asia/Jakarta' })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error' && !/Download the React DevTools|favicon|\[HMR\]|webpack-hmr|Failed to load resource.*(tile\.openstreetmap|nominatim)/i.test(m.text())) consoleErrors.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`))
  if (email) {
    await page.goto(APP + '/auth/login', { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/(app|onboarding)\//, { timeout: 120000 })
  }
  return { context, page, consoleErrors }
}

async function auditPage(session, { path, width, label, interact }) {
  const { page, consoleErrors } = session
  consoleErrors.length = 0
  const result = { label, path, width, finalPath: null, issues: [], smallTargets: [], dialogs: [], consoleErrors: [] }
  try {
    await page.goto(APP + path, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(1500)
    // trigger lazy content, then measure from the top
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(500)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    result.finalPath = new URL(page.url()).pathname
    const base = await page.evaluate(pageChecks, { scope: null })
    result.issues.push(...base.issues)
    result.smallTargets = base.smallTargets
    const shot = `${label}__${path.replace(/\//g, '_') || 'root'}__${width}.png`
    await page.screenshot({ path: join(OUT, shot), fullPage: true })
    result.screenshot = shot

    // A dialog already open on load (e.g. the pet's "moved in" card over the
    // room) gets the same scoped check as a sheet opened by a tap.
    const autoDialogs = await page.evaluate(() => {
      const ids = []
      document.querySelectorAll('[role=dialog]').forEach((d, i) => {
        const s = getComputedStyle(d)
        const r = d.getBoundingClientRect()
        if (s.display === 'none' || s.visibility === 'hidden' || r.width < 1 || r.height < 1) return
        const inner = d.querySelector('div.relative, div[class*="rounded"]') || d
        inner.setAttribute('data-audit-auto', String(i))
        ids.push(String(i))
      })
      return ids
    })
    for (const id of autoDialogs) {
      const r = await page.evaluate(pageChecks, { scope: `[data-audit-auto="${id}"]` })
      result.dialogs.push({ trigger: 'open on load', issues: r.issues, screenshot: shot })
    }

    if (interact) {
      const buttons = await page.$$('button, [role=button], a[href]')
      const triggers = []
      for (const b of buttons) {
        const name = ((await b.getAttribute('aria-label')) || (await b.innerText().catch(() => '')) || '').trim()
        if (INTERACTIONS.test(name) && (await b.isVisible())) triggers.push(name)
      }
      for (const name of [...new Set(triggers)].slice(0, 3)) {
        const btn = page.locator(`button:has-text("${name.replace(/"/g, '\\"')}"), [aria-label="${name.replace(/"/g, '\\"')}"]`).first()
        const before = page.url()
        await btn.click({ timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(700)
        if (page.url() !== before) { await page.goto(APP + path, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(800); continue }
        const dialogSel = '[role=dialog]'
        if (await page.$(dialogSel)) {
          const sheet = await page.evaluate((sel) => {
            const d = document.querySelector(sel)
            const inner = d.querySelector('div.relative, div[class*="rounded"]') || d
            inner.setAttribute('data-audit-sheet', '1')
            return true
          }, dialogSel)
          void sheet
          const r = await page.evaluate(pageChecks, { scope: '[data-audit-sheet="1"]' })
          const dshot = `${label}__${path.replace(/\//g, '_')}__${width}__dialog-${name.replace(/\W+/g, '_').slice(0, 20)}.png`
          await page.screenshot({ path: join(OUT, dshot) })
          result.dialogs.push({ trigger: name, issues: r.issues, screenshot: dshot })
          await page.keyboard.press('Escape')
          await page.waitForTimeout(300)
          if (await page.$(dialogSel)) { await page.goto(APP + path, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(800) }
        }
      }
    }
  } catch (e) {
    result.issues.push({ kind: 'load-failed', detail: String(e.message).slice(0, 200) })
  }
  result.consoleErrors = [...consoleErrors]
  return result
}

async function cleanup() {
  for (const cid of couples) {
    const { data: folders } = await admin.storage.from('moments').list(cid)
    for (const f of folders ?? []) {
      const { data: files } = await admin.storage.from('moments').list(`${cid}/${f.name}`)
      if (files?.length) await admin.storage.from('moments').remove(files.map((x) => `${cid}/${f.name}/${x.name}`))
    }
    await admin.from('couples').delete().eq('id', cid)
  }
  for (const id of created) await admin.auth.admin.deleteUser(id)
}

/** Remove users (and their couples + photos) left by an earlier --keep run. */
async function sweepOldRuns() {
  const old = []
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    old.push(...data.users.filter((u) => u.email?.endsWith('@layout.local')).map((u) => u.id))
    if (data.users.length < 200) break
  }
  if (!old.length) return
  const { data: members } = await admin.from('couple_members').select('couple_id').in('profile_id', old)
  couples.push(...new Set((members ?? []).map((m) => m.couple_id)))
  created.push(...old)
  await cleanup()
  couples.length = 0
  created.length = 0
  console.log(`swept ${old.length} users from an earlier run`)
}

async function main() {
  await sweepOldRuns()
  const datasets = [await seedFull(), await seedEmpty(), await seedSolo(), await seedAdopt()]
  const templates = routeTemplates().filter((r) => !r.startsWith('/admin'))
  // Every /app route must be rendered by at least one dataset: a dynamic route
  // with no seeded id would otherwise drop out of the audit silently.
  const unresolved = templates.filter((t) => t.startsWith('/app') && !datasets.some((ds) => resolveRoute(t, ds.params, ds.code)))
  if (unresolved.length && !ONLY) throw new Error(`no dataset renders ${unresolved.join(', ')}: seed an id for it`)
  const browser = await chromium.launch()
  // One worker per dataset × width: sign in once, then visit every page in turn.
  const groups = []
  for (const ds of datasets) {
    const paths = []
    for (const tpl of templates) {
      if (!tpl.startsWith('/app')) continue
      if (ds.only && !ds.only.includes(tpl)) continue
      const path = resolveRoute(tpl, ds.params, ds.code)
      if (!path || (ONLY && !ONLY.includes(tpl) && !ONLY.includes(path))) continue
      paths.push(path)
    }
    for (const path of ds.extra ?? []) if (!ONLY || ONLY.includes(path)) paths.push(path)
    for (const width of WIDTHS) groups.push({ label: ds.name, width, email: ds.user.email, paths, interact: ds.name === 'full' && width === WIDTHS[0] })
  }
  const publicPaths = templates
    .filter((t) => t === '/' || /^\/(auth\/|privasi$|invite\/|assessment$|results$)/.test(t))
    .map((t) => resolveRoute(t, {}, datasets[2].code))
    .filter((p) => p && (!ONLY || ONLY.includes(p)))
  for (const width of WIDTHS) groups.push({ label: 'public', width, email: null, paths: publicPaths, interact: false })

  const results = []
  async function runGroup(g) {
    if (!g.paths.length) return
    const session = await openSession(browser, g)
    for (const path of g.paths) {
      const r = await auditPage(session, { path, width: g.width, label: g.label, interact: g.interact })
      results.push(r)
      const n = r.issues.length + r.dialogs.reduce((s, d) => s + d.issues.length, 0) + r.consoleErrors.length
      process.stdout.write(`${n ? '✗' : '·'} ${g.label} ${g.width} ${path}${r.finalPath && r.finalPath !== path ? ` → ${r.finalPath}` : ''}${n ? ` (${n})` : ''}\n`)
    }
    await session.context.close()
  }
  const CONCURRENCY = Number(args.concurrency ?? 2)
  let next = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (next < groups.length) await runGroup(groups[next++]) }))
  await browser.close()

  results.sort((a, b) => (a.label + a.path + a.width).localeCompare(b.label + b.path + b.width))
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(results, null, 2))
  const failing = results.filter((r) => r.issues.length || r.consoleErrors.length || r.dialogs.some((d) => d.issues.length))
  const lines = []
  for (const r of failing) {
    lines.push(`\n## ${r.label} ${r.width}px ${r.path}${r.finalPath && r.finalPath !== r.path ? ` → ${r.finalPath}` : ''}  [${r.screenshot ?? '-'}]`)
    for (const i of r.issues) lines.push(`- ${i.kind}: ${[i.a, i.b, i.detail].filter(Boolean).join(' | ')}${i.culprits ? ' :: ' + i.culprits.join(' ; ') : ''}`)
    for (const d of r.dialogs) for (const i of d.issues) lines.push(`- [sheet "${d.trigger}"] ${i.kind}: ${[i.a, i.b, i.detail].filter(Boolean).join(' | ')}  [${d.screenshot}]`)
    for (const e of r.consoleErrors) lines.push(`- console: ${e}`)
  }
  writeFileSync(join(OUT, 'report.md'), `# Layout audit\n\n${results.length} page renders, ${failing.length} with issues.\n${lines.join('\n')}\n`)
  console.log(`\n${results.length} page renders, ${failing.length} with issues → .unlazy/layout-audit/report.md`)
  if (!failing.length) console.log('LAYOUT AUDIT PASSED')
  else process.exitCode = 1
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => { if (!args.keep) await cleanup() })
