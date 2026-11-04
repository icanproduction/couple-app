// Live updates between partners in a real browser (supabase-js in the page,
// not a node client). Guards two bugs that the node suites can't see:
//  1. The first channel join after a page load raced the session load and
//     went out with only the anon key, so the server refused filters on tables
//     that grant anon nothing (pet, Samakan).
//  2. supabase.removeChannel closed the shared socket when a page change left
//     the channel list empty for a moment; the next page's channels joined the
//     closing socket and never heard another change.
// Negative control (2026-11-04): with src/lib/realtime.ts reverted to the old
// subscribe/removeChannel the adopt and set-screen checks fail; with
// subscribeAsUser + leaveChannel all pass. The bucket check (an older table
// anon can't read either) passed both ways and stays as a regression guard.
//
//   node scripts/verify/realtime-browser.mjs      (app running on :3030)
//
// Prints "realtime browser verification passed" only when every check passes.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')
const { chromium } = require('playwright')

const env = {}
for (const f of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  const p = join(root, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(URL_ ?? '')) {
  console.error('Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not local')
  process.exit(1)
}
const APP = 'http://localhost:3030'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const mk = () => createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts)
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts)
const PASSWORD = 'realtime-browser-123'
const created = []
const couples = []
let passed = 0
let failed = 0
const check = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`) }
}

async function makeUser(tag, name) {
  const client = mk()
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@realtime.local`
  const { data, error } = await client.auth.signUp({ email, password: PASSWORD })
  if (error || !data.user) throw new Error(`signUp ${tag}: ${error?.message}`)
  created.push(data.user.id)
  const up = await client.from('profiles').update({
    name, birthday: '1997-03-14', relationship_start_date: '2023-02-11', gender: tag === 'b' ? 'female' : 'male', onboarding_complete: true,
  }).eq('id', data.user.id)
  if (up.error) throw new Error(`profile ${tag}: ${up.error.message}`)
  return { client, id: data.user.id, email }
}

async function openAs(browser, user) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Jakarta' })
  const page = await context.newPage()
  await page.goto(`${APP}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.fill('input[type=email]', user.email)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: 120000 })
  return page
}

async function cleanup() {
  for (const cid of couples) await admin.from('couples').delete().eq('id', cid)
  for (const id of created) await admin.auth.admin.deleteUser(id)
}

const browser = await chromium.launch()
try {
  const A = await makeUser('a', 'Arya')
  const B = await makeUser('b', 'Bunga')
  const { data: couple, error } = await A.client.rpc('create_couple')
  if (error) throw new Error(`create_couple: ${error.message}`)
  couples.push(couple.id)
  const join_ = await B.client.rpc('join_couple', { p_code: couple.invite_code })
  if (join_.error) throw new Error(`join_couple: ${join_.error.message}`)
  const pa = await openAs(browser, A)
  const pb = await openAs(browser, B)

  console.log('realtime-browser: fresh page load joins as the user')
  await check("partner's open adopt screen follows the adoption (couple_pets, no anon grant)", async () => {
    await pb.goto(`${APP}/app/pet/adopt`); await pb.waitForLoadState('networkidle')
    await pa.goto(`${APP}/app/pet/adopt`); await pa.waitForLoadState('networkidle')
    await pa.locator('[data-pet-type="cat"]').click()
    await pa.locator('#pet-name').fill('Mochi')
    await pa.getByRole('button', { name: 'Adopt Mochi' }).click()
    await pa.waitForURL(/\/app\/pet(\?|$)/, { timeout: 15000 })
    await pb.waitForURL(/\/app\/pet(\?|$)/, { timeout: 15000 })
  })
  await check("a bucket item shows on the partner's open list (bucket_items, older table)", async () => {
    await pb.goto(`${APP}/app/bucket-list`); await pb.waitForLoadState('networkidle')
    await pa.goto(`${APP}/app/bucket-list`); await pa.waitForLoadState('networkidle')
    await pa.getByRole('button', { name: 'Add the first one' }).click()
    const dlg = pa.getByRole('dialog', { name: 'Add to bucket list' })
    await dlg.locator('#bucket-title').fill('Night market in Malang')
    await dlg.getByRole('button', { name: 'Add', exact: true }).click()
    await dlg.waitFor({ state: 'hidden', timeout: 15000 })
    await pb.getByText('Night market in Malang').waitFor({ timeout: 10000 })
  })

  console.log('realtime-browser: a page change keeps the socket')
  await check("after hub -> set inside the app, the set screen hears the partner's answer", async () => {
    await pa.goto(`${APP}/app/games/samakan`); await pa.waitForLoadState('networkidle')
    await pa.getByRole('group', { name: 'Themes' }).getByRole('button', { name: 'Food' }).click()
    await pa.getByRole('dialog', { name: 'Start "Food"?' }).getByRole('button', { name: 'Start', exact: true }).click()
    await pa.waitForURL(/\/app\/games\/samakan\/set\//, { timeout: 15000 })
    const setId = pa.url().split('/set/')[1].split(/[?#]/)[0]
    for (let i = 1; i <= 7; i++) {
      await pa.getByRole('button', { name: 'Lock in' }).waitFor({ timeout: 10000 })
      for (const g of await pa.getByRole('radiogroup').all()) await g.getByRole('radio').first().click()
      await pa.getByRole('button', { name: 'Lock in' }).click()
      await pa.getByText('Locked in.').waitFor({ timeout: 10000 })
      await pa.getByRole('button', { name: i < 7 ? 'Next round' : 'Done for now' }).click()
    }
    await pa.getByText("You're done.").waitFor({ timeout: 10000 })
    const { data: rounds } = await admin.from('samakan_rounds').select('id, kind').eq('set_id', setId).order('position')
    const r = rounds[0]
    const args = r.kind === 'match' ? { p_round_id: r.id, p_pick: 0 } : r.kind === 'guess' ? { p_round_id: r.id, p_pick: 0, p_guess: 0 } : { p_round_id: r.id, p_pick: 3, p_guess: 3 }
    const ans = await B.client.rpc('samakan_answer', args)
    if (ans.error) throw new Error(`samakan_answer: ${ans.error.message}`)
    await pa.getByText('You both locked in').first().waitFor({ timeout: 10000 })
  })
} catch (e) {
  failed++
  console.log(`  ✗ setup: ${e.message}`)
} finally {
  await browser.close()
  await cleanup()
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) { console.log('realtime browser verification FAILED'); process.exit(1) }
console.log('realtime browser verification passed')
