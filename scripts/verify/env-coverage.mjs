// Every process.env.X read by the app must be documented in .env.example,
// so a fresh deploy can't miss one.
//
//   node scripts/verify/env-coverage.mjs
//
// Prints "ENV COVERAGE OK" only when nothing is missing; exits 1 otherwise.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
// Set by Next.js / Node themselves, never by us.
const BUILTIN = new Set(['NODE_ENV', 'NEXT_RUNTIME', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(p)
  }
  return out
}

const used = new Map()
for (const file of [...walk(join(root, 'src')), join(root, 'next.config.js')]) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    if (BUILTIN.has(m[1])) continue
    if (!used.has(m[1])) used.set(m[1], file.slice(root.length + 1))
  }
}

const documented = new Set(
  readFileSync(join(root, '.env.example'), 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*#?\s*([A-Z0-9_]+)\s*=/)?.[1])
    .filter(Boolean)
)

if (used.size === 0) {
  console.error('No env usage found — scanner is broken')
  process.exit(1)
}

const missing = [...used].filter(([k]) => !documented.has(k))
console.log(`${used.size} env vars used, ${documented.size} documented`)
for (const [k, f] of missing) console.log(`MISSING ${k} (first used in ${f})`)
if (missing.length) process.exit(1)
console.log('ENV COVERAGE OK')
