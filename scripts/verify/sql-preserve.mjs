#!/usr/bin/env node
// Proves an SQL copy change touched only words: every public function in the
// snapshot still exists with the same signature, and its body is identical
// once string literals and comments are blanked.
//
//   node scripts/verify/sql-preserve.mjs --snapshot .unlazy/english/fn-bodies.before.json
//   node scripts/verify/sql-preserve.mjs --check    .unlazy/english/fn-bodies.before.json
//
// Prints "sql bodies preserved" only when every snapshot function matches.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const [mode, file] = process.argv.slice(2)
if (!['--snapshot', '--check'].includes(mode) || !file) {
  console.error('usage: sql-preserve.mjs --snapshot|--check <file.json>')
  process.exit(2)
}

function psql(sql) {
  const r = spawnSync('docker', ['exec', '-i', 'supabase_db_couple-app', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 64 << 20 })
  if (r.status !== 0) throw new Error(`psql failed: ${r.stderr || r.error}`)
  return r.stdout
}

const strip = (src) => src
  .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
  .replace(/'(?:[^']|'')*'/g, "''")
  .replace(/\s+/g, ' ')
  .trim()

const rows = JSON.parse(psql(`select coalesce(json_agg(json_build_object('sig', p.oid::regprocedure::text, 'src', p.prosrc)), '[]')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prolang <> 13;`).trim())
const now = Object.fromEntries(rows.map((r) => [r.sig, strip(r.src)]))

if (mode === '--snapshot') {
  fs.writeFileSync(file, JSON.stringify(now, null, 1))
  console.log(`snapshot written: ${Object.keys(now).length} functions`)
  process.exit(0)
}

const before = JSON.parse(fs.readFileSync(file, 'utf8'))
// Deliberate logic changes made by a LATER migration, each with a reason:
// <snapshot dir>/sql-preserve.allow.json = { "<signature>": "<migration>: <reason>" }.
// They are always printed, never silently skipped.
const allowFile = path.join(path.dirname(file), 'sql-preserve.allow.json')
const allow = fs.existsSync(allowFile) ? JSON.parse(fs.readFileSync(allowFile, 'utf8')) : {}
const problems = []
const deliberate = []
for (const [sig, body] of Object.entries(before)) {
  if (!(sig in now)) problems.push(`missing or re-signed: ${sig}`)
  else if (now[sig] !== body) {
    if (typeof allow[sig] === 'string' && allow[sig].trim()) deliberate.push(`deliberate change (allow-listed): ${sig}: ${allow[sig]}`)
    else problems.push(`logic changed (not just strings): ${sig}`)
  }
}
problems.forEach((p) => console.log(p))
deliberate.forEach((d) => console.log(d))
const added = Object.keys(now).filter((s) => !(s in before))
if (added.length) console.log(`new functions (allowed, from new migrations): ${added.join(', ')}`)
if (problems.length) { console.log(`sql preserve FAILED: ${problems.length} problem(s)`); process.exit(1) }
console.log(`sql bodies preserved: ${Object.keys(before).length - deliberate.length} functions unchanged apart from strings, ${deliberate.length} deliberate change(s) listed above`)
