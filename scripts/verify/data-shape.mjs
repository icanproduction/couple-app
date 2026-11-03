#!/usr/bin/env node
// Proves a copy change in data files kept the data: for every exported
// constant it records array lengths and the values of identity-like keys
// (id, key, slug, type, value, …), then compares against a snapshot.
// Display text may change; ids, keys, stored values and item counts may not.
//
//   node scripts/verify/data-shape.mjs --snapshot <file.json> --paths src/data,src/lib/spending-assessment
//   node scripts/verify/data-shape.mjs --check    <file.json> --paths src/data,src/lib/spending-assessment
//
// Prints "data shape preserved" only when nothing differs.

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const args = process.argv.slice(2)
const mode = args[0]
const file = args[1]
const paths = (args.includes('--paths') ? args[args.indexOf('--paths') + 1] : '').split(',').filter(Boolean)
if (!['--snapshot', '--check'].includes(mode) || !file || !paths.length) {
  console.error('usage: data-shape.mjs --snapshot|--check <file.json> --paths a,b')
  process.exit(2)
}
const ID_KEYS = new Set(['id', 'key', 'slug', 'type', 'value', 'code', 'category', 'kind', 'dimension', 'trait', 'mbti', 'axis', 'side', 'pole', 'weight', 'score', 'points', 'correct', 'answer', 'level', 'round', 'roundType', 'emoji', 'icon', 'min', 'max', 'step', 'order', 'index', 'tier', 'amount', 'cost', 'price'])

function shapeOf(node, sf) {
  if (!node) return null
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node) || ts.isParenthesizedExpression(node)) return shapeOf(node.expression, sf)
  if (ts.isArrayLiteralExpression(node)) return { len: node.elements.length, items: node.elements.map((e) => shapeOf(e, sf)) }
  if (ts.isObjectLiteralExpression(node)) {
    const o = {}
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p)) continue
      const k = p.name.getText(sf).replace(/^['"]|['"]$/g, '')
      const v = p.initializer
      if (ID_KEYS.has(k) && (ts.isStringLiteral(v) || ts.isNumericLiteral(v) || v.kind === ts.SyntaxKind.TrueKeyword || v.kind === ts.SyntaxKind.FalseKeyword || ts.isPrefixUnaryExpression(v))) o[k] = v.getText(sf)
      else if (ts.isArrayLiteralExpression(v) || ts.isObjectLiteralExpression(v) || ts.isAsExpression(v)) o[k] = shapeOf(v, sf)
      else if (ID_KEYS.has(k)) o[k] = `<expr>`
    }
    return o
  }
  return null
}

function walk(t, out) {
  const abs = path.resolve(ROOT, t)
  if (fs.statSync(abs).isFile()) return out.push(abs)
  for (const f of fs.readdirSync(abs)) if (!f.startsWith('.') && f !== '__tests__') walk(path.join(t, f), out)
}

const files = []
for (const p of paths) walk(p, files)
const shape = {}
for (const abs of files.filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))) {
  const rel = path.relative(ROOT, abs)
  const sf = ts.createSourceFile(rel, fs.readFileSync(abs, 'utf8'), ts.ScriptTarget.Latest, true)
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue
    for (const d of st.declarationList.declarations) {
      const s = shapeOf(d.initializer, sf)
      if (s && (s.len !== undefined || Object.keys(s).length)) shape[`${rel}#${d.name.getText(sf)}`] = s
    }
  }
}

if (mode === '--snapshot') {
  fs.writeFileSync(file, JSON.stringify(shape))
  console.log(`snapshot written: ${Object.keys(shape).length} constants`)
  process.exit(0)
}
const before = JSON.parse(fs.readFileSync(file, 'utf8'))
const problems = []
for (const [k, v] of Object.entries(before)) {
  if (!(k in shape)) problems.push(`removed or renamed: ${k}`)
  else if (JSON.stringify(shape[k]) !== JSON.stringify(v)) problems.push(`ids/keys/counts changed: ${k}`)
}
problems.slice(0, 50).forEach((p) => console.log(p))
if (problems.length) { console.log(`data shape FAILED: ${problems.length} constant(s) differ`); process.exit(1) }
console.log(`data shape preserved: ${Object.keys(before).length} constants`)
