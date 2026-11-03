#!/usr/bin/env node
// Copy audit for the English switch (docs/COPY-GUIDE.md).
//
// Flags user-facing strings that are still Indonesian or contain an em dash.
// Sources: TS/TSX string literals, template text and JSX text (TypeScript AST,
// so comments and identifiers never count), public/manifest.json,
// public/offline.html, and with --db the local database: Deep Talk content
// plus every string literal inside public SQL functions (RAISE messages,
// trigger-written activity text).
//
//   node scripts/verify/copy-audit.mjs                      # src + public
//   node scripts/verify/copy-audit.mjs --paths src/app/auth,src/app/onboarding
//   node scripts/verify/copy-audit.mjs --db                 # local DB only
//   node scripts/verify/copy-audit.mjs --fixture f.tsx      # negative control
//   node scripts/verify/copy-audit.mjs --paths src/app --corpus out.txt
//
// Skip one line on purpose with a `copy-ok: <reason>` comment on that line or
// the line above (stored enum values, matchers that must accept old text).
// Prints "copy audit passed" only when nothing is flagged; exits 1 otherwise.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const has = (name) => args.includes(name)

// Unambiguous Indonesian words (none is a common English word).
const MARKERS = [
  'yang', 'dan', 'untuk', 'dengan', 'kamu', 'kalian', 'kita', 'kami', 'saya', 'aku', 'anda',
  'ini', 'itu', 'sudah', 'belum', 'tidak', 'bisa', 'akan', 'dari', 'atau', 'juga', 'lagi',
  'gagal', 'simpan', 'hapus', 'batal', 'batalkan', 'buat', 'coba', 'pasangan', 'pasanganmu',
  'kenangan', 'hari', 'bulan', 'tahun', 'minggu', 'surat', 'tabungan', 'pengingat', 'masuk',
  'keluar', 'daftar', 'kirim', 'lihat', 'semua', 'baru', 'sekarang', 'nanti', 'dong', 'nih',
  'aja', 'ayo', 'yuk', 'mau', 'sama', 'jadi', 'tanggal', 'waktu', 'cerita', 'pertanyaan',
  'jawaban', 'kode', 'undangan', 'berhasil', 'sedang', 'harus', 'lebih', 'kurang', 'sini',
  'mana', 'apa', 'siapa', 'kapan', 'kenapa', 'bagaimana', 'gimana', 'terima', 'kasih',
  'tolong', 'silakan', 'maaf', 'selamat', 'ulang', 'tulis', 'baca', 'buka', 'tutup', 'pilih',
  'ganti', 'ubah', 'tambah', 'tambahkan', 'isi', 'kosong', 'nama', 'foto', 'oke', 'banget',
  'sih', 'kok', 'deh', 'di', 'ke', 'pada', 'oleh', 'bagi', 'agar', 'supaya', 'karena', 'jika',
  'kalau', 'saat', 'ketika', 'setelah', 'sebelum', 'hingga', 'sampai', 'tetap', 'masih',
  'hanya', 'cuma', 'tapi', 'tetapi', 'namun', 'lalu', 'kemudian', 'ya', 'belum', 'sedikit',
  'banyak', 'mulai', 'selesai', 'tunggu', 'muat', 'memuat', 'gratis', 'aktif', 'nonaktif',
  'kunci', 'terkunci', 'hapus', 'pesan', 'kangenin', 'sayang', 'cinta', 'bersama', 'berdua',
  // abbreviations and common UI nouns/verbs (added after leaf 1.1.5 found "…, dll" slipping by)
  'dll', 'dsb', 'yg', 'utk', 'dgn', 'tdk', 'sdh', 'blm', 'sinkronisasi', 'beranda', 'kalender',
  'profil', 'keuangan', 'kategori', 'catatan', 'pengaturan', 'tentang', 'bantuan', 'keamanan',
  'privasi', 'tujuan', 'rencana', 'petualangan', 'kuliner', 'liburan', 'romantis', 'belajar',
  'rumah', 'kembali', 'lanjut', 'lewati', 'bagikan', 'salin', 'unduh', 'unggah', 'cari',
  'urutkan', 'terbaru', 'terlama', 'favorit', 'hubungan', 'keluarga', 'pernikahan', 'setoran',
  'penarikan', 'saldo', 'transaksi', 'pemasukan', 'pengeluaran', 'jumlah', 'acara', 'setiap',
  'harian', 'mingguan', 'bulanan', 'tahunan', 'pagi', 'siang', 'malam', 'kemarin',
  'besok', 'menit', 'detik', 'notifikasi', 'izinkan', 'aktifkan', 'matikan', 'nyalakan',
  'terkirim', 'dibaca', 'dibuka', 'rahasia', 'balas', 'komentar', 'reaksi', 'lokasi', 'tempat',
  'galeri', 'kamera', 'gambar', 'judul', 'deskripsi', 'jadwal', 'momen', 'perjalanan', 'kuis',
  'permainan', 'tantangan', 'giliran', 'pemain', 'tebak', 'rindu', 'peluk', 'semangat',
  'bahagia', 'bersyukur', 'peliharaan', 'pasangannya', 'udah', 'gak', 'nggak', 'enggak',
]
const MARKER_RE = new RegExp(`\\b(${[...new Set(MARKERS)].join('|')})\\b`, 'i')
const NYA_RE = /\b[a-z]{3,}nya\b/i
// Kept Indonesian names (docs/COPY-GUIDE.md §Glossary). Removed before testing.
const ALLOW = ['Nanti Kita', 'Pet Kita', 'Kangen', 'Toples', 'Jelajah', 'Samakan']
const EM_DASH = '—'

