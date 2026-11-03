# Nanti Kita — Feature Knowledge Bank
> Last updated: 2 April 2026

## Product Overview
Nanti Kita adalah PWA untuk pasangan Indonesia yang serius mempersiapkan masa depan bersama. Tagline: **"Bucin tapi realistis."**

**Tech Stack:** Next.js 14 App Router, Supabase (Auth + DB + Realtime + Storage), Tailwind CSS, TypeScript, PWA (Service Worker + Push Notifications)

**Production URL:** https://couple-app-three.vercel.app

---

## 1. AUTHENTICATION & ONBOARDING

### Auth System
- **Provider:** Supabase Auth (email + password)
- **Route protection:** Middleware (`src/middleware.ts`) — protects `/app/*`, `/onboarding/*`, `/admin/*`
- **Session:** Cookie-based via `@supabase/ssr`
- **Signout:** API route `/api/auth/signout` for proper cookie clearing

### Onboarding Flow (5 steps)
1. **Welcome** (`/onboarding/welcome`) — emotional intro, 3 feature pills, "Mari Mulai" CTA
2. **Profile** (`/onboarding/profile`) — nama panggilan, tanggal lahir, tanggal mulai bersama
3. **Couple** (`/onboarding/couple`) — buat pasangan baru (generate invite code) ATAU gabung dengan kode
4. **Invite** (`/onboarding/invite`) — tampilkan kode + link undangan, share via WhatsApp
5. **Install** (`/onboarding/install`) — PWA install guide (iOS/Android) + push notification permission

### Invite System
- 8-character alphanumeric invite code (collision retry 3x)
- Shareable link: `{APP_URL}/invite/{CODE}`
- WhatsApp deep link with pre-filled message
- Invite route (`/invite/[code]`) — redirects to signup (if not logged in) or onboarding couple step

### Auto-seed Events
- Saat couple dibuat/join → otomatis seed:
  - "Ulang Tahun {nama}" (birthday, recurring)
  - "Anniversary" (relationship start date, recurring, deduplicated)

---

## 2. HOME DASHBOARD (`/app/home`)

### Layout (top to bottom)
1. **CoupleProfileHero** — big centered avatars with heart connector, names, days together, relationship level badge
2. **Kangen Button** — send "miss you" notification to partner (30min cooldown, max 10/day)
3. **Surat Rahasia Banner** — shows when there are unread letters, with notification badge
4. **Daily Question Card** — pertanyaan hari ini with answer input, partner answer bubbles, streak counter
5. **Quick Access Grid** — 2x2 tiles: Games, Keuangan, Kalender, About Me

### Couple Level System
Based on relationship duration (from `relationship_start_date`):
| Level | Days | Badge Color |
|-------|------|-------------|
| Benih | 0-90 | Gold |
| Tumbuh | 91-365 | Sage/Green |
| Mekar | 366-730 | Rose |
| Abadi | 731+ | Rose gradient |

---

## 3. DAILY QUESTIONS

### Mechanism
- **Pool:** 52 pertanyaan bahasa Indonesia (rotates by day-of-year)
- **Input:** Textarea — user types answer, sends with button
- **Both partners answer:** Each partner sees their own answer (rose bubble) and partner's answer (sage bubble)
- **Waiting state:** Pulsing dot + "Menunggu jawaban {partner}..."
- **Celebration:** Heart banner "Kalian sudah menjawab hari ini!" when both answered

### Streak Counter
- Fire icon + "{N} hari" — counts consecutive days where BOTH partners answered
- Displayed in daily question card header

### Database
- Table: `daily_responses` (couple_id, profile_id, question_index, answer, answered_date)
- Unique: one answer per person per day
- RLS: couple members only

### Notification
- When partner answers → push: "{nama} sudah jawab pertanyaan hari ini! Giliranmu"

---

## 4. GAMES (`/app/games`)

### Games Hub
Grid of available games with locked/unlocked states.

### 4a. Samakan (Real-time Couple Sync Game)
- **Route:** `/app/games/samakan` → `/app/games/samakan/[sessionId]`
- **Mechanic:** Real-time via a Supabase Realtime channel `game:<sessionId>` (broadcast + presence, keyed by user id). The creator is host and drives the story/scoring.
- **Chapters:** 4 themed chapters (`hari-pertama`, `jalan-jalan`, `rumah-baru`, `hari-besar`), each with a story narrative + 10 rounds
- **Round Types:**
  - `pilih_sama` — both pick from the same options, score if match
  - `slider_sama` — both set a slider, closer = more points
  - `tebak_angka` — both pick a number, closer = more points
  - `tebak_pasangan` — guess what your partner will answer
