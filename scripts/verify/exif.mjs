// Gate check for src/lib/exif.ts against synthetic fixtures.
//   node scripts/verify/exif.mjs   (Node >= 22.6: strips TS types natively)
// Prints "EXIF VERIFY PASSED" only when every assertion holds.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const { readPhotoMeta } = await import(join(here, '..', '..', 'src', 'lib', 'exif.ts'))

const failures = []
const expect = (name, cond, got) => { if (!cond) failures.push(`${name}: got ${JSON.stringify(got)}`) }

const gps = await readPhotoMeta(readFileSync(join(here, 'fixtures', 'moment-gps.jpg')))
expect('date from DateTimeOriginal', gps.date === '2026-09-14', gps.date)
expect('takenAt read as WIB', gps.takenAt === '2026-09-14T12:30:00.000Z', gps.takenAt)
expect('latitude', Math.abs(gps.latitude - -6.175392) < 1e-5, gps.latitude)
expect('longitude', Math.abs(gps.longitude - 106.827153) < 1e-5, gps.longitude)

// Negative control: same picture without EXIF must yield nulls, not a crash.
const plain = await readPhotoMeta(readFileSync(join(here, 'fixtures', 'moment-plain.jpg')))
expect('plain has no date', plain.date === null && plain.takenAt === null, plain)
expect('plain has no gps', plain.latitude === null && plain.longitude === null, plain)

// Garbage input must not throw either.
const junk = await readPhotoMeta(new Uint8Array([1, 2, 3, 4]))
expect('junk yields nulls', junk.date === null && junk.latitude === null, junk)

for (const f of failures) console.log(`FAIL ${f}`)
if (failures.length) process.exit(1)
console.log('EXIF VERIFY PASSED')
