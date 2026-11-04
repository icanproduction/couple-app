#!/usr/bin/env node
// Structure + overlap check for the Deep Talk level 4/5 content files
// (content/deep-talk-l45/<slug>.ts, shape in content/deep-talk-l45/types.ts).
//
//   node scripts/verify/dt-l45-check.mjs --files content/deep-talk-l45/bahasa-sayang.ts,content/deep-talk-l45/seru-aja.ts
//   node scripts/verify/dt-l45-check.mjs --all          # every pack must be present
//
// Checks: known slug matching the file name; exactly levels 4 and 5; title
// 2-28 chars; description 10-70 chars; 6 questions per level, 25-200 chars,
// ending in "?" or "."; target null|1|2; no duplicates inside the pack or
// against the pack's existing level 1-3 questions in the local DB; no em dash.
// Prints "deep talk l45 content check passed" only when every check holds.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const DIR = 'content/deep-talk-l45'
const SLUGS = ['cerita-awal-kita', 'akar-keluarga', 'uang-kita', 'menuju-pelaminan', 'rumah-dan-anak', 'saat-kita-berbeda', 'bahasa-sayang', 'mimpi-berdua', 'iman-dan-nilai', 'seru-aja']
const args = process.argv.slice(2)
const files = args.includes('--all')
  ? SLUGS.map((s) => `${DIR}/${s}.ts`)
  : (args.includes('--files') ? args[args.indexOf('--files') + 1] : '').split(',').filter(Boolean)
if (!files.length) { console.error('usage: dt-l45-check.mjs --files a.ts,b.ts | --all'); process.exit(2) }

function literal(node, sf) {
  if (!node) return undefined
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node) || ts.isParenthesizedExpression(node)) return literal(node.expression, sf)
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (node.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((e) => literal(e, sf))
  if (ts.isObjectLiteralExpression(node)) {
    const o = {}
    for (const p of node.properties) if (ts.isPropertyAssignment(p)) o[p.name.getText(sf).replace(/^['"]|['"]$/g, '')] = literal(p.initializer, sf)
    return o
  }
  throw new Error(`non-literal value at ${sf.fileName}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} (use plain literals)`)
}

function existingQuestions(slug) {
  const sql = `select coalesce(json_agg(q.question_text), '[]') from public.deep_talk_questions q join public.deep_talk_levels l on l.id = q.level_id join public.deep_talk_packs p on p.id = l.pack_id where p.slug = '${slug}' and l.level_number <= 3;`
  const r = spawnSync('docker', ['exec', '-i', 'supabase_db_couple-app', 'psql', '-U', 'postgres', '-d', 'postgres', '-At'], { input: sql, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`psql failed: ${r.stderr}`)
  return JSON.parse(r.stdout.trim())
}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

const problems = []
let questions = 0
for (const rel of files) {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) { problems.push(`${rel}: missing`); continue }
  const sf = ts.createSourceFile(rel, fs.readFileSync(abs, 'utf8'), ts.ScriptTarget.Latest, true)
  let pack
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (d.name.getText(sf) === 'pack') pack = literal(d.initializer, sf)
  }
  const at = (m) => problems.push(`${rel}: ${m}`)
  if (!pack) { at('no `export const pack`'); continue }
  const slug = path.basename(rel, '.ts')
  if (pack.slug !== slug || !SLUGS.includes(slug)) at(`slug "${pack.slug}" must equal a known slug and the file name`)
  const levels = pack.levels ?? []
  if (levels.length !== 2 || levels[0]?.level !== 4 || levels[1]?.level !== 5) at('levels must be exactly [4, 5] in order')
  const old = new Set(existingQuestions(slug).map(norm))
  if (old.size < 18) at(`expected 18 existing level 1-3 questions in the local DB, found ${old.size}`)
  const seen = new Set()
  for (const lv of levels) {
    const where = `level ${lv?.level}`
    if (typeof lv?.title !== 'string' || lv.title.length < 2 || lv.title.length > 28) at(`${where}: title must be 2-28 chars`)
    if (typeof lv?.description !== 'string' || lv.description.length < 10 || lv.description.length > 70) at(`${where}: description must be 10-70 chars`)
    const qs = lv?.questions ?? []
    if (qs.length !== 6) at(`${where}: needs exactly 6 questions (has ${qs.length})`)
    for (const [i, q] of qs.entries()) {
      questions++
      const t = q?.text
      if (typeof t !== 'string' || t.length < 25 || t.length > 200) { at(`${where} q${i + 1}: text must be 25-200 chars`); continue }
      if (!/[?.]$/.test(t)) at(`${where} q${i + 1}: must end with "?" or "."`)
      if (/[—]/.test(t + lv.title + lv.description)) at(`${where} q${i + 1}: em dash`)
      if (![null, 1, 2].includes(q.target)) at(`${where} q${i + 1}: target must be null, 1 or 2`)
      const n = norm(t)
      if (seen.has(n)) at(`${where} q${i + 1}: duplicate inside the pack`)
      if (old.has(n)) at(`${where} q${i + 1}: repeats an existing level 1-3 question`)
      seen.add(n)
    }
  }
}
problems.forEach((p) => console.log(p))
if (problems.length) { console.log(`deep talk l45 content check FAILED: ${problems.length} problem(s)`); process.exit(1) }
console.log(`deep talk l45 content check passed: ${files.length} file(s), ${questions} questions`)
