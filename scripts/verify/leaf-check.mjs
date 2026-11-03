#!/usr/bin/env node
// Type + lint check scoped to a set of paths, for work split across parallel
// leaves: tsc runs on the whole project (types cross files), but only errors
// inside --paths fail the check, so a sibling's half-finished edit can't fail
// this leaf. Lint runs only on --paths.
//
//   node scripts/verify/leaf-check.mjs --paths src/app/auth,src/app/onboarding
//
// Prints "leaf check passed" when the owned paths have 0 tsc errors and 0 lint
// warnings/errors.

import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const args = process.argv.slice(2)
const raw = args.includes('--paths') ? args[args.indexOf('--paths') + 1] : undefined
if (!raw) { console.error('leaf check ERROR: --paths required'); process.exit(2) }
const owned = raw.split(',').map((s) => s.trim().replace(/\/\*\*$/, '')).filter(Boolean)
const inOwned = (f) => owned.some((p) => f === p || f.startsWith(p.endsWith('/') ? p : `${p}/`))

const bin = (n) => path.join(ROOT, 'node_modules', '.bin', n)
// --incremental false: parallel leaves must not race on tsconfig.tsbuildinfo.
const tsc = spawnSync(bin('tsc'), ['--noEmit', '-p', 'tsconfig.json', '--pretty', 'false', '--incremental', 'false'],{ cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })
const tscLines = `${tsc.stdout}${tsc.stderr}`.split('\n').filter((l) => /error TS\d+/.test(l))
const mine = tscLines.filter((l) => inOwned(l.split('(')[0].trim()))
const others = tscLines.length - mine.length
mine.forEach((l) => console.log(l))
console.log(`tsc: ${mine.length} error(s) in owned paths, ${others} elsewhere (not this leaf's)`)

const lintTargets = owned.filter((p) => fs.existsSync(path.join(ROOT, p)) && /\.(tsx?|jsx?|mjs)$|^[^.]+$/.test(path.basename(p)) && /^src\//.test(p))
let lintOk = true
if (lintTargets.length) {
  const lintArgs = ['lint', '--max-warnings', '0']
  for (const p of lintTargets) lintArgs.push(fs.statSync(path.join(ROOT, p)).isDirectory() ? '--dir' : '--file', p)
  const lint = spawnSync(bin('next'), lintArgs, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })
  const lo = `${lint.stdout}${lint.stderr}`.trim()
  console.log(lo.split('\n').slice(-25).join('\n'))
  lintOk = lint.status === 0
}
if (mine.length || !lintOk) { console.log('leaf check FAILED'); process.exit(1) }
console.log('leaf check passed')
