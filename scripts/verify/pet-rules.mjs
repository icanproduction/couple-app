// The pet rules live in the database (public.pet_rules(), migration
// 20261104120000_pet_remake.sql); src/types/pet.ts PET_RULES mirrors them for
// the UI. This fails when the two drift apart: every key and value must match.
//   node scripts/verify/pet-rules.mjs      (local Supabase)
// Prints "PET RULES IN SYNC" only when the two are identical.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

// Node notes that pet.ts is ESM in a package without "type": "module"
// (harmless). Drop only that notice so the last line stays the verdict.
const printers = process.listeners('warning')
process.removeAllListeners('warning')
process.on('warning', (w) => { if (w?.code !== 'MODULE_TYPELESS_PACKAGE_JSON') for (const p of printers) p(w) })

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')

// Local stack only: keys from one file that points at localhost, else `supabase status`.
const isLocal = (u) => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(u ?? '')
let env = null
for (const f of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  const p = join(root, f)
  if (!existsSync(p)) continue
  const e = {}
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  if (isLocal(e.NEXT_PUBLIC_SUPABASE_URL) && e.SUPABASE_SERVICE_ROLE_KEY) env = e
}
if (!env) {
  const s = spawnSync('supabase', ['status', '-o', 'env'], { cwd: root, encoding: 'utf8' })
  const e = {}
  for (const line of (s.stdout ?? '').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/)
    if (m) e[m[1]] = m[2]
  }
  if (isLocal(e.API_URL) && e.SERVICE_ROLE_KEY) env = { NEXT_PUBLIC_SUPABASE_URL: e.API_URL, SUPABASE_SERVICE_ROLE_KEY: e.SERVICE_ROLE_KEY }
}
if (!env) {
  console.error('Refusing to run: no local Supabase URL + service key found (.env*.local or `supabase status`)')
  process.exit(1)
}

const { PET_RULES, levelForXp, stageForLevel, itemsForLevel, nextItem } = await import(join(root, 'src', 'types', 'pet.ts'))

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: rules, error } = await admin.rpc('pet_rules')
if (error || !rules) {
  console.error('could not read pet_rules():', error?.message)
  process.exit(1)
}

// Walk both trees; every path that differs (missing, extra, other value) is a drift.
const diffs = []
let leaves = 0
function compare(sql, ts, path) {
  const kind = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v)
  if (kind(sql) !== kind(ts)) { diffs.push(`${path}: sql=${JSON.stringify(sql)} ts=${JSON.stringify(ts)}`); return }
  if (kind(sql) === 'array') {
    if (sql.length !== ts.length) diffs.push(`${path}: length sql=${sql.length} ts=${ts.length}`)
    for (let i = 0; i < Math.max(sql.length, ts.length); i++) compare(sql[i], ts[i], `${path}[${i}]`)
    return
  }
  if (kind(sql) === 'object') {
    for (const k of new Set([...Object.keys(sql), ...Object.keys(ts)])) {
      if (!(k in sql)) diffs.push(`${path}.${k}: missing in sql`)
      else if (!(k in ts)) diffs.push(`${path}.${k}: missing in ts`)
      else compare(sql[k], ts[k], `${path}.${k}`)
    }
    return
  }
  leaves++
  if (sql !== ts) diffs.push(`${path}: sql=${JSON.stringify(sql)} ts=${JSON.stringify(ts)}`)
}
compare(rules, PET_RULES, 'rules')

// The helpers the UI uses must agree with the same table.
const sqlLevel = (xp) => Math.floor(xp / rules.xp_per_level) + 1
for (const xp of [0, 1, 99, 100, 101, 499, 500, 1234, 9999]) {
  if (levelForXp(xp) !== sqlLevel(xp)) diffs.push(`levelForXp(${xp}) = ${levelForXp(xp)}, formula says ${sqlLevel(xp)}`)
}
for (let level = 1; level <= 20; level++) {
  const want = [...rules.stages].filter((s) => s.from_level <= level).pop()?.key
  if (stageForLevel(level) !== want) diffs.push(`stageForLevel(${level}) = ${stageForLevel(level)}, rules say ${want}`)
  if (itemsForLevel(level).length !== rules.items.filter((i) => i.level <= level).length) diffs.push(`itemsForLevel(${level}) count`)
  if ((nextItem(level)?.key ?? null) !== (rules.items.find((i) => i.level === level + 1)?.key ?? null)) diffs.push(`nextItem(${level})`)
}
// One item per level from 1 to the last, no gaps.
rules.items.forEach((item, i) => { if (item.level !== i + 1) diffs.push(`items[${i}].level = ${item.level}, expected ${i + 1}`) })

console.log(`${leaves} rule values compared, ${Object.keys(rules.sources).length} warmth sources, ${rules.items.length} items`)
for (const d of diffs) console.log(`DRIFT ${d}`)
if (diffs.length) process.exit(1)
console.log('PET RULES IN SYNC')
