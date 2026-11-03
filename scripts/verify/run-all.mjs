#!/usr/bin/env node
// Runs every verify suite against LOCAL Supabase and a production build on
// :3030, the way README describes, and stops the server it started.
//
//   node scripts/verify/run-all.mjs              # build + start + all suites
//   node scripts/verify/run-all.mjs --no-build   # reuse the existing .next build
//   node scripts/verify/run-all.mjs --only rls-flows,game-two-truths
//
// A suite passes only when it exits 0 AND prints its own success marker.
// Prints "all verify suites passed" only when every suite passed.

import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null

const SUITES = [
  ['env-coverage', 'ENV COVERAGE OK'],
  ['exif', 'EXIF VERIFY PASSED'],
  ['pet-rules', 'PET RULES IN SYNC'],
  ['rls-flows', 'RLS FLOWS PASSED'],
  ['moments', 'MOMENTS VERIFY PASSED'],
  ['moments-social', 'MOMENTS-SOCIAL VERIFY PASSED'],
  ['account', 'ACCOUNT VERIFY PASSED'],
  ['finance-calendar', 'FINANCE-CALENDAR VERIFY PASSED'],
  ['connection', 'CONNECTION VERIFY PASSED'],
  ['feed-realtime', 'FEED-REALTIME VERIFY PASSED'],
  ['llm-settings', 'LLM SETTINGS VERIFY PASSED'],
  ['game-truth-or-dare', 'game truth-or-dare verification passed'],
  ['game-love-languages', 'game love-languages verification passed'],
  ['game-two-truths', 'game two-truths verification passed'],
  ['layout-audit', 'LAYOUT AUDIT PASSED'],
].filter(([n]) => !only || only.includes(n))

// Same env the README uses for local runs: .env.development.local wins.
const env = { ...process.env }
const envFile = path.join(ROOT, '.env.development.local')
if (!existsSync(envFile)) { console.error('run-all ERROR: .env.development.local missing'); process.exit(2) }
for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  console.error(`run-all ERROR: refusing, NEXT_PUBLIC_SUPABASE_URL is not local (${env.NEXT_PUBLIC_SUPABASE_URL})`)
  process.exit(2)
}

const bin = (n) => path.join(ROOT, 'node_modules', '.bin', n)
const up = async () => { try { const r = await fetch('http://localhost:3030/auth/login'); return r.status < 500 } catch { return false } }

let server = null
async function startServer() {
  if (await up()) { console.log('run-all: using the server already on :3030'); return }
  if (!args.includes('--no-build')) {
    console.log('run-all: next build (local env)…')
    const b = spawnSync(bin('next'), ['build'], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 256 << 20 })
    if (b.status !== 0) { console.log(`${b.stdout}\n${b.stderr}`.split('\n').slice(-40).join('\n')); console.error('run-all ERROR: build failed'); process.exit(1) }
  }
  server = spawn(bin('next'), ['start', '-p', '3030'], { cwd: ROOT, env, stdio: 'ignore', detached: true })
  for (let i = 0; i < 120; i++) { if (await up()) return; await new Promise((r) => setTimeout(r, 1000)) }
  console.error('run-all ERROR: server did not come up on :3030'); stop(); process.exit(1)
}
function stop() { if (server) { try { process.kill(-server.pid) } catch {} server = null } }
process.on('exit', stop)

// Right after `supabase db reset` the local Realtime service rebuilds its
// replication connection when the first postgres_changes subscriber joins,
// and events in that window are lost (reproduced 2026-11-03: the first
// feed-realtime run after a reset misses one live event, the second passes).
// One service-role subscriber that joins and waits starts replication before
// any suite subscribes. It asserts nothing and changes no data.
async function warmRealtime() {
  const require = createRequire(path.join(ROOT, 'package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const ch = admin.channel(`warmup-${Date.now()}`)
  ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activities' }, () => {})
  const ok = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 15_000)
    ch.subscribe((status) => { if (status === 'SUBSCRIBED') { clearTimeout(t); resolve(true) } })
  })
  await new Promise((r) => setTimeout(r, 6000))
  await admin.removeChannel(ch)
  console.log(`run-all: realtime warm-up ${ok ? 'subscribed' : 'did not subscribe (suites will show it)'}`)
}

await startServer()
await warmRealtime()
const results = []
for (const [name, marker] of SUITES) {
  const file = path.join(ROOT, 'scripts', 'verify', `${name}.mjs`)
  if (!existsSync(file)) { results.push([name, false, 'script missing']); continue }
  const t0 = Date.now()
  const r = spawnSync(process.execPath, [file], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 256 << 20, timeout: 20 * 60 * 1000 })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const ok = r.status === 0 && out.includes(marker)
  const counts = out.match(/(\d+) passed, (\d+) failed/g)?.pop() ?? out.match(/\d+ page renders, \d+ with issues/)?.[0] ?? ''
  results.push([name, ok, `${counts} ${((Date.now() - t0) / 1000).toFixed(0)}s`.trim()])
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${counts}`)
  if (!ok) {
    console.log(out.split('\n').filter((l) => /fail|error|✗|FAIL|DRIFT|issue/i.test(l)).slice(0, 25).join('\n'))
    // Full output on disk: gate evidence is capped, so a failure must stay readable.
    mkdirSync(path.join(ROOT, '.unlazy'), { recursive: true })
    writeFileSync(path.join(ROOT, '.unlazy', `run-all.${name}.fail.log`), out)
  }
}
stop()
const failed = results.filter((r) => !r[1])
console.log(`\n${results.length - failed.length}/${results.length} suites passed`)
// Summary first in the final output so capped evidence still names the failing suite.
if (failed.length) { console.log(`run-all FAILED: ${failed.map((f) => f[0]).join(', ')} (full logs: .unlazy/run-all.<suite>.fail.log)`); process.exit(1) }
console.log('all verify suites passed')