- **Flow:** Lobby (ready state in presence) → Countdown → Story Intro → Rounds (with story bridges) → Story Ending → Results
- **Resilience:** host saves rounds + total_score to `game_sessions` after every reveal; a refreshed host rebuilds from the row, a refreshed guest asks the host for a `sync_state` snapshot. "Pasangan keluar" overlay when the partner disconnects; closing ends the session (`expired`) for both.
- **Sessions:** one open session (`waiting`/`playing`) per couple (unique index); stale lobbies expire after 10 min, stale games after 30 min.
- **Scoring:** 0-20 per round, percentage-based endings (high/mid/low)
- **Notification:** When game created → partner gets "ngajak main Samakan!"

### 4b. Deep Talk (Card Game)
- **Route:** `/app/games/deep-talk` → packs → levels
- **Mechanic:** Question card packs with progressive depth levels. L1 is free; L2+ needs premium (enforced in the DB: free couples can't read L2+ questions). A level with 0 questions shows "Segera Hadir" and doesn't block later levels.
- **Progress:** `complete_deep_talk_level` RPC adds to `completed_levels` atomically; replaying a finished level doesn't overwrite the resume point. Partner 1 = earliest-joined member; `target_partner` is honoured.
- **Admin panel:** `/admin/deep-talk/` — create/publish/delete packs, set color, rename/add levels, add/edit/delete questions (new packs get 3 empty levels automatically)

### 4c. Locked Games (Coming Soon)
- Truth or Dare
- Quiz Bahasa Cinta (Love Language Quiz)
- Tes Kompatibilitas

---

## 5. FINANCE (`/app/finance`)

### Savings Goal
- **Guided Wizard:** Goal type presets (Dana Nikah, Liburan, DP Rumah, Mobil, Dana Darurat, Lainnya) → Name → Target amount → Target date → Current savings → Preview calculation
- **Gradient Hero Header:** Shows total balance, progress bar, percentage, target info
- **Monthly required:** "Rp X/bulan untuk mencapai target tepat waktu"
- **Milestone messages:** 25% / 50% / 75% / 100% celebrations

### Transaction Ledger (Shared)
- **Both partners can add:** deposits (uang masuk) and withdrawals (uang keluar)
- **Each transaction tracks:** who (created_by), amount (+/-), type, category, note, timestamp
- **Categories (withdrawal):** Date Night, Anniversary, Belanja, Persiapan Nikah, Lainnya
- **Quick amount presets:** 500rb, 1jt, 2jt, 5jt
- **Transaction history:** Activity feed with colored icons, who-badge, relative dates
- **Stats row:** Saldo, Total Masuk, Total Keluar
- **Auto-recalculate:** Goal balance = SUM(all transaction amounts)

### Notification
- When partner adds transaction → push: "{nama} menambahkan Rp X ke {target}" or "{nama} mencatat pengeluaran Rp X"

### 3-Tab Wishlist
| Tab | Content | Who Can Add |
|-----|---------|-------------|
| Bersama | Shared items (rumah tangga/nikah) | Both |
| Milikku | My personal wishlist (partner can see = gift hint!) | Only me |
| {Partner Name} | Partner's wishlist (read-only, gift ideas) | Only partner |

### Wishlist Features
- **Price:** Optional Rp amount
- **Marketplace link:** Paste Shopee/Tokopedia/Lazada URL → auto-detected badge with color
- **Check/uncheck:** Mark as purchased
- **Total display:** Sum of unpurchased items per tab
- **Partner hint:** "Ini wishlist {nama} — bisa jadi ide kado!" on partner tab
- **Notification:** When item added → partner gets push

### Database Tables
- `savings_goals` — name, target_amount, current_amount, target_date
- `couple_transactions` — amount (+/-), type, category, note, created_by
- `wishlist_items` — name, price, link, image_url, is_purchased, owner_type, owner_id

---

## 6. CALENDAR (`/app/calendar`)

### Monthly Grid View
- Visual calendar with month/year navigation
- Day cells show colored dots for events
- Tap date to see events for that day
- Today highlighted

### Event Types
| Type | Icon | Color | Example |
|------|------|-------|---------|
| birthday | Gift | Gold | Ulang Tahun Eric |
| anniversary | Heart | Rose | Anniversary |
| date_plan | MapPin | Purple | Nonton Bioskop |
| reminder | Bell | Blue | Bayar cicilan |
| event | Calendar | Gray | Kondangan teman |
| milestone | Star | Sage | 1000 Hari Bersama |

### Event Scope
- **Bersama** (couple) — visible to both
- **Pribadi** (personal) — my events
- **Pasangan** (partner) — partner's events

### Event Fields
- Title, date, type, scope, is_recurring, description, location, budget, is_completed

### Date Plan Feature
- **Date Ideas Pool:** 22 ideas (8 gratis, 8 murah, 6 spesial) with descriptions & budget estimates
- **Random suggestion:** "Ide Date" card with refresh button
- **"Jadikan Date Plan":** 1-tap convert idea → date plan with date + location
- **Mark complete:** Date plans can be marked "Selesai"

### Notification
- When event created → partner gets push: "{nama} menambahkan {type}: '{title}'"

---

## 7. SURAT RAHASIA (Letters) (`/app/letters`)

### Features
- **Write letter:** `/app/letters/tulis` — max 2000 characters, set unlock date
- **Time-locked:** Letter can only be opened after unlock date
- **Read letter:** `/app/letters/[letterId]` — revealed at unlock time
- **Home banner:** Shows count of ready-to-open letters with amber animated badge

### Notification
- When letter sent → partner gets push: "Kamu punya surat yang bisa dibuka {date}"

---

## 8. KANGEN (Miss You)

### Mechanism
- Tap "Kangen" button on home → inserts to `miss_you` table
- **Cooldown:** 30 minutes between sends
- **Daily limit:** Max 10 per day
- **Visual feedback:** Button animates, shows "Terkirim!", push status indicator
- **Partner receives:** Toast notification on home + push notification

### Notification
- Push: "{nama} lagi kangen kamu"

---

## 9. ABOUT ME (`/app/about-me`)

### Personality Tests
| Test | Status | Description |
|------|--------|-------------|
| Tes MBTI | Active | 20 pertanyaan, kenali kepribadianmu |
| Love Language | Coming Soon | Cara memberi & menerima cinta |
| Bahasa Maaf | Coming Soon | Cara minta & memberi maaf |
| Spending Habits | Coming Soon | Gaya mengelola uang |
| Attachment Style | Coming Soon | Pola kelekatan dalam hubungan |

### MBTI Test (`/app/partner/mbti`)
- 20 questions, calculates 4-letter type (E/I, S/N, T/F, J/P)
- Results saved to `mbti_results` table
- Displayed on profile page

---

## 10. PROFILE (`/app/profile`)

### Features
- **Avatar upload** — crop & upload to Supabase Storage
- **Edit profile** — modal to change name, birthday, relationship start date
- **Relationship stats** — days together, level badge, start date
- **Notification toggle** — enable/disable push notifications
- **Menu Lainnya** — links to About Me, Games, Keuangan, Kalender, Surat Rahasia
- **Settings** — invite partner (if solo), help, privacy policy
- **Sign out**

---

## 11. PARTNER PAGE (`/app/partner`)

- View partner's profile, MBTI result, relationship stats
- MissYou toast (received kangen notifications)
- Partner-specific content

---

## 12. PUSH NOTIFICATIONS

### Infrastructure
- **VAPID keys** — stored in env vars
- **Service Worker** — `public/sw.js` with tiered caching strategy
- **Subscription table** — `push_subscriptions` (profile_id, endpoint, p256dh, auth_key)
- **Send API** — `/api/push/send` (authenticated, uses web-push library)
- **Admin panel** — `/admin/notifications/` for broadcast

### All Notification Triggers
| Event | Message | Recipient | URL |
|-------|---------|-----------|-----|
| Kangen | "{nama} lagi kangen kamu" | Partner | /app/home |
| Kangen reply | "{nama} kangen kamu juga!" | Partner | /app/home |
| Game invite | "{nama} ngajak main Samakan!" | Partner | /app/games/samakan/{id} |
| Daily Q answered | "{nama} sudah jawab pertanyaan hari ini!" | Partner | /app/home |
| Finance transaction | "{nama} menambahkan Rp X ke {target}" | Partner | /app/finance |
| Wishlist item added | "{nama} menambahkan '{item}' ke wishlist" | Partner | /app/partner |
| Letter sent | "Kamu punya surat yang bisa dibuka {date}" | Partner | /app/letters |
| Calendar event | "{nama} menambahkan {type}: '{title}'" | Partner | /app/calendar |

---

## 13. PWA Configuration

- **Manifest:** `/public/manifest.json`
- **Service Worker:** `/public/sw.js` — tiered caching (static cache-first, API network-first, pages stale-while-revalidate)
- **Icons:** `/public/icons/icon-192.png`, etc.
- **Install prompt:** Onboarding install page with iOS/Android instructions
- **Theme color:** `#FFF8F0` (cream)

---

## 14. NAVIGATION

### BottomNav (5 tabs)
| Position | Icon | Label | Route |
|----------|------|-------|-------|
| Left 1 | Home | Beranda | /app/home |
| Left 2 | Compass | Jelajah (all features; Pasangan lives here) | /app/jelajah |
| Center (floating) | Wallet | Keuangan | /app/finance |
| Right 1 | Calendar | Kalender | /app/calendar |
| Right 2 | User | Profil | /app/profile |

Pages without their own tab (Moment, Mood, Games, …) highlight Jelajah. Tapping a tab on one of its sub-pages returns to the tab's root.

---

## 15. DATABASE SCHEMA (Supabase)

> Source of truth: `supabase/migrations/` (see README → Database). The table below is a summary.
> Key rules enforced in the DB: couples are created/joined only via `create_couple()` / `join_couple(code)` (one couple per person, max 2 members); letter content only via `read_letter()` once unlocked; savings balance = sum of transactions (trigger, no overdraw); pet care only via `perform_pet_care()` (role, cooldown, decay, XP); Kangen 30-min cooldown + 10/day; partner's daily answer visible only after you answer; admins can read profiles/couples/content but not couples' private data.
> Extra tables since this doc was first written: `moments`, `moment_photos` (private `moments` bucket), `game_sessions` (Samakan), `ai_daily_questions`, `spending_results`, `wedding_budget_items`, pet tables (`couple_pets`, `pet_mood_state`, `pet_care_roles`, `pet_care_logs`).

### Tables
| Table | Purpose | RLS |
|-------|---------|-----|
| profiles | User data (name, birthday, avatar, etc.) | Own profile |
| couples | Couple entity (invite_code, created_by) | Couple members |
| couple_members | Junction table (couple_id ↔ profile_id) | Own membership |
| assessment_results | Assessment scores (answers JSON, scores JSON) | Couple members |
| daily_responses | Daily question answers (answer text, date) | Couple members |
| couple_events | Calendar events (title, date, type, scope, etc.) | Couple members |
| savings_goals | Savings targets (name, target, current, date) | Couple members |
| couple_transactions | Financial ledger (+/- amounts, category, who) | Couple members |
| savings_entries | Legacy monthly entries | Couple members |
| wishlist_items | Wishlist (name, price, link, owner_type) | Couple members |
| miss_you | Kangen records (sender, receiver, timestamp) | Couple members |
| letters | Time-locked letters (content, unlock_date) | Couple members |
| push_subscriptions | Push notification endpoints | Own subscriptions |
| mbti_results | MBTI test results (type, scores) | Couple members |
| game_sessions | Samakan sessions (chapter, players, scores, rounds) | Couple members |
| moments / moment_photos | Date memories: title, date, place + GPS, story, up to 7 photos | Couple members |
| deep_talk_* | Deep Talk game data | Couple members |

### Key Function
- `get_my_couple_id()` — returns current user's couple_id for RLS policies

---

## 16. ADMIN PANEL (`/admin`)

- **Protected:** Only users with `role = 'admin'` in profiles
- **Pages:**
  - `/admin/deep-talk/` — manage Deep Talk packs and questions
  - `/admin/notifications/` — send broadcast notifications, view subscription stats
  - `/admin/users/` — view user list

---

## 17. DESIGN SYSTEM

### Colors
| Token | Hex | Usage |
|-------|-----|-------|
| cream | #FFF8F0 | Background |
| rose | #F06B6B | Primary accent |
| rose-dark | #E05555 | Hover/active |
| gold | #E8C078 | Secondary accent |
| sage | #7EC4A0 | Success/positive |
| sage-dark | #5BA882 | Success text |
| ink | #2D2424 | Primary text |
| ink-muted | #8B7E7E | Secondary text |

### Typography
- **Font:** DM Sans (weights: 400, 500, 600, 700, 800)
- **Headings:** font-extrabold, tracking-tight

### Components
- **Button** — CVA variants (primary, secondary, ghost, danger), sizes (sm, md, lg), loading spinner
- **Input** — label, error, hint support, rose focus ring
- **Cards** — plain markup: rounded-2xl, border-border, bg-white, shadow-card (no shared component)
- **Modal** — bottom-sheet style, backdrop blur, slide-up animation

### Icons
- **Library:** Lucide React
- **Rule:** No emoji anywhere — all icons are Lucide SVG

---

## 18. MOMENTS (`/app/moments`)

A photo diary of every date, kept so it can later be compiled into a scrapbook.

- **Entry:** full-width "Moment" tile at the top of Home → Akses Cepat
- **Routes:** `/app/moments` (list, grouped by month) · `/app/moments/baru` · `/app/moments/[id]` · `/app/moments/[id]/edit`
- **Fields:** up to 7 photos (first = cover, "Jadikan cover" to change), title (≤100), date (not in the future), place name + GPS coordinates, story (≤2000)
- **Auto-fill:** EXIF of the first photo fills the date and GPS (`src/lib/exif.ts`); the place name comes from OpenStreetMap reverse geocoding. "Pakai lokasi sekarang" uses the device GPS.
- **Photos:** compressed in the browser to ≤1600px JPEG before upload; stored in the PRIVATE `moments` bucket at `<couple_id>/<moment_id>/`; shown via 1-hour signed URLs. The 7-photo cap is enforced in the DB (also under concurrent uploads).
- **Detail:** gallery + full-screen viewer (swipe/arrows), OpenStreetMap embed + "Buka di Maps", who saved it, edit, delete (removes rows and files)
- **Notification:** partner gets "<nama> menyimpan moment \"<judul>\""
- **Scrapbook:** `/app/moments/scrapbook` — range (bulan ini / pilih bulan / tahun / semua / manual), style Polaroid or Majalah, cover title; A4 pages, "Cetak / Simpan PDF" via the browser print dialog
- **Peta:** `/app/moments/peta` — Leaflet + OSM tiles, a pin per moment with GPS (gold = favourite), list of places
- **Social:** one reaction per person (❤️ 😍 🥹 😂 🔥 👏) and comments (≤500 chars, delete own); partner gets a push on a new comment
- **Favourite / search:** shared star; search title/place/story; filter Semua / Favorit / per year
- **Prefill:** `/app/moments/baru?title=&date=&location=&lat=&lng=&bucket=` (from bucket list and calendar); `bucket` marks that item done and links it

---

## 19. v0.6 — JELAJAH & NEW FEATURES (2026-10-27)

Navigation: bottom nav is Beranda · **Jelajah** · Keuangan · Kalender · Profil. Jelajah (`/app/jelajah`) lists every feature in five groups; Pasangan moved there. Home adds the activity bell, mood card, next-milestone card and "Kenangan hari ini".

| Feature | Route / place | Notes |
|---|---|---|
| Mood check-in | home card, `/app/mood` | 8 moods, one per person per Jakarta day, 14-day history |
| Bucket list | `/app/bucket-list` | categories, cost, done → "Abadikan jadi Moment"; AI ideas land here with an "Ide AI" badge |
| Toples Apresiasi | `/app/toples` | notes to the partner, drawn one at a time ("Ambil satu") |
| Arsip jawaban | `/app/arsip-pertanyaan` | past daily questions; partner's answer only on days you answered too |
| Milestone | home card, `/app/milestone` | 7, 30, every 100 days to 1000, then every 500; yearly anniversaries |
| Ide Date AI | `/app/ide-date` | budget / vibe / setting / city → 3 ideas (GPT Luna via OpenRouter, strict structured JSON), 5 per couple per day |
| Perjalanan Kita | `/app/perjalanan` | one timeline: start date, milestones, moments, bucket done, letters opened (no content), dates |
| Aktivitas | bell on home, `/app/aktivitas` | written by DB triggers; summaries never include private text |
| Recap bulanan | `/app/recap` | numbers for one month + share text |
| Realtime | `src/lib/realtime.ts` | pages reload on the partner's inserts/updates and when the app becomes visible |
| Keuangan | `/app/finance` | several goals, edit/delete transactions (balance can't go negative), monthly summary per category |
| Kalender | `/app/calendar` | edit events, reminders (Hari H / H-1 / H-3 / H-7) via `/api/cron/event-reminders` |
| Notifikasi | `/app/profile/notifikasi` | switches per type + quiet hours (WIB) |
| Akun | Profil → Pengaturan / Zona bahaya | export JSON, leave couple (the space closes for good; partner keeps the archive), delete account, invite code valid 7 days + "Buat kode baru" |
| Deep Talk | `/app/games/deep-talk` | 10 themed packs, `is_free` = every level open, no order |

Privacy rules worth remembering: letters are readable only by sender and receiver; a closed couple accepts no new member; joining a new code while your current space holds memories asks for confirmation and deletes that space (and its photos).
