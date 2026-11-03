// The pet rules are enforced in the database (public.pet_care_rules()); the UI
// shows its own copy (src/types/pet.ts CARE_ACTION_META, src/lib/pet.ts
// DECAY_PER_HOUR / XP_PER_ACTION). This fails when the two drift apart.
//   node scripts/verify/pet-rules.mjs      (local Supabase, seed loaded)
// Prints "PET RULES IN SYNC" only when every value matches.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')

const env = {}
for (const f of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  const p = join(root, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const { CARE_ACTION_META } = await import(join(root, 'src', 'types', 'pet.ts'))
const petLib = readFileSync(join(root, 'src', 'lib', 'pet.ts'), 'utf8')
const tsDecay = Number(petLib.match(/export const DECAY_PER_HOUR = ([\d.]+)/)?.[1])
const tsXp = Number(petLib.match(/export const XP_PER_ACTION = (\d+)/)?.[1])

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
await supabase.auth.signInWithPassword({ email: 'raka@couple.local', password: 'couple123' })
const { data: rules, error } = await supabase.rpc('pet_care_rules')
if (error || !rules) {
  console.error('could not read pet_care_rules():', error?.message)
  process.exit(1)
}

const diffs = []
if (Number(rules.decay_per_hour) !== tsDecay) diffs.push(`decay_per_hour sql=${rules.decay_per_hour} ts=${tsDecay}`)
if (Number(rules.xp_per_action) !== tsXp) diffs.push(`xp_per_action sql=${rules.xp_per_action} ts=${tsXp}`)
const tsActions = Object.keys(CARE_ACTION_META).sort()
const sqlActions = Object.keys(rules.actions).sort()
if (tsActions.join() !== sqlActions.join()) diffs.push(`actions sql=${sqlActions} ts=${tsActions}`)
for (const a of tsActions) {
  const ts = CARE_ACTION_META[a]
  const sql = rules.actions[a]
  if (!sql) continue
  if (sql.stat !== ts.stat) diffs.push(`${a}.stat sql=${sql.stat} ts=${ts.stat}`)
  if (Number(sql.restore) !== ts.restoreAmount) diffs.push(`${a}.restore sql=${sql.restore} ts=${ts.restoreAmount}`)
  if (Number(sql.cooldown_minutes) !== ts.cooldownMinutes) diffs.push(`${a}.cooldown sql=${sql.cooldown_minutes} ts=${ts.cooldownMinutes}`)
}

console.log(`${tsActions.length} actions compared`)
for (const d of diffs) console.log(`DRIFT ${d}`)
if (diffs.length) process.exit(1)
console.log('PET RULES IN SYNC')
