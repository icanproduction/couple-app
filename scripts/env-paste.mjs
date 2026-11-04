// Moves the env values pasted into ENV-PASTE.md into .env.development.local
// (what `npm run dev` reads), then blanks the secrets in the .md again.
//   npm run env:paste
//   node scripts/env-paste.mjs [--md <file>] [--env <file>] [--keep]
// Prints variable names only; secrets show their last 4 characters at most
// (the same 4 Admin → AI shows). Writes nothing when any value is malformed.
//
// v0.8: all app AI is Claude Sonnet through ANTHROPIC_API_KEY (read only by
// src/lib/claude.ts). The old OpenRouter settings (LLM_API_KEY,
// LLM_MODEL_SYNTHESIS, LLM_BASE_URL) are no longer read by the app: they are
// skipped with a note and, being secrets, blanked in the .md like the rest.
import { readFileSync, writeFileSync, existsSync, renameSync, chmodSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const mdPath = resolve(arg('--md') ?? join(root, 'ENV-PASTE.md'))
const envPath = resolve(arg('--env') ?? join(root, '.env.development.local'))
const keep = args.includes('--keep')

// What local dev may take from the paste. Each check returns true or the problem.
// No message ever contains the value.
const VALID = {
  ANTHROPIC_API_KEY: (v) => (/^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(v)) || 'bukan format key Anthropic: tempel key lengkap dari console.anthropic.com (diawali sk-ant-)',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: (v) => /^[A-Za-z0-9_-]{40,200}$/.test(v) || 'bukan VAPID public key (npx web-push generate-vapid-keys)',
  VAPID_PRIVATE_KEY: (v) => /^[A-Za-z0-9_-]{20,200}$/.test(v) || 'bukan VAPID private key',
  VAPID_SUBJECT: (v) => /^(mailto:|https:\/\/)[^\s"'`$\\]+$/.test(v) || 'harus mailto:… atau https://…',
  CRON_SECRET: (v) => /^[A-Za-z0-9._~+\/=-]{16,200}$/.test(v) || 'minimal 16 karakter, huruf/angka saja',
  PAYMENT_DUMMY: (v) => /^(true|false)$/.test(v) || 'isi true atau false',
}
// Read by nothing since v0.8 (Claude replaced OpenRouter).
const RETIRED = new Set(['LLM_API_KEY', 'LLM_MODEL_SYNTHESIS', 'LLM_BASE_URL'])
// Local dev stays on the local Supabase stack (the verify scripts refuse
// anything else); these belong in Vercel when deploying.
const DEPLOY_ONLY = new Set(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_APP_URL'])
const isSecret = (name) => /KEY|SECRET|TOKEN|PASSWORD/.test(name)
const shown = (name, v) => (isSecret(name) ? `••••${v.slice(-4)}` : v)

if (!existsSync(mdPath)) {
  console.error(`Tidak ada ${mdPath}`)
  process.exit(1)
}
const mdLines = readFileSync(mdPath, 'utf8').split('\n')

/** name → { value, at: [{ i, bare }] } — `bare` = a key pasted without a name. */
const found = new Map()
const problems = []
mdLines.forEach((raw, i) => {
  const line = raw.replace(/\r$/, '').trim()
  if (!line || line.startsWith('#')) return
  let name
  let value
  const bare = line.match(/^(?:Bearer\s+)?(sk-(?:ant|or)-[A-Za-z0-9._:-]+)$/)
  if (bare) {
    name = bare[1].startsWith('sk-ant-') ? 'ANTHROPIC_API_KEY' : 'LLM_API_KEY'
    value = bare[1]
  } else {
    const m = line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (!m) return
    name = m[1]
    const quoted = m[2].match(/^(["'])(.*)\1$/)
    value = (quoted ? quoted[2] : m[2].replace(/\s+#.*$/, '')).trim()
  }
  if (!value) return
  const prev = found.get(name)
  if (prev && prev.value !== value) problems.push(`${name} diisi lebih dari sekali dengan nilai berbeda: sisakan satu`)
  found.set(name, { value, at: [...(prev?.at ?? []), { i, bare: !!bare }] })
})

const apply = []
const retired = []
for (const [name, { value }] of found) {
  if (DEPLOY_ONLY.has(name)) { console.log(`dilewati  ${name}: dev lokal tetap pakai Supabase lokal`); continue }
  if (RETIRED.has(name)) {
    retired.push(name)
    console.log(`dilewati  ${name}: sudah tidak dipakai sejak v0.8 (AI pakai Claude). Isi ANTHROPIC_API_KEY=sk-ant-… saja`)
    continue
  }
  const check = VALID[name]
  if (!check) { console.log(`dilewati  ${name}: tidak dipakai aplikasi ini`); continue }
  if (/^your-|^<.*>$/.test(value)) { problems.push(`${name}: masih contoh, belum nilai asli`); continue }
  const result = check(value)
  if (result !== true) { problems.push(`${name}: ${result}`); continue }
  apply.push([name, value])
}
if (problems.length) {
  for (const p of problems) console.error(`MASALAH   ${p}`)
  console.error('Tidak ada yang ditulis. Perbaiki ENV-PASTE.md lalu jalankan lagi.')
  process.exit(1)
}

/** Blanks pasted secrets (applied ones and retired ones) unless --keep. */
function blankSecrets(names) {
  if (keep) return
  const drop = new Set()
  let changed = false
  for (const [name, { at }] of found) {
    if (!names.has(name) || !isSecret(name)) continue
    for (const { i, bare } of at) {
      if (bare) { drop.add(i); changed = true; continue }
      const blanked = mdLines[i].replace(/=.*$/, '=')
      if (blanked !== mdLines[i]) { mdLines[i] = blanked; changed = true }
    }
  }
  if (!changed) return
  writeFileSync(mdPath, mdLines.filter((_, i) => !drop.has(i)).join('\n'))
  console.log('Nilai rahasia di ENV-PASTE.md sudah dikosongkan lagi (--keep untuk membiarkannya).')
}

if (!apply.length) {
  blankSecrets(new Set(retired))
  console.log('Belum ada nilai yang diisi di ENV-PASTE.md.')
  process.exit(0)
}

// Merge: replace the variable's line if it exists, else append under a header.
const envLines = existsSync(envPath) ? readFileSync(envPath, 'utf8').replace(/\n+$/, '').split('\n') : []
const header = '# --- dari ENV-PASTE.md (npm run env:paste) ---'
for (const [name, value] of apply) {
  const re = new RegExp(`^\\s*(export\\s+)?${name}\\s*=`)
  const idx = envLines.findLastIndex((l) => re.test(l))
  if (idx >= 0) envLines[idx] = `${name}=${value}`
  else {
    if (!envLines.includes(header)) envLines.push('', header)
    envLines.push(`${name}=${value}`)
  }
}
// Temp name still matches .env*.local, so it is git-ignored even mid-write.
const tmp = join(dirname(envPath), '.env.paste-tmp.local')
writeFileSync(tmp, envLines.join('\n') + '\n', { mode: 0o600 })
renameSync(tmp, envPath)
chmodSync(envPath, 0o600)

const rel = relative(root, envPath)
console.log(`Ditulis ke ${rel.startsWith('..') ? envPath : rel}:`)
for (const [name, value] of apply) console.log(`  ${name.padEnd(30)} ${shown(name, value)}`)

blankSecrets(new Set([...apply.map(([n]) => n), ...retired]))

// The old LLM_* lines in the env file are dead weight now: name them, never their values.
const stale = envLines.map((l) => l.match(/^\s*(?:export\s+)?(LLM_[A-Z0-9_]+)\s*=\s*\S/)?.[1]).filter(Boolean)
if (stale.length) console.log(`Catatan: ${[...new Set(stale)].join(', ')} masih ada di ${rel.startsWith('..') ? envPath : rel} tapi tidak dibaca lagi; boleh dihapus.`)
if (apply.some(([n]) => n === 'ANTHROPIC_API_KEY')) {
  console.log('Selesai. Cek di Admin Panel → AI → Test connection (next dev memuat ulang env sendiri).')
} else {
  console.log('Selesai.')
}
