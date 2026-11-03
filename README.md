# Nanti Kita (couple-app)

Mobile-first PWA for Indonesian couples: readiness assessment, daily and AI questions, Deep Talk (10 themed packs, all open) and Samakan games, Kangen button, time-locked letters, shared calendar with reminders, multiple savings goals and wishlist, a shared pet, and **Moments** (photo diary of every date, up to 7 photos with place + GPS) with reactions, comments, a map and a printable scrapbook.

v0.6 added a **Jelajah** tab that lists every feature: mood check-in, bucket list, gratitude jar (Toples Apresiasi), daily-answer archive, milestones, AI date ideas, a shared timeline (Perjalanan Kita), an activity feed, a monthly recap, notification settings with quiet hours, data export, leave couple and delete account. Partners see each other's changes live.

## Tech stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Supabase: auth, Postgres with RLS, storage (`avatars` public, `moments` private), realtime (Samakan broadcast + live updates between partners via `postgres_changes`)
- Web Push (VAPID) via a service worker (`public/sw.js`), per-type switches and quiet hours
- GPT Luna (`openai/gpt-6-luna`) via OpenRouter for the AI daily question and AI date ideas, through the Vercel AI SDK and the module library's `llm-provider` (`src/lib/llm-provider/`, wired in `src/lib/llm.ts`)
- Leaflet + OpenStreetMap tiles for the moments map
- Deploy: Vercel (see [DEPLOY.md](DEPLOY.md))

## Run locally

Needs Node 22+, Docker (or colima) and the Supabase CLI.

```bash
npm install
supabase start          # local Supabase on ports 5642x (see supabase/config.toml)
npm run dev -- -p 3030  # http://localhost:3030
```

`.env.development.local` points `next dev` at the local Supabase (URL + the standard local demo keys) and sets `PAYMENT_DUMMY=true` and `CRON_SECRET`. `.env.local` supplies the rest (VAPID keys). Without an OpenRouter key the two AI features answer 503 "Fitur AI belum diaktifkan". Every variable is documented in `.env.example`.

Two ways to give the app the OpenRouter key (GPT Luna):

- **Admin → AI** (`/admin/ai`, via Profil → Admin Panel → Pengaturan AI): paste the key, it is stored encrypted in Supabase Vault, and only its last 4 characters are ever shown. This key wins over `LLM_API_KEY`. The page also has a *Tes koneksi* button and a model override.
- **`ENV-PASTE.md`** (git-ignored): paste `LLM_API_KEY` (and optional VAPID/cron values) there, then run `npm run env:paste`. The values are validated and moved into `.env.development.local`, and the secrets in the `.md` are blanked again. Supabase and app URLs are skipped, because local dev stays on the local stack. `next dev` reloads env on its own.

`supabase db reset` rebuilds the database from `supabase/migrations` (including the 10 Deep Talk packs) and loads `supabase/seed.sql`: two demo accounts already paired as a couple (one admin; logins listed at the top of the seed file).

Cron routes can be called locally: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3030/api/cron/event-reminders`.

## Checks

```bash
npx tsc --noEmit
npx next lint
npm test                                  # vitest: AI features against a local fake OpenAI-compatible server (offline, no key) + llm-provider module tests
node scripts/verify/rls-flows.mjs         # signup, couple join, RLS isolation, every write path
node scripts/verify/moments.mjs           # Moments: private photos, 7-photo cap, delete cleanup
node scripts/verify/moments-social.mjs    # reactions, comments, favourites, bucket → moment link
node scripts/verify/account.mjs           # leave/close couple, delete account, invite expiry, prefs, export
node scripts/verify/finance-calendar.mjs  # transaction edit/delete rules, goals, reminders cron
node scripts/verify/connection.mjs        # mood, bucket list, gratitude jar, archive, milestones
node scripts/verify/feed-realtime.mjs     # activity triggers, realtime isolation, AI quota
node scripts/verify/llm-settings.mjs      # Admin → AI: key in Vault, admin-only RPCs/API, key never echoed (refuses if a key is stored)
node scripts/verify/exif.mjs              # EXIF date/GPS reader on fixtures
node scripts/verify/pet-rules.mjs
node scripts/verify/env-coverage.mjs
node scripts/verify/layout-audit.mjs      # every page at 360 + 390 px (long names/amounts, empty, no partner): overlaps, clipped or spilling text, horizontal scroll, content under the bottom nav, sheets
```

The `verify` scripts refuse to run unless Supabase points at localhost; they create and delete their own test users. Some call API routes, so keep the app running on :3030. The layout audit (Playwright) is most reliable against a production build: `set -a; . ./.env.development.local; set +a; npx next build && npx next start -p 3030`. It writes `report.md` and screenshots to `.unlazy/layout-audit/`.

## Database

Migrations in `supabase/migrations` (apply in order):

| File | What |
|---|---|
| `20260401000000_base_schema.sql` | All V2 tables, RLS, avatars bucket, triggers (rebuilt 2026-10-26 from the generated types — the original hosted project no longer exists) |
| `20260604120000_add_premium_tier_to_couples.sql` | `couples.is_premium`, `unlocked_at` |
| `20261026120000_moments.sql` | Moments tables + private `moments` bucket |
| `20261026130000_hardening.sql` | Audit fixes: couple create/join RPCs, letter time-lock in the DB, savings balance trigger, premium gate for Deep Talk, push ownership, uniqueness rules |
| `20261026140000_letter_unlock_notify.sql` | letter-unlocked push bookkeeping |
| `20261026150000_admin_least_privilege.sql` | admins manage content, not couples' private data |
| `20261026160000_server_rules.sql` | pet care, Kangen limits and savings overdraw enforced in the DB |
| `20261027120000_features_v06.sql` | v0.6 schema: invite expiry, leave couple, notification prefs, transaction edit rules, reminders, reactions/comments, mood, bucket list, gratitude jar, AI date-idea quota, activity feed triggers, free Deep Talk packs, realtime publication |
| `20261027130000_deep_talk_packs.sql` | 10 Deep Talk packs × 3 levels × 6 questions |
| `20261027140000_review_fixes.sql` | v0.6 review: closed couples, safe join (`p_discard`), letters sender/receiver only, goal-couple checks, activity cleanup |

Key RPCs the app calls: `create_couple`, `join_couple`, `leave_couple`, `regenerate_invite_code`, `read_letter`, `complete_deep_talk_level`, `perform_pet_care`, `save_push_subscription`.

## Project structure

```
src/app/            routes (app/, auth/, onboarding/, admin/, api/)
src/components/     UI (app/, account/, finance/, game/, moments/, admin/, ui/)
src/lib/            data + helpers (supabase clients, realtime, moments, milestones, mood, push-server, …)
src/types/database.ts   generated Supabase types (+ RPC signatures)
supabase/           config, migrations, seed
scripts/verify/     local verification scripts
```