const UI_ATTRS = new Set([
  'placeholder', 'title', 'alt', 'aria-label', 'aria-description', 'label', 'description',
  'subtitle', 'heading', 'message', 'emptyText', 'helperText', 'hint', 'confirmLabel',
  'cancelLabel', 'text', 'caption', 'cta', 'tooltip',
])
// Calls whose string arguments are code, not copy.
const CODE_CALLEES = new Set([
  'select', 'eq', 'neq', 'in', 'is', 'from', 'rpc', 'order', 'channel', 'on', 'match',
  'contains', 'filter', 'or', 'ilike', 'like', 'gte', 'lte', 'lt', 'gt', 'not', 'range',
  'cn', 'clsx', 'twMerge', 'classNames', 'addEventListener', 'removeEventListener',
  'getItem', 'setItem', 'removeItem', 'querySelector', 'querySelectorAll', 'getElementById',
  'setAttribute', 'getAttribute', 'createElement', 'fetch', 'push', 'replace', 'prefetch',
  'redirect', 'get', 'set', 'has', 'delete', 'append', 'require', 'import', 'RegExp',
  'split', 'join', 'includes', 'startsWith', 'endsWith', 'indexOf', 'padStart', 'padEnd',
  'toLocaleDateString', 'toLocaleTimeString', 'toLocaleString', 'NumberFormat',
  'DateTimeFormat', 'log', 'warn', 'error', 'info', 'debug', 'upload', 'createSignedUrl',
  'getPublicUrl', 'remove', 'list', 'removeChannel', 'subscribe', 'invoke', 'format',
])

