#!/usr/bin/env node
// AI-slop gate for in-app English copy (docs/COPY-GUIDE.md).
// Builds a corpus of user-facing strings with copy-audit.mjs, then scores it
// with SlopMonster's deslop.py. Passes only at 5/5.
//
//   node scripts/verify/slop-gate.mjs --paths src/app/auth,src/app/onboarding --name auth
//   node scripts/verify/slop-gate.mjs --db --name db
//
// Prints "slop gate passed" only on a 5/5 score.

import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const args = process.argv.slice(2)
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const name = (opt('--name') ?? 'all').replace(/[^\w.-]/g, '_')
const DESLOP = process.env.DESLOP ?? path.join(os.homedir(), '.claude/skills/slopmonster/tools/deslop.py')
if (!fs.existsSync(DESLOP)) { console.error(`slop gate ERROR: deslop.py not found at ${DESLOP}`); process.exit(2) }

const corpus = path.join('.unlazy', 'copy', `${name}.txt`)
const auditArgs = ['scripts/verify/copy-audit.mjs', '--corpus', corpus]
if (args.includes('--db')) auditArgs.push('--db')
else if (opt('--paths')) auditArgs.push('--paths', opt('--paths'))
const a = spawnSync(process.execPath, auditArgs, { cwd: ROOT, encoding: 'utf8' })
if (a.status === 2 || !fs.existsSync(path.join(ROOT, corpus))) {
  console.error(`slop gate ERROR: corpus not built\n${a.stdout}${a.stderr}`)
  process.exit(2)
}
const d = spawnSync('python3', [DESLOP, corpus], { cwd: ROOT, encoding: 'utf8' })
const out = `${d.stdout}${d.stderr}`
process.stdout.write(out)
const m = out.match(/score (\d)\/5/)
if (!m) { console.error('slop gate ERROR: no score in deslop output'); process.exit(2) }
if (m[1] !== '5') { console.log(`slop gate FAILED: ${m[1]}/5 for ${name} (corpus ${corpus})`); process.exit(1) }
console.log(`slop gate passed: 5/5 for ${name}`)
