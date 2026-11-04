// Gate check for src/lib/moment-autofill.ts (Quick Moment from photo metadata).
//   node scripts/verify/moment-autofill.mjs   (Node >= 22.6: strips TS types natively)
// Prints "moment autofill verification passed" only when every assertion holds.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const lib = await import(join(root, 'src', 'lib', 'moment-autofill.ts'))
const { MAX_TITLE, autoTitle, timeOfDay, isRecentPhoto, pickPhotoMeta, withCaptureTime, formatDayRange, placePhrase } = lib

const failures = []
let checks = 0
const eq = (name, got, want) => {
  checks++
  if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${name}\n    want ${JSON.stringify(want)}\n    got  ${JSON.stringify(got)}`)
}
const ok = (name, cond, got) => {
  checks++
  if (!cond) failures.push(`${name}: got ${JSON.stringify(got)}`)
}

// Wednesday 4 November 2026, 12:00 WIB.
const NOW = new Date('2026-11-04T05:00:00Z')
const wib = (local) => `${local}+07:00`
const title = (placeName, takenAt, extra = {}) => autoTitle({ placeName, takenAt, now: NOW, ...extra })

// ── Limits ────────────────────────────────────────────────────────────
const momentsSrc = readFileSync(join(root, 'src', 'lib', 'moments.ts'), 'utf8')
eq('MAX_TITLE matches src/lib/moments.ts', MAX_TITLE, Number(momentsSrc.match(/export const MAX_TITLE = (\d+)/)?.[1]))

// ── Time-of-day buckets in WIB, including the midnight edges ──────────
const buckets = [
  ['00:00', 'night'], ['04:59', 'night'], ['05:00', 'morning'], ['10:59', 'morning'],
  ['11:00', 'afternoon'], ['14:59', 'afternoon'], ['15:00', 'late afternoon'], ['17:59', 'late afternoon'],
  ['18:00', 'evening'], ['21:59', 'evening'], ['22:00', 'night'], ['23:59', 'night'],
]
for (const [hm, want] of buckets) eq(`bucket ${hm} WIB`, timeOfDay(wib(`2026-11-01T${hm}:00`)), want)
// Read in WIB, not UTC: 23:00 UTC is 06:00 WIB the next day.
eq('23:00 UTC is a WIB morning', timeOfDay('2026-10-31T23:00:00Z'), 'morning')
eq('12:00 UTC is a WIB evening', timeOfDay('2026-11-01T12:00:00.000Z'), 'evening')
eq('unparseable time', timeOfDay('not a date'), null)

// ── Day name within the last 7 days, otherwise "d Month" ──────────────
const KK = 'Kopi Kenangan Senopati'
eq('Saturday evening at a venue', title(KK, wib('2026-10-31T19:30:00')), 'Saturday evening at Kopi Kenangan Senopati')
eq('Sunday morning in a city', title('Bandung', wib('2026-11-01T08:00:00')), 'Sunday morning in Bandung')
eq('today uses the day name', title(KK, wib('2026-11-04T09:00:00')), 'Wednesday morning at Kopi Kenangan Senopati')
eq('6 days ago uses the day name', title(KK, wib('2026-10-29T13:00:00')), 'Thursday afternoon at Kopi Kenangan Senopati')
eq('7 days ago uses the date', title(KK, wib('2026-10-28T13:00:00')), 'An afternoon at Kopi Kenangan Senopati on 28 October')
eq('older photo, late afternoon', title(KK, wib('2026-09-14T16:00:00')), 'A late afternoon at Kopi Kenangan Senopati on 14 September')
eq('older photo from another year', title(KK, wib('2025-09-14T19:00:00')), 'An evening at Kopi Kenangan Senopati on 14 September 2025')

// ── Midnight: after 00:00 it is still the night before ────────────────
eq('23:59 Sunday', title('Lucy in the Sky', wib('2026-11-01T23:59:00')), 'Sunday night at Lucy in the Sky')
eq('00:00 Monday is late Sunday night', title('Lucy in the Sky', wib('2026-11-02T00:00:00')), 'Late Sunday night at Lucy in the Sky')
eq('04:59 Monday is late Sunday night', title('Lucy in the Sky', wib('2026-11-02T04:59:00')), 'Late Sunday night at Lucy in the Sky')
eq('05:00 Monday is Monday morning', title('Lucy in the Sky', wib('2026-11-02T05:00:00')), 'Monday morning at Lucy in the Sky')
eq('UTC day boundary: 17:30Z is 00:30 WIB Monday', title('Lucy in the Sky', '2026-11-01T17:30:00Z'), 'Late Sunday night at Lucy in the Sky')
eq('UTC day boundary: 16:59Z is 23:59 WIB Sunday', title('Lucy in the Sky', '2026-11-01T16:59:00Z'), 'Sunday night at Lucy in the Sky')
eq('older night after midnight keeps the photo date', title('Lucy in the Sky', wib('2026-09-14T01:00:00')), 'A late night at Lucy in the Sky on 14 September')
eq('night that started 7 days ago uses the date', title('Lucy in the Sky', wib('2026-10-29T01:00:00')), 'A late night at Lucy in the Sky on 29 October')

// ── No place ──────────────────────────────────────────────────────────
eq('no place, recent', title(null, wib('2026-10-31T19:30:00')), 'A Saturday evening out')
eq('no place, recent after midnight', title('', wib('2026-11-01T01:30:00')), 'A late Saturday night out')
eq('no place, older', title(undefined, wib('2026-09-14T19:30:00')), 'An evening out on 14 September')
eq('blank place is no place', title('   ', wib('2026-10-31T19:30:00')), 'A Saturday evening out')
eq('country alone is no place', title('Indonesia', wib('2026-10-31T19:30:00')), 'A Saturday evening out')

// ── No date or time ───────────────────────────────────────────────────
eq('no date, venue', title('Kopi Kenangan', null), 'A day at Kopi Kenangan')
eq('no date, city', title('Bandung', null), 'A day in Bandung')
eq('no date, no place', autoTitle({ now: NOW }), 'A day out')
eq('date only, recent', title('Kopi Kenangan', null, { date: '2026-10-31' }), 'Saturday at Kopi Kenangan')
eq('date only, recent, no place', title(null, null, { date: '2026-10-31' }), 'A Saturday out')
eq('date only, older', title('Kopi Kenangan', null, { date: '2026-09-14' }), 'A day at Kopi Kenangan on 14 September')
eq('date only, older, no place', title(null, null, { date: '2026-09-14' }), 'A day out on 14 September')
eq('date wins over the instant day', title(KK, wib('2026-10-31T19:30:00'), { date: '2026-10-31' }), 'Saturday evening at Kopi Kenangan Senopati')

// ── Future and broken dates are ignored ───────────────────────────────
eq('future instant ignored', title('Kopi Kenangan', wib('2026-11-06T19:00:00')), 'A day at Kopi Kenangan')
eq('future date ignored', title('Kopi Kenangan', null, { date: '2026-11-05' }), 'A day at Kopi Kenangan')
eq('clock 5 minutes fast is fine', title('Kopi Kenangan', new Date(NOW.getTime() + 5 * 60_000)), 'Wednesday afternoon at Kopi Kenangan')
eq('impossible date ignored', title('Kopi Kenangan', null, { date: '2026-02-31' }), 'A day at Kopi Kenangan')
eq('garbage instant ignored', title('Kopi Kenangan', 'yesterday-ish'), 'A day at Kopi Kenangan')

// ── Place names ───────────────────────────────────────────────────────
const SAT = wib('2026-10-31T19:30:00')
eq('venue + area from the geocoder', title('Kopi Kenangan, Selong', SAT), 'Saturday evening at Kopi Kenangan in Selong')
eq('admin word dropped', title('Kota Bandung', wib('2026-11-01T08:00:00')), 'Sunday morning in Bandung')
eq('Kota as part of a name stays', title('Kota Kasablanka, Menteng Dalam', SAT), 'Saturday evening at Kota Kasablanka in Menteng Dalam')
eq('Kota Tua is an area', title('Kota Tua', SAT), 'Saturday evening in Kota Tua')
eq('area repeating the venue dropped', title('Kopi Kenangan Senopati, Senopati', SAT), 'Saturday evening at Kopi Kenangan Senopati')
eq('street uses "on"', title('Jalan Braga, Braga, Sumur Bandung', SAT), 'Saturday evening on Jalan Braga in Sumur Bandung')
eq('brackets kept', title('Sate Khas Senayan (Kebon Sirih)', SAT), 'Saturday evening at Sate Khas Senayan (Kebon Sirih)')
eq(
  'pasted Google address keeps the venue, drops the admin tail',
  title('Jl. Senopati No.10, RT.8/RW.3, Selong, Kec. Kby. Baru, Kota Jakarta Selatan, Daerah Khusus Ibukota Jakarta 12110, Indonesia', SAT),
  'Saturday evening on Jl. Senopati No.10 in Selong',
)
eq(
  'OpenStreetMap display name',
  title('Kopi Kenangan, Jalan Senopati, Selong, Kebayoran Baru, South Jakarta, Special Capital Region of Jakarta, Java, 12190, Indonesia', SAT),
  'Saturday evening at Kopi Kenangan in Selong',
)
eq('province tail is not an area', title('Gedung Sate, Jawa Barat', SAT), 'Saturday evening at Gedung Sate')

const longVenue = 'Kopi Kenangan Senopati Jalan Senopati Nomor 10 Kebayoran Baru Jakarta Selatan DKI Jakarta Indonesia'
const longTitle = title(longVenue, SAT)
ok('long venue keeps its start', longTitle.startsWith('Saturday evening at Kopi Kenangan Senopati'), longTitle)
ok('long venue cut on a word boundary', longVenue.startsWith(longTitle.replace('Saturday evening at ', '')) && longVenue[longTitle.length - 'Saturday evening at '.length] === ' ', longTitle)
ok('long venue stays short', longTitle.length <= 'Saturday evening at '.length + 48, longTitle)
const huge = autoTitle({ placeName: `${'Warung '.repeat(80)}, ${'Area '.repeat(40)}`, takenAt: wib('2025-09-14T16:00:00'), now: NOW })
ok('huge place name fits MAX_TITLE', huge.length <= MAX_TITLE && huge.endsWith('on 14 September 2025'), huge)
const oneWord = autoTitle({ placeName: 'x'.repeat(300), takenAt: SAT, now: NOW })
ok('300-letter word fits MAX_TITLE', oneWord.length <= MAX_TITLE, oneWord.length)
eq('placePhrase of a city', placePhrase('Kabupaten Bogor'), { prep: 'in', main: 'Bogor', area: null })

// ── Every title is usable as is ───────────────────────────────────────
const samples = [longTitle, huge, oneWord, title(KK, SAT), title(null, null), title('Bandung', SAT)]
for (const s of samples) {
  ok(`"${s.slice(0, 40)}" is non-empty, capitalized, no em dash, <= MAX_TITLE`, s.length > 0 && s.length <= MAX_TITLE && /^[A-Z]/.test(s) && !s.includes('—') && s === s.trim(), s)
}

// ── pickPhotoMeta: earliest real date, first GPS, provenance ──────────
const iso = (local) => new Date(wib(local)).toISOString()
const trip = [
  { date: '2026-09-16', takenAt: iso('2026-09-16T10:00:00'), latitude: null, longitude: null },
  { date: '2026-09-14', takenAt: iso('2026-09-14T19:30:00'), latitude: -6.2, longitude: 106.8 },
  { date: '2026-09-15', takenAt: iso('2026-09-15T12:00:00'), latitude: -7.0, longitude: 110.4 },
  { date: '2026-12-25', takenAt: iso('2026-12-25T10:00:00'), latitude: null, longitude: null }, // camera clock ahead
  { date: null, takenAt: null, latitude: 0, longitude: 0 }, // WhatsApp image, 0,0 = no fix
]
const pick = pickPhotoMeta(trip, NOW)
eq('multi-day: earliest date', pick.date, '2026-09-14')
eq('multi-day: time of the earliest photo', pick.takenAt, '2026-09-14T12:30:00.000Z')
eq('multi-day: last date (future ignored)', pick.lastDate, '2026-09-16')
eq('multi-day: day count', pick.days, 3)
eq('newest real instant', pick.newestTakenAt, '2026-09-16T03:00:00.000Z')
eq('first GPS in photo order', pick.coords, { latitude: -6.2, longitude: 106.8 })
eq('provenance', pick.from, { date: true, time: true, place: true })
eq('order does not matter for the date', pickPhotoMeta([...trip].reverse(), NOW).date, '2026-09-14')
eq('0,0 is skipped for the next real fix', pickPhotoMeta([...trip].reverse(), NOW).coords, { latitude: -7.0, longitude: 110.4 })
eq('multi-day title from the earliest photo', autoTitle({ placeName: 'Kopi Kenangan, Selong', date: pick.date, takenAt: pick.takenAt, now: NOW }), 'An evening at Kopi Kenangan in Selong on 14 September')

const sameDay = pickPhotoMeta([
  { date: '2026-10-31', takenAt: null, latitude: null, longitude: null },
  { date: '2026-10-31', takenAt: iso('2026-10-31T20:00:00'), latitude: null, longitude: null },
  { date: '2026-10-31', takenAt: iso('2026-10-31T18:45:00'), latitude: null, longitude: null },
], NOW)
eq('same day: earliest known time', sameDay.takenAt, iso('2026-10-31T18:45:00'))
eq('same day: one day', sameDay.days, 1)

const onlyFuture = pickPhotoMeta([{ date: '2027-01-01', takenAt: iso('2027-01-01T10:00:00'), latitude: 91, longitude: 10 }], NOW)
eq('future only: no date', onlyFuture.date, null)
eq('future only: no newest', onlyFuture.newestTakenAt, null)
eq('out-of-range GPS ignored', onlyFuture.coords, null)
eq('future only: provenance', onlyFuture.from, { date: false, time: false, place: false })

const none = pickPhotoMeta([], NOW)
eq('no photos', [none.date, none.takenAt, none.lastDate, none.days, none.newestTakenAt, none.coords], [null, null, null, 0, null, null])

// A camera abroad writes its own date, a day ahead of Jakarta near midnight.
const lateNow = new Date('2026-11-04T16:30:00Z') // 23:30 WIB, Wednesday
const tokyo = pickPhotoMeta([{ date: '2026-11-05', takenAt: '2026-11-04T16:15:00.000Z', latitude: null, longitude: null }], lateNow)
eq('camera date ahead of Jakarta falls back to the WIB day', tokyo.date, '2026-11-04')

// ── Recent-photo window (for "Taken just now? Use where you are") ─────
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString()
eq('5h59m ago is recent', isRecentPhoto(ago(359), NOW), true)
eq('exactly 6h ago is recent', isRecentPhoto(ago(360), NOW), true)
eq('6h01m ago is not recent', isRecentPhoto(ago(361), NOW), false)
eq('5 min in the future is recent (fast clock)', isRecentPhoto(ago(-5), NOW), true)
eq('1h in the future is not recent', isRecentPhoto(ago(-60), NOW), false)
eq('unknown time is not recent', isRecentPhoto(null, NOW), false)
eq('garbage time is not recent', isRecentPhoto('nope', NOW), false)
eq('custom window: 90 min vs 1h', isRecentPhoto(ago(90), NOW, 1), false)
eq('custom window: 30 min vs 1h', isRecentPhoto(ago(30), NOW, 1), true)

// ── Camera photos without EXIF were taken just now ────────────────────
const bare = { date: null, takenAt: null, latitude: null, longitude: null }
eq('capture time fills a bare photo', withCaptureTime(bare, lateNow), { date: '2026-11-04', takenAt: '2026-11-04T16:30:00.000Z', latitude: null, longitude: null })
const exifPhoto = { date: '2026-10-31', takenAt: iso('2026-10-31T19:30:00'), latitude: null, longitude: null }
ok('capture time never replaces EXIF', withCaptureTime(exifPhoto, lateNow) === exifPhoto, withCaptureTime(exifPhoto, lateNow))
eq('camera photo is recent', isRecentPhoto(pickPhotoMeta([withCaptureTime(bare, lateNow)], lateNow).newestTakenAt, lateNow), true)

// ── Day range for the multi-day note ──────────────────────────────────
eq('range in one month', formatDayRange('2026-09-14', '2026-09-16', NOW), '14 to 16 September')
eq('range across months', formatDayRange('2026-09-30', '2026-10-02', NOW), '30 September to 2 October')
eq('range across years', formatDayRange('2025-12-30', '2026-01-02', NOW), '30 December 2025 to 2 January 2026')
eq('range in an earlier year', formatDayRange('2025-09-14', '2025-09-16', NOW), '14 to 16 September 2025')
eq('range of one day', formatDayRange('2026-09-14', '2026-09-14', NOW), '14 September')

for (const f of failures) console.log(`FAIL ${f}`)
if (failures.length) {
  console.log(`moment autofill verification FAILED: ${failures.length} of ${checks} checks`)
  process.exit(1)
}
console.log(`moment autofill verification passed (${checks} checks)`)