// Tailwind / CSS class lists are code, never copy (they also read as
// "stacked hyphenated words" to the slop scorer).
const CLASS_TOKEN = /^!?-?[a-z0-9]+(?:[-:/.][a-z0-9[\]#%().,_'"=&>*+~-]*)*$|^!?[a-z0-9:-]*\[[^\]]+\]$/
const CLASS_UTIL = new Set(['flex', 'grid', 'block', 'inline', 'hidden', 'relative', 'absolute', 'fixed', 'sticky', 'italic', 'underline', 'truncate', 'border', 'rounded', 'shadow', 'uppercase', 'lowercase', 'capitalize', 'grow', 'shrink', 'transition', 'container', 'contents', 'static', 'visible', 'invisible', 'antialiased', 'ring', 'outline', 'blur', 'transform', 'isolate', 'group', 'peer', 'prose', 'dark', 'collapse'])
export function looksLikeClassList(s) {
  if (/[A-Z]/.test(s.replace(/\[[^\]]*\]/g, ''))) return false
  const t = s.trim().split(/\s+/).filter(Boolean)
  if (!t.length || !t.every((x) => CLASS_TOKEN.test(x))) return false
  const classy = t.filter((x) => /[-:[/]/.test(x) || CLASS_UTIL.has(x)).length
  return classy / t.length >= 0.6 && (t.length > 1 || /[-:[]/.test(t[0]))
}

// CSS values and CSS blocks (inline gradients, shadows, colors, style
// templates) are code too.
export function looksLikeCss(s) {
  const t = s.trim()
  if (/^(#[0-9a-f]{3,8}|(rgba?|hsla?|var)\([^)]*\))$/i.test(t)) return true
  if (/(linear|radial|conic)-gradient\(|\b(rgba?|hsla?)\(|var\(--|cubic-bezier\(|translate[XY3d]?\(|drop-shadow\(/i.test(t) && !/[.!?]\s|[.!?]$/.test(t.replace(/\([^)]*\)/g, ''))) return true
  const decls = t.match(/(^|[;{\s])-?[a-z-]+\s*:\s*[^;{}]+;/g) ?? []
  if (decls.length >= 2 || (decls.length === 1 && /[{}]/.test(t))) return true
  return /^(-?\d*\.?\d+(px|rem|em|%|vh|vw|deg|ms|s)?\s*){1,4}$/.test(t)
}

function isCopyOk(lines, line) {
  return /copy-ok/.test(lines[line] ?? '') || /copy-ok/.test(lines[line - 1] ?? '')
}

// Object properties whose values are data (stored values, keys, routes), never copy.
const DATA_PROPS = new Set(['id', 'key', 'slug', 'type', 'kind', 'value', 'category', 'status', 'mood', 'tab', 'filter', 'budget', 'code', 'role', 'variant', 'href', 'url', 'path', 'route', 'icon', 'color', 'tone', 'size', 'scope', 'unit', 'mode', 'sort', 'group', 'chapter_id', 'chapterId', 'round', 'roundType', 'dimension', 'heat', 'level', 'storageKey', 'queryKey', 'event', 'channel', 'table', 'column', 'field'])

function judge(text) {
  const issues = []
  if (text.includes(EM_DASH)) issues.push('em dash')
  // Route paths ("/app/perjalanan", "/app/profile/notifikasi") are code.
  let probe = text.replace(/(^|\s)\/[^\s]*/g, ' ')
  for (const a of ALLOW) probe = probe.split(a).join(' ')
  const m = probe.match(MARKER_RE) || probe.match(NYA_RE)
  if (m) issues.push(`Indonesian "${m[0]}"`)
  return issues
}

function calleeName(call) {
  const e = call.expression
  if (ts.isIdentifier(e)) return e.text
  if (ts.isPropertyAccessExpression(e)) return e.name.text
  if (ts.isNewExpression?.(call)) return undefined
  return undefined
}

function collectFromSource(file, text, sink) {
  const kind = file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.ScriptKind.TSX : file.endsWith('.js') || file.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  const lines = text.split('\n')
  const emit = (node, value) => {
    const v = value.replace(/\s+/g, ' ').trim()
    if (!v || !/\p{L}/u.test(v) || looksLikeClassList(v) || looksLikeCss(v)) return
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    if (isCopyOk(lines, line)) return
    sink.push({ file, line: line + 1, text: v })
  }
  const skipLiteral = (node) => {
    const p = node.parent
    if (!p) return false
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true
    if (ts.isLiteralTypeNode(p)) return true
    if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature?.(p) || ts.isMethodDeclaration(p)) && p.name === node) return true
    if (ts.isPropertyAssignment(p) && p.initializer === node && DATA_PROPS.has(p.name.getText(sf).replace(/^['"]|['"]$/g, ''))) return true
    if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true
    if (ts.isCaseClause(p) && p.expression === node) return true
    if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return true
    if (ts.isJsxAttribute(p)) return !UI_ATTRS.has(p.name.getText(sf))
    if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.arguments?.includes(node)) {
      const name = ts.isCallExpression(p) ? calleeName(p) : ts.isIdentifier(p.expression) ? p.expression.text : undefined
      if (name && CODE_CALLEES.has(name)) return true
    }
    // directive prologue: 'use client'
    if (ts.isExpressionStatement(p) && /^use (client|server|strict)$/.test(node.text)) return true
    return false
  }
  const visit = (node) => {
    if (ts.isJsxText(node)) emit(node, node.text)
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!skipLiteral(node)) emit(node, node.text)
    } else if (ts.isTemplateExpression(node)) {
      if (!skipLiteral(node)) emit(node, [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(' {} '))
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

function walk(target, out) {
  const abs = path.resolve(ROOT, target)
  if (!fs.existsSync(abs)) throw new Error(`path not found: ${target}`)
  const st = fs.statSync(abs)
  if (st.isFile()) return out.push(abs)
  for (const f of fs.readdirSync(abs)) {
    if (f === 'node_modules' || f === '__tests__' || f.startsWith('.')) continue
    walk(path.join(target, f), out)
  }
}

function scanFiles(targets) {
  const files = []
  for (const t of targets) walk(t, files)
  const sink = []
  for (const abs of files) {
    const rel = path.relative(ROOT, abs)
    if (/\.test\.tsx?$/.test(rel) || rel === 'src/types/database.ts') continue
    const text = fs.readFileSync(abs, 'utf8')
    if (/\.(tsx?|jsx?|mjs)$/.test(rel)) collectFromSource(rel, text, sink)
    else if (rel.endsWith('manifest.json')) {
      const j = JSON.parse(text)
      for (const k of ['name', 'short_name', 'description']) if (j[k]) sink.push({ file: rel, line: 1, text: j[k] })
      for (const s of j.shortcuts ?? []) for (const k of ['name', 'short_name', 'description']) if (s[k]) sink.push({ file: rel, line: 1, text: s[k] })
    } else if (rel.endsWith('.html')) {
      const body = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
      body.split('\n').forEach((ln, i) => {
        const vis = ln.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').trim()
        const attrs = [...ln.matchAll(/(?:content|title|alt|aria-label)="([^"]+)"/g)].map((m) => m[1])
        for (const t of [vis, ...attrs]) if (t && /\p{L}/u.test(t)) sink.push({ file: rel, line: i + 1, text: t })
      })
    }
  }
  return { files: files.length, strings: sink }
}

function psql(sql) {
  const r = spawnSync('docker', ['exec', '-i', 'supabase_db_couple-app', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`psql failed: ${r.stderr || r.error}`)
  return r.stdout
}

function scanDb() {
  const sink = []
  const content = psql(`select coalesce(json_agg(x), '[]') from (
      select 'deep_talk_packs' t, id::text, row_to_json(p)::text j from public.deep_talk_packs p
      union all select 'deep_talk_levels', id::text, row_to_json(l)::text from public.deep_talk_levels l
      union all select 'deep_talk_questions', id::text, row_to_json(q)::text from public.deep_talk_questions q) x;`)
  for (const row of JSON.parse(content.trim())) {
    const obj = JSON.parse(row.j)
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== 'string' || /(_id|^id|slug|icon|color|status|_at)$/.test(k)) continue
      sink.push({ file: `db:${row.t}.${k}`, line: row.id, text: v })
    }
  }
  const fns = psql(`select coalesce(json_agg(json_build_object('n', p.proname, 's', p.prosrc)), '[]')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prolang <> 13;`)
  for (const f of JSON.parse(fns.trim())) {
    // Strip -- comments first so apostrophes in comments can't start a literal.
    const src = f.s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
    for (const m of src.matchAll(/'((?:[^']|'')*)'/g)) {
      const v = m[1].replace(/''/g, "'")
      // A literal compared against (CASE ... WHEN 'x', = 'x', <> 'x') is a stored
      // value, not copy. A literal after a comma is NOT skipped: activity text
      // is written through values (..., 'text').
      const before = src.slice(Math.max(0, m.index - 12), m.index)
      if (/(\bwhen|=|<>|!=)\s*$/i.test(before)) continue
      if (/\s/.test(v) || MARKER_RE.test(v)) sink.push({ file: `db:fn ${f.n}()`, line: 0, text: v })
    }
  }
  return { files: 0, strings: sink }
}

function main() {
  let result
  if (opt('--fixture')) result = scanFiles([opt('--fixture')])
  else if (has('--db')) result = scanDb()
  else result = scanFiles((opt('--paths') ?? 'src,public/manifest.json,public/offline.html').split(',').map((s) => s.trim()).filter(Boolean))

  const corpus = opt('--corpus')
  if (corpus) {
    const ui = [...new Set(result.strings.map((s) => s.text).filter((t) => /\p{L}{2}/u.test(t) && (/\s/.test(t) || /^\p{Lu}/u.test(t)) && !/^[\w.-]+\/[\w./-]*$/.test(t) && !/[{}<>=]{2}|^\w+_\w+$/.test(t)))]
    fs.mkdirSync(path.dirname(path.resolve(ROOT, corpus)), { recursive: true })
    fs.writeFileSync(path.resolve(ROOT, corpus), ui.join('\n\n') + '\n')
  }

  const flagged = []
  for (const s of result.strings) {
    const issues = judge(s.text)
    if (issues.length) flagged.push({ ...s, issues })
  }
  for (const f of flagged.slice(0, 400)) console.log(`${f.file}:${f.line}  [${f.issues.join(', ')}]  ${f.text.slice(0, 140)}`)
  if (flagged.length > 400) console.log(`... ${flagged.length - 400} more`)
  const where = has('--db') ? 'db' : `${result.files} files`
  if (flagged.length) {
    console.log(`copy audit FAILED: ${flagged.length} flagged of ${result.strings.length} strings (${where})`)
    process.exit(1)
  }
  console.log(`copy audit passed: ${result.strings.length} strings, 0 flagged (${where})`)
}

try { main() } catch (e) { console.error(`copy audit ERROR: ${e.message}`); process.exit(2) }
