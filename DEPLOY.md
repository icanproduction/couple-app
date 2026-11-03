# Deploying Nanti Kita

The old hosted Supabase project (`kmyjwklsqshptnspnhvg`) and its data are gone, so a deploy starts from a fresh Supabase project. Do the steps in order.

## 1. Supabase project

1. Create a project in the region closest to users (Singapore, `ap-southeast-1`).
2. Apply the migrations from this repo:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
   This creates every table, RLS policy, RPC, trigger, both storage buckets (`avatars` public, `moments` private), the realtime publication for live updates between partners, and the 10 Deep Talk packs (free, every level open — `20261027130000_deep_talk_packs.sql`).
3. **Do not run `supabase/seed.sql` in production.** It creates demo accounts with a shared password. Edit or add Deep Talk packs through the admin panel (`/admin/deep-talk`).
4. Make the first admin (there is no UI for this):
   ```sql
   update public.profiles set role = 'admin' where id = '<user uuid>';
   ```

## 2. Supabase Auth settings

- **Site URL:** the production domain, e.g. `https://nantikita.example`.
- **Redirect URLs:** add `https://<domain>/**` and the Vercel preview pattern (`https://*-<team>.vercel.app/**`). Use the `/**` wildcard: the app sends `/auth/callback?next=...`, and an entry without a wildcard doesn't match it — Auth then silently falls back to the Site URL and the reset/confirm link fails. Email confirmation and password reset links return through `/auth/callback`.
- **Confirm email:** on by default in hosted projects. The app handles it (signup shows "Cek email kamu"); if you keep it on, set up custom SMTP — the built-in mailer is rate-limited to a few emails per hour.

## 3. Environment variables (Vercel → Settings → Environment Variables)

Set for Production and Preview. All are listed in `.env.example`.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** — never `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_APP_URL` | final domain, no trailing slash |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | reuse the old pair if the domain stays the same; a new pair forces every device to re-enable notifications (the app re-subscribes automatically when a user taps enable) |
| `VAPID_SUBJECT` | `mailto:` contact for push services |
| `LLM_API_KEY` | **server only** — OpenRouter key for the AI daily question and Ide Date AI (model `openai/gpt-6-luna`, GPT Luna; date ideas are capped at 5 per couple per day). Optional when the key is pasted in **Admin → AI** (`/admin/ai`) after deploy; that key is kept in Supabase Vault and wins over this variable. With neither set, both features answer 503 "Fitur AI belum diaktifkan". **Set a credit limit on the key in OpenRouter** (a used-up limit shows users "Kuota AI sedang habis") |
| `LLM_BASE_URL`, `LLM_MODEL_SYNTHESIS` | optional; default `https://openrouter.ai/api/v1` and `openai/gpt-6-luna`. Only set to switch endpoint/model, and always pin an exact model id, never a `~…-latest` alias |
| `PAYMENT_DUMMY` | `true` = premium unlocks free (soft launch). Unset/`false` = unlock returns "Pembayaran belum tersedia" |
| `CRON_SECRET` | random string; Vercel Cron sends it to `/api/cron/letter-unlocks` (letter-unlocked notifications) and `/api/cron/event-reminders` (calendar reminders) |

`NEXT_PUBLIC_*` values are compiled into the build — redeploy after changing them. Paste keys without trailing newlines.

**AI cost (GPT Luna via OpenRouter):** $0.10 per million input tokens, $0.50 per million output tokens. Output is capped per call (2,048 tokens for the daily question, 4,096 for date ideas, reasoning included), so a call costs at most about $0.001 (question) or $0.002 (3 ideas); the worst case per couple per day (1 question + 5 idea runs) is about $0.012. The credit limit on the OpenRouter key is the hard stop.

## 4. Vercel project

- Check `.vercel/project.json` points to the intended team/project (the old project was `couple-app`; `package.json` still names the repo `codeicanproduction/couple-app` while the git remote is `icanproduction/couple-app`).
- **Function region:** `vercel.json` pins `sin1` (Singapore) — keep it next to the Supabase region; API routes make several sequential DB calls.
- **Cron:** `vercel.json` runs `/api/cron/letter-unlocks` and `/api/cron/event-reminders` daily at 00:00 UTC (07:00 WIB) because Hobby plans allow one run per day. Reminders ("Hari ini / Besok / 3 hari lagi …") are sent once per event occurrence; both crons ignore the user's quiet hours (07:00 is their only daily chance) but respect the per-type switches. On Pro, change the letter schedule to `0 * * * *` so letters with other unlock hours notify within the hour.
- **Map tiles:** Peta Moment loads tiles from `tile.openstreetmap.org` (OSM tile usage policy: fine for light use, attribution shown). For heavy traffic switch to a tile provider with a key.
- **Skew Protection:** turn on, so users with an open tab during a deploy don't load missing chunks.
- Build command `next build` (default). Lint runs during the build; it must be clean.
- **Node.js version:** 22.x or newer (Project Settings → Build and Deployment). The AI SDK (`ai` v7) requires Node 22+.

## 5. Before taking real payments

`/api/unlock` is a dummy unlock. For real money:
1. Create an order with the gateway (Midtrans / Xendit) in `/api/unlock` instead of flipping `is_premium`.
2. Add a webhook route that verifies the gateway signature and only then sets `couples.is_premium = true`, `unlocked_at = now()` with the service role.
3. Set `PAYMENT_DUMMY=false`.
The premium gate for Deep Talk level 2+ is already enforced in the database (RLS on `deep_talk_questions`).

## 6. Smoke test after deploy

- [ ] Logged-out first visit → sign up → onboarding → invite link → partner signs up through the link and lands in the same couple.
- [ ] Login on a second account on the same phone after logout: no data or notifications from the first account.
- [ ] Install the PWA (Android Chrome, iOS 16.4+ home screen) → cold launch opens `/app/home`.
- [ ] Enable notifications on both phones → Kangen arrives on the partner's phone.
- [ ] AI question generates once; a second tap or the partner sees the same question.
- [ ] Moments: create with 3+ photos from the phone camera, GPS button asks for permission and fills the place.
- [ ] A letter locked until tomorrow can't be opened by the receiver.
- [ ] Between 00:00–07:00 WIB the daily question and "hari bersama" show today's date, not yesterday's.
- [ ] Mood check-in on one phone appears on the partner's home card without a refresh (realtime).
- [ ] Bucket list → centang → "Abadikan jadi Moment" → save → the item shows the moment link.
- [ ] Toples: a note to the partner can be drawn once with "Ambil satu".
- [ ] Scrapbook → "Cetak / Simpan PDF" produces A4 pages with photos (also from the iOS home-screen app).
- [ ] Peta Moment shows a pin for a moment saved with GPS.
- [ ] Ide Date AI returns 3 ideas; "Simpan ke Bucket List" works; the 6th request of the day is refused.
- [ ] Profil → Keluar dari pasangan: the partner sees the closed state; the old invite code no longer works.
- [ ] Deep Talk: any level of any pack opens without Premium.

## Local reference

Local development and verification scripts: see [README.md](README.md).
