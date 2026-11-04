# Pet Kita remake: design spec

**Date:** 2026-11-04 · **Status:** draft for Eric's review · **Replaces:** `/app/pet`, `/app/pet/care`, `/app/pet/mood`
**Rules:** `docs/COPY-GUIDE.md` (English UI, no em dashes, no decorative emoji, no slop words). Builders touching the AI part load the `claude-api` skill first.

**In one breath:** Pet Kita stops being a chore chart. Nothing decays. The pet grows from what the couple already does in Nanti Kita (Moments, letters, Kangen, moods, daily answers, Jar notes, savings, games) plus one "say hi" tap each per day. Its room fills with living items that show the couple's own data, and once a day it writes a short note about your week (Claude Sonnet 5.5, template fallback). Existing pets keep name, type, XP, level and every log row.

---

## 1. Experience audit (current code)

Prior audit checked against code: all claims hold. New findings marked **(new)**.

**First 60 seconds (adopt)**
- Two of four pets are fake: Parrot and Fish are coded `type: 'cat'`, locked, priced Rp 29.000 / Rp 19.000, with no way to buy (`PetAdoptScreen.tsx:36-55`).
- "Popular" badge on Cat is invented proof, against copy rule 4 (`PetAdoptScreen.tsx:23`) **(new)**. "Free" on Dog implies a shop.
- Dog "Challenging" vs Cat "Medium" (`:26-31`), but `pet_care_rules()` has no per-type rule.
- The first shared decision is made alone: whoever taps first picks species and name; the partner gets no push and no say (`PetAdoptScreen.tsx:68-82`) **(new)**.
- Chores are dealt by `Math.random()` 3/3 and never explained (`lib/pet.ts:144-151`).
- Adopt shows emoji, the room shows SVG: the pet changes face between screens (`PetAdoptScreen.tsx:166` vs `PetRoom.tsx:232`).

**Day 1**
- Stats start at 70 (`base_schema.sql:303-305`); one Feed makes it Thriving (`rls-flows.mjs:184`). No stakes, no meaning.
- Room shows only the first 3 of my actions (`PetRoom.tsx:128`); the first is styled as primary whatever the need (`:256`).
- Cooldown buttons go grey with no time left shown (`PetRoom.tsx:258`). Cuddle's icon is a speech bubble (`:22`).
- Every tap pushes the partner, kind `activity`, "Your partner just ticked off "Feed"", never the name, no throttle (`PetRoom.tsx:104-115`, `PetCareScreen.tsx:69-81`) **(new)**.
- No realtime: the partner's care doesn't move my bars; decay runs only on page load (`lib/pet.ts:287-299`, pet tables absent from `realtime.ts:9-19`).

**Day 7**
- The pet looks identical sad or thriving: `PetSvgCat()` / `PetSvgDog()` take no props (`PetSvgCat.tsx:3`). Only sparkles differ (`PetRoom.tsx:219`).
- Level unlocks nothing; XP is 10 per tap (`english_content.sql:1041-1044`). Treat (60 min) earns 4x Feed's XP per hour for the same stat; XP farms at 100 stats.
- Room, care list and mood screen are three views of the same three bars. The mood screen is a static legend (`PetMoodScreen.tsx:35-41`).
- "Today" resets at 00:00 WIB (`lib/pet.ts:54-65`) while cooldowns roll (240/360 min): at 00:05 the list says "Do it", the server answers "Still on cooldown" (`PetCareScreen.tsx:172-188`, `english_content.sql:1001-1006`).
- Nothing in the room changes in a week. `thriving_since` is written, never read.

**A week where one partner is busy**
- "That's your partner's job" (`english_content.sql:994-999`): if the absent partner holds Feed and Treat, hunger hits 0 and the present partner can't help.
- The checklist becomes a scoreboard: "Kezia's task · waiting..." (`PetCareScreen.tsx:215, 223-225`).
- Guilt copy: "Feeling lonely... and could use some attention from you two" (`types/pet.ts:31`), "About 2 days without care. It needs you both" (`PetMoodScreen.tsx:40`). No pause, no vacation.

**Around the app and plumbing**
- Not on Home at all; "Pet" in Jelajah (`jelajah/page.tsx:58`) and "Pet Kita" in the Games hub (`games/page.tsx:8-14`): two names, framed as a game.
- Care never reaches the activity feed (`log_activity()` has no pet branch; `aktivitas/page.tsx:19-31`).
- `pet_care_roles` writable by members via the generic `member_all` policy (`base_schema.sql:532`), so the role check is cosmetic.
- **(new)** Any member can DELETE the pet and cascade its whole history: `grant ... delete on all tables` (`base_schema.sql:459`) plus `member_all`; only UPDATE was revoked (`server_rules.sql:135`).

## 2. Devil's advocate: why a couple would not open this

1. **It's a chore chart with fur.** Six chores split by lottery, a progress ring, "waiting" labels. Couples already negotiate chores; the app adds one more and grades it.
2. **It lies about the relationship.** A couple mid-fight with three dutiful taps has a Thriving pet. A couple on a phone-free weekend in Bandung comes home to a Sad one.
3. **It punishes the wrong person at the worst time.** Busy weeks, sick days and LDR trips are when a couples app should be gentle. This is exactly when the pet turns sad and the present partner is locked out.
4. **Nothing to come back for.** Day 7 equals day 1 plus a bigger number that buys nothing. Novelty dies around day 3.
5. **Nothing needs both of you.** The split divides the couple instead of meeting in the pet.
6. **It competes for the same daily slot** as Mood, Kangen and the Daily Question, and is the only one that scolds.

What a couples pet is for: a **witness** that notices what you do together and gives it back warmly, a **tiny two-person ritual** that takes seconds, and **light fun**. Never a debt.

## 3. Three remake concepts

| | A. Gentle care | B. The pet that grows with you | C. Co-op playmate |
|---|---|---|---|
| Core loop | Keep care taps; anyone can do any action; floor at "sleepy"; levels give accessories | Pet earns warmth from the couple's real activity in the app + one "say hi" each; room fills with living items from your data; daily AI note | One 1-minute synced mini-game a day (both hold to cuddle, teach a trick by matching answers) |
| Fun for two | Low: parallel tapping | Seeing your own week reflected; "both said hi"; shelf of your history | High when both online |
| Daily time | 30 s | 10 s on the pet; the rest is stuff you do anyway | 1-2 min, same time |
| When ignored | Sleeps at the floor | Naps (cute). Nothing lost, nothing decays | Nothing happens |
| Effort | S | M-L | L (presence, sync) |
| Risk | Still a chore loop, still says nothing about the couple | Feels like a meta-layer; privacy of what the AI sees | Needs simultaneity; LDR time zones; overlaps Samakan |

## 4. Choice

Weights: fun for two 25, anti-guilt 20, reason to open daily 15, reflects the relationship 15, effort and risk 15, fit for migrating live pets 10. Scores 1-5.

| | Fun | Anti-guilt | Pull | Reflects | Effort/risk | Migration | **Total /100** |
|---|---|---|---|---|---|---|---|
| A | 2 | 3 | 2 | 1 | 5 | 5 | **56** |
| B | 4 | 5 | 4 | 5 | 3 | 4 | **84** |
| C | 4 | 4 | 3 | 3 | 2 | 3 | **66** |

**Chosen: B**, with A's tap delight kept as free gestures and C's "both of you" moment kept as the same-day hi bonus.

**Red team of B, and the patches**
| Attack | Patch |
|---|---|
| "It's engagement bait that nags you into other features." | The pet thanks, never asks. No push or banner ever requests an action. Sources are listed only inside the pet's "How it grows" sheet. |
| "Couples who only use Kangen and mood see nothing." | Say hi (15 when both do), Kangen and mood alone give up to 27 warmth a day: a level about every 4 days. |
| "Farmable: spam Kangen, save Rp 1 ten times." | Every source has a per-person or per-couple daily cap; savings count once a day whatever the amount; total cap 50 a day. |
| "No decay means no stakes, so it's boring." | Stakes become visible growth: a new room item every level, 4 growth stages, living items that change with your data. |
| "The AI reads our letters." | It never sees letter, Jar note, answer, comment or mood-note text. Only counts, mood labels and titles already shown in the activity feed (Moments, bucket list, calendar). Test gate 22. |
| "It'll show who is slacking." | Only positive presence ("Kezia said hi"). Never per-person counts, never "waiting", never who did less, in UI or AI. |
| "Eric and Kezia lose their progress and the feeding they like." | XP and level are kept exactly (same 100-per-level formula). Pat, Snack and Play stay as gestures. The pet arrives with every item its level has earned. |
| "An AI line every day becomes wallpaper." | The prompt must name one concrete thing from the digest. No activity in 7 days means no AI call, just a template. Live reactions use templates. |

## 5. Final spec

### 5.1 Experience principles
1. **Nothing goes down.** Warmth, level and items only grow. The lowest state is a nap.
2. **Thank, never ask.** The pet reacts to what you did; it never requests anything.
3. **Credit the couple.** Anyone can do anything. Presence is shown only when it's there.
4. **Ten seconds is enough.** One tap a day each; the rest comes from life in the app.
5. **Specific beats cute.** Every note and bubble points at something real you two did.

### 5.2 Screens and states (360 px)

**Entry.** Home: a `PetPeek` row inside `CoupleProfileHero`'s children slot (no new card). Jelajah tile: label "Pet Kita", desc "Grows with what you two do". Removed from the Games hub (see Q2). `/app/pet/care` and `/app/pet/mood` redirect to `/app/pet` (old push URLs still work).

```
Home hero (PetPeek)                   No pet yet (2 members only)
┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│      (E)    ♥    (K)             │  │      (E)    ♥    (K)             │
│   Eric & Kezia · 412 days        │  │   Eric & Kezia · 412 days        │
│ ┌──────────────────────────────┐ │  │  [paw] Adopt Pet Kita together > │
│ │[cat] "Three Kangens before   │ │  └──────────────────────────────────┘
│ │ lunch. I counted."        >  │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

**Adopt (one screen, two real options).**
```
┌──────────────────────────────────┐
│ ←          Adopt Pet Kita        │
│  Pick one together. Either of    │
│  you can rename it later.        │
│ ┌─────────────┐ ┌─────────────┐  │
│ │ [cat, live] │ │ [dog, live] │  │
│ │    Cat      │ │    Dog      │  │
│ │ Curls up by │ │ Greets you  │  │
│ │ whoever's   │ │ both at the │  │
│ │ home        │ │ door        │  │
│ └─────────────┘ └─────────────┘  │
│  What should we call it?         │
│  [ Mochi_________________ ] 5/20 │
│  (Mochi) (Kopi) (Boba) (Tahu)    │
│  [          Adopt Mochi        ] │
└──────────────────────────────────┘
```
No prices, no difficulty, no badges. After adopting, the partner gets the adoption push (5.6).

**First time (arrival).** The pet sits in a moving box, ears peeking. "Mochi just moved in. It comes all the way out when you both say hi." After one hi: "You said hi. Mochi is peeking out for Kezia." After both: celebration "Mochi is home!". A couple with one member hatches on the first hi. Existing pets are already home (`hatched_at` backfilled).

**Main pet screen (cozy, partner said hi).**
```
┌──────────────────────────────────┐
│ ←  Mochi               Lv 6   ⋯  │
│    Growing · cozy                │
│ ┌──────────────────────────────┐ │
│ │ "You two found a ramen place │ │
│ │  in Blok M. Broth for me     │ │
│ │  next time, please."         │ │
│ │                 Today's note │ │
│ └──────────────────────────────┘ │
│ [photo]    [window]   [jar ●●●]  │
│ [letters] (Mochi+scarf) [plant]  │
│ ___________ rug ________________ │
│ Kezia gave Mochi a snack, 08:12  │
│ [  Pat  ]  [ Snack ]  [  Play  ] │
│ ▓▓▓▓▓▓▓▓░░  62/100 · Lv 7: hat   │
│ Since your last visit            │
│  · Kezia added a Moment     +10  │
│  · You sent a Kangen         +3  │
│ [ Shelf ]              [ Notes ] │
└──────────────────────────────────┘
```
- **Interactions:** tapping the pet plays a pat animation anytime (local, free). The first gesture of the day calls `pet_say_hi(gesture)`: "+5" floats up and the presence row becomes "You said hi this morning". If the partner already said hi: "+5 +5, both of you today" and a heart burst. Later gestures animate only, no number.
- Tapping a living item shows a tooltip ("4 Jar notes this month") linking to that feature.
- "Since your last visit": up to 3 newest warmth events after `pet_visits.last_seen_at`, from templates. Empty: "Nothing new since your last visit. Mochi is fine with that."
- `⋯` menu: Rename · How Mochi grows · Notifications.
- **Realtime:** the partner's hi or a new event while the screen is open animates the pet and prepends the bubble (no reload).

**Partner away.** Same screen. The presence row lists only who said hi ("You said hi this morning"). No partner slot, no "waiting", no count. The note never comments on who did less.

**Low state (dozy).**
```
│ ←  Mochi               Lv 6   ⋯  │
│    Growing · napping             │
│ "Quiet few days. I napped a lot. │
│  Nap champion, actually."        │
│        (Mochi curled up, zzz)    │
│  Anything you two do here wakes  │
│  Mochi up.                       │
│ [  Pat  ]  [ Snack ]  [  Play  ] │
```
No red, no bars, no day counts.

**Comfort (a partner logged a heavy mood today).** Pose: Mochi under a blanket next to that partner's side. Caption is per viewer, from templates: to Eric "Kezia had a heavy day. Mochi is sitting close to her." plus one link "Send Kezia a Kangen"; to Kezia "Mochi is sitting close to you today." The shared AI note stays neutral ("Soft day today. I'm staying close.").

**Celebration (level and stage).**
```
│          ✦  (Mochi + hat)  ✦     │
│      Mochi reached level 7       │
│      New: a little hat           │
│        [ Put it on the shelf ]   │
```
Shown once per person per new level (`pet_visits.celebrated_level`), max one overlay per visit (several levels at once are merged: "Mochi reached level 9. 3 new things."). Stage change: "Mochi is growing up!".

**Migrated pet intro (one time per person).** Card over the room: "Mochi moved into a new room. Nothing to feed, nothing to clean. It grows with everything you two do here, and it brought 5 things from the old place." [Show me]

**Shelf sheet:** every item with its level; earned items show their live value ("Letters · 1 waiting to open"); locked items show a silhouette and "Level 9". **Notes sheet:** last 30 notes, newest first; Monday notes carry a title.

### 5.3 Mechanics

**Warmth.** `couple_pets.xp` stays the lifetime total (shown as "warmth"). `level = floor(xp / 100) + 1`, unchanged, so no existing level moves. Warmth never decreases. Couple cap: **50 warmth per Jakarta day** (legacy rows excluded).

**Event sources** (all via SECURITY DEFINER triggers calling internal `pet_award(couple, actor, source, ref_id)`):
| Source | Table and trigger | Warmth | Cap per Jakarta day |
|---|---|---|---|
| hi | `pet_say_hi(p_gesture)` RPC | 5 | 1 per person |
| hi_both | second partner's first hi of the day | 5 | 1 per couple |
| kangen | `miss_you` AFTER INSERT | 3 | 1 per sender |
| mood | `activities` AFTER INSERT, kind `mood` | 3 | 1 per person |
| daily | `activities`, kind `daily` | 4 | 1 per person |
| moment | `activities`, kind `moment` | 10 | 2 per couple |
| moment_social | `activities`, kinds `comment`, `reaction` | 2 | 3 per couple |
| letter | `activities`, kind `letter` | 8 | 1 per person |
| jar | `activities`, kind `gratitude` | 5 | 1 per person |
| bucket_done | `activities`, kind `bucket_done` | 10 | 2 per couple |
| plan | `activities`, kinds `bucket_add`, `event` | 2 | 2 per couple |
| saving | `activities`, kind `saving`, only if `couple_transactions.amount > 0` (via `ref_id`) | 4 | 1 per couple |
| game | `game_sessions` AFTER UPDATE to `status = 'completed'` (8); `activities` kind `two_truths` (5, once per round `ref_id`); `deep_talk_progress` AFTER INSERT/UPDATE when `completed_levels` grows (10) | 5-10 | 3 events, 20 warmth per couple |

Dedupe: unique `(source, ref_id)` when `ref_id` is set, so a mood edit or the second Two Truths row never pays twice. Kinds `pet` and `left` are ignored (no recursion). `pet_award` catches every error and returns 0: **a pet bug can never block saving a Moment**. Couples without a pet: no-op.

**Typical days:** both say hi, share moods, answer the daily question, one Kangen = 15 + 6 + 8 + 3 = 32 (a level about every 3 days). Busy week, one partner present: 5 + 3 + 4 = 12 a day (a level about every 8 days, pet stays cozy).

**Pet state** (computed by `pet_status()`, the only source, the client mirrors nothing):
- `warmth_72h` = non-legacy warmth in the last 72 h.
- **glowing:** `warmth_72h >= 45` and both members earned something in 72 h (solo couple: 45 alone).
- **cozy:** `warmth_72h >= 8`, otherwise. **dozy** (label "napping"): `warmth_72h < 8`; any event wakes it.
- **comfort overlay:** any member's `mood_checkins` today in `capek, sedih, kesal, cemas` (stored values).
- **night pose:** 22:00-05:59 WIB, cosmetic (asleep, lamp off). **celebrate:** client overlay when `level > celebrated_level`.

**Stages:** Little (Lv 1-4, 0.8 scale, big eyes) · Growing (Lv 5-9) · Grown (Lv 10-14) · Wise (Lv 15+, glasses). SVGs take `pose`, `stage`, `items` props and expose `data-pose`.

**Unlocks (one per level; living items read your data):**
| Lv | Item | Lv | Item |
|---|---|---|---|
| 1 | Bed and bowl | 9 | Window with the real Jakarta sky (day, sunset, night) |
| 2 | Collar tag with both initials | 10 | Stage Grown + hat |
| 3 | Jar: one marble per Jar note this month | 11 | Rug |
| 4 | Photo frame: your latest Moment photo | 12 | Fairy lights (on while glowing) |
| 5 | Stage Growing + scarf | 13 | Map board: one pin per Moment place (cap 20) |
| 6 | Letter rack: an envelope while a letter waits to open | 14 | Toy chest |
| 7 | Plant: one leaf per day you both said hi this month | 15 | Stage Wise + glasses |
| 8 | Wall calendar: days to your next shared event (60 max) | 16+ | A star on the wall per level; a new scarf/hat color every 5 levels |

**Anti-guilt rules (testable):** no decay; no streaks or "days since"; no per-person tallies or "waiting"; no push that asks for action; no red or warning color on the pet screen; dozy copy never mentions absence; anyone can do anything; AI output is filtered for guilt words (5.4).

### 5.4 AI: the daily note

**What Sonnet does:** writes one short note a day in the pet's voice, reacting to the couple's last 7 days, naming one concrete highlight. On Mondays the note is a weekly recap (title + up to 280 chars). Nothing else uses AI: bubbles, captions, celebrations and comfort lines are templates.

**When:** `GET /api/pet/today`, called by `PetPeek` (Home) and the pet screen. First caller after 05:00 WIB claims `pet_daily_notes(pet_id, today)` with the service role (the `ai_daily_questions` pattern), calls the model, writes the row; everyone else reads it. A pending row older than 20 s counts as failed (template). Monday notes are pre-built by `GET /api/cron/pet-weekly` (Mon 02:00 UTC = 09:00 WIB), couples processed one after another so the system prompt cache is warm.

**No call when:** `ANTHROPIC_API_KEY` missing, `PET_AI_ENABLED=false`, 0 warmth events in 7 days, 2 attempts already today, or the couple's `cost_usd` today is at least $0.015. Then: template note, `source = 'template'`, HTTP 200.

**Request** (`src/lib/pet-ai.ts`, `@anthropic-ai/sdk`, server only):
```ts
client.beta.messages.create({
  model: 'claude-sonnet-5-5', max_tokens: 400,
  betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
  thinking: { type: 'between_tools' },                 // thinking off
  output_config: { effort: 'low', format: { type: 'json_schema', schema: PET_NOTE_SCHEMA } },
  system: [{ type: 'text', text: PET_SYSTEM, cache_control: { type: 'ephemeral' } }],
  messages: [{ role: 'user', content: JSON.stringify(digest) }],
}, { timeout: 8000, maxRetries: 1 })
```
If the API rejects `between_tools` here, drop `thinking` and keep effort `low`, then re-measure cost from `usage`. Check `stop_reason`: `refusal` or `max_tokens` means template.

**System prompt outline (frozen text, ~1,100 tokens, no dates or names so it caches):** you are {pet} speaking in first person to a couple in Indonesia; US English, warm, a little playful, like a friend texting; 1-2 sentences, max 160 characters (weekly: title of 2-5 words, max 280); name exactly one concrete highlight from the digest, or something about your own day if none; never guilt, never compare the partners, never say who did less or what wasn't done; never mention money amounts; if a mood is heavy today, be soft and don't name the mood or the person; no em dashes, no emoji, none of the copy guide's banned words; Indonesian places and food are welcome; 6 input/output examples (see 5.7).

**Digest (user message, ~350 tokens):** `date`, `weekday`, `note_kind`, pet `{name, type, level, stage, new_item}`, partner first names, `said_hi_today` names, `last_7_days` counts per source, up to 3 `highlights` (Moment titles, completed bucket items, Samakan score, all max 60 chars), `heavy_mood_today: bool`, `upcoming` (next shared event title + days, 14 days max), `state`. Never: letter bodies, Jar note text, answers, comments, mood notes, amounts.

**Output schema:**
```json
{ "type": "object", "additionalProperties": false,
  "required": ["title", "line", "highlight", "pose"],
  "properties": {
    "title":     { "type": "string" },
    "line":      { "type": "string" },
    "highlight": { "type": "string" },
    "pose":      { "type": "string", "enum": ["glowing", "cozy", "comfort", "proud"] } } }
```
Lengths are checked in code, not by schema keywords. Reject (template instead) on: line over 160 (280 weekly), em dash, emoji, or a banned word (`journey, unlock, bond, cherish, lonely, neglect, forgot, hungry, sad, should, haven't, don't forget`).

**Tokens and cost** (Sonnet 5.5: $2 in, $10 out, cache read $0.20, 5-min write $2.50 per MTok):
| Call | Input | Output | Cost |
|---|---|---|---|
| Daily, cold cache | 1,100 write + 350 | ~90 | $0.0043 |
| Daily, warm cache | 1,100 read + 350 | ~90 | $0.0018 |
| Monday weekly (cron, warm) | 1,100 read + 450 | ~180 | $0.0029 |

Per couple per day: typical **$0.002-0.0045**, hard ceiling **$0.015** (guard). About $0.10 a month per active couple. Each row stores `input_tokens`, `cache_read_tokens`, `cache_write_tokens`, `output_tokens`, `cost_usd`, `model`.

**Fallback copy** (by state, then top source of the last 24 h, `{pet}`/`{name}` filled in): "I saw a new Moment come in. I'd like to be in the next one." · "Somebody wrote a letter. I'm not allowed to read it. I tried." · "Quiet day. I'm guarding the sofa." · "Soft day today. I'm staying close."

### 5.5 Data model and migration

Migration `supabase/migrations/20261104120000_pet_remake.sql`, additive only.

**New tables**
- `pet_warmth_events` (`id`, `pet_id` FK cascade, `couple_id` FK cascade, `actor_id` FK profiles set null, `source` text CHECK in the source list + `legacy`, `ref_id` uuid null, `gesture` text null, `points` smallint >= 0, `day` date default Jakarta today, `created_at`). Unique `(source, ref_id) where ref_id is not null`; unique `(pet_id, actor_id, day) where source = 'hi'`; index `(pet_id, created_at desc)`.
- `pet_daily_notes` (`pet_id`, `couple_id`, `note_date`, `kind` daily|weekly, `status` pending|ready, `source` ai|template, `title`, `line`, `highlight`, `pose`, `model`, token columns, `cost_usd numeric(8,6)`, `attempts smallint`, `created_at`, `updated_at`; PK `(pet_id, note_date)`).
- `pet_visits` (`pet_id`, `profile_id`, `last_seen_at`, `celebrated_level int`, `intro_seen_at`; PK `(pet_id, profile_id)`).

**Changed:** `couple_pets` + `hatched_at timestamptz`; CHECKs `pet_type in ('cat','dog')` and name length 1-20 added `NOT VALID` (no existing row can block the migration). `notification_prefs` + `pet boolean not null default true`.

**Functions**
- `pet_rules()` immutable jsonb: every number in 5.3 (points, caps, 50/day, 100/level, stage bands, state thresholds, item table). `scripts/verify/pet-rules.mjs` compares it with `src/types/pet.ts`.
- `pet_award(...)` internal, revoked from `public`/`authenticated`; locks the pet row (`for update`), applies caps, inserts the ledger row, adds xp, recomputes level; on level-up inserts `activities` kind `pet`, actor = the event's actor (or the game creator), summary "helped {pet} reach level N".
- `pet_say_hi(p_gesture text)` → `{counted, points, both_today, level, leveled_up}`; first hi per person per day also writes activity "said hi to {pet}"; sets `hatched_at` when both have said hi.
- `pet_status(p_pet_id uuid)` → `{level, xp, into_level, stage, mood, comfort_for, said_hi_today[], hatched}`.
- `adopt_pet(p_type text, p_name text)` → pet row (returns the existing one if the partner was faster); activity "adopted a {type} called {name}".
- Trigger on `couple_pets` name update → activity "renamed the pet to {name}".
- **`perform_pet_care(uuid, text)` kept, same signature,** body becomes a shim: maps feed/treat to snack, play/walk to play, bath/cuddle to pat, calls `pet_say_hi`, returns `{hunger:100, happiness:100, cleanliness:100, mood:'thriving'}`, never raises cooldown or role errors. Removed in a later cleanup, not here.

**RLS and grants:** `pet_warmth_events`, `pet_daily_notes`: SELECT for couple members only; no writes for `authenticated`. `pet_visits`: own rows only. Revoke INSERT/UPDATE/DELETE on `pet_care_roles`, DELETE on `couple_pets`, INSERT on `pet_mood_state` from `authenticated` (legacy tables become read-only; fixes the two holes in section 1). `couple_pets` keeps `update (name)`.

**Realtime:** add `couple_pets`, `pet_warmth_events`, `pet_daily_notes` to `supabase_realtime`; extend `RealtimeTable` in `src/lib/realtime.ts`.

**Keeping Eric and Kezia's pet (and every other)**
1. Before applying: export `couple_pets`, `pet_mood_state`, `pet_care_logs`, `pet_care_roles` (read-only dump, kept with the release).
2. Name, `pet_type`, `created_at`, `xp`, `level` are not touched. The level formula is unchanged.
3. One `legacy` ledger row per pet with `points = xp` (if > 0), so `sum(points) = xp` holds from day one.
4. `hatched_at = created_at` for existing pets. `pet_visits` rows are created on first visit with `celebrated_level = level` and `intro_seen_at = null` (intro shows once, no flood of level overlays).
5. `pet_care_logs`, `pet_mood_state`, `pet_care_roles` stay as history (read-only). Account export adds the two new tables.
6. Rollback: drop the new tables, triggers and functions; restore `perform_pet_care` from `20261103120000_english_content.sql`. Legacy data is untouched either way.

### 5.6 Notifications

| Push | When | To | Kind | Max |
|---|---|---|---|---|
| Adoption | right after `adopt_pet` succeeds | partner | `pet` | once per pet |
| Monday note | `pet-weekly` cron, 09:00 WIB, only if the couple earned warmth that week | both | `pet` | 1 per week |

Nothing else. The per-tap pushes (`PetRoom.tsx:104-115`, `PetCareScreen.tsx:69-81`) are deleted. Both go through `sendPushToProfile` with the new `pet` kind (added to `PUSH_KINDS`, `isPushMuted`, and a "Pet Kita" switch in `/app/profile/notifikasi`), so quiet hours and the switch apply; a muted Monday push is skipped, not delayed. By construction at most 1 pet push per person per day. Level-ups reach the partner through the activity feed bell, not a push.

### 5.7 Copy samples

| Where | Copy |
|---|---|
| Adopt subtitle | Pick one together. Either of you can rename it later. |
| Cat / Dog | Curls up by whoever's home. / Greets you both at the door. |
| Arrival | Mochi just moved in. It comes all the way out when you both say hi. |
| Half hatched | You said hi. Mochi is peeking out for Kezia. |
| Presence | Kezia gave Mochi a snack, 08:12 |
| Dozy | Anything you two do here wakes Mochi up. |
| Comfort (to partner) | Kezia had a heavy day. Mochi is sitting close to her. |
| Level up | Mochi reached level 7. New: a little hat. |
| Migrated intro | Mochi moved into a new room. Nothing to feed, nothing to clean. It grows with everything you two do here, and it brought 5 things from the old place. |
| How it grows | Saying hi, Moments, letters, Kangen, moods, daily answers, Jar notes, savings and games all count. Nothing ever goes down. |
| Push, adoption | Meet Mochi · Eric adopted a cat called Mochi. Come say hi. |
| Push, Monday | A note from Mochi · Your week, written by a cat who was paying attention. |
| Feed lines | said hi to Mochi · helped Mochi reach level 7 · adopted a cat called Mochi · renamed the pet to Kopi |
| AI note examples | You two found a ramen place in Blok M. Broth for me next time, please. · Three Kangens before lunch. I counted. I'm very good at counting. · Twelve days until your anniversary dinner. I'm practicing my best sitting. · (Monday) "A week of small things": Two Moments, one letter still sealed, and a lot of Kangen. I put it all on my shelf. |

### 5.8 Acceptance criteria (verification gates)

1. The migration applies cleanly on a fresh local DB and on a copy of the current schema; a second run is a no-op.
2. For every pre-existing pet: `name`, `pet_type`, `created_at`, `xp`, `level` are identical before and after; row counts of `pet_care_logs`, `pet_mood_state`, `pet_care_roles` are unchanged.
3. For every pet, at all times, `sum(pet_warmth_events.points) = couple_pets.xp` and `level = floor(xp/100) + 1`.
4. `pet_say_hi` twice by one user in one Jakarta day: the second returns `counted = false` and xp is unchanged.
5. Both partners say hi the same day: xp rises by exactly 15; further calls add 0.
6. Inserting a Moment awards 10 in the same transaction; a third Moment that day awards 0.
7. No couple gains more than 50 non-legacy warmth in one Jakarta day under any mix of sources.
8. Changing today's mood check-in does not award a second time; a Kangen awards 3 once per sender per day.
9. A Samakan session moving to `completed` awards 8 once; a Two Truths round awards 5 once per round id; a newly completed Deep Talk level awards 10.
10. With `pet_award` forced to raise, inserting a Moment, letter or Kangen still succeeds.
11. Activity rows for a couple with no pet create no ledger rows and no errors.
12. As `authenticated`: insert/update/delete on `pet_warmth_events`, `pet_daily_notes`, `pet_care_roles` and DELETE on `couple_pets` are all rejected; `update couple_pets set name` succeeds and writes a "renamed" activity.
13. `perform_pet_care` still returns keys `hunger, happiness, cleanliness, mood`, never raises a cooldown or role error, and counts as that user's hi.
14. `pet_status` returns `dozy` below 8 warmth in 72 h, `glowing` at 45+ with both contributing, and `comfort_for` set when a member's mood today is one of the four heavy values.
15. Pet UI source contains none of: hunger, clean, cooldown, "partner's job", waiting, lonely, Popular, Rp (grep gate on `src/components/app/Pet*`, `src/app/app/pet/**`).
16. `copy-audit.mjs` and `slop-gate.mjs` (5/5) pass on all touched paths.
17. Two parallel `GET /api/pet/today` calls for one couple cause exactly one model call; both partners get the same note; never more than 2 attempts per day.
18. With `ANTHROPIC_API_KEY` unset, `/api/pet/today` returns 200 with a template note and makes no network call.
19. With 0 warmth events in 7 days, no model call is made.
20. Model output with an em dash, emoji, banned word or overlong line is replaced by a template.
21. No call is made once the couple's `cost_usd` for the day reaches $0.015; every AI row has non-null token and cost columns.
22. A digest built from fixtures containing sentinel strings in letter bodies, Jar notes, answers, comments and mood notes contains none of them (unit test).
23. A partner's hi appears on an open pet screen within 5 s without reload.
24. The activity feed renders kind `pet` with a paw icon for adoption, hi (max 1 per person per day) and level-ups.
25. Pet pushes are only adoption and the Monday note, both honor the `pet` switch and quiet hours, and the per-tap pushes are gone.
26. `/app/pet` and `/app/pet/adopt` have no horizontal scroll at 360 px (`layout-audit.mjs`); `/app/pet/care` and `/app/pet/mood` redirect to `/app/pet`.
27. Adopt shows exactly two options (cat, dog) with no price, difficulty or badge.
28. The pet SVG renders a different `data-pose` for glowing, cozy, dozy, comfort and night; earned items render for the current level.
29. A migrated pet shows the intro once per person, then never again; no level overlay fires for levels earned before migration.
30. `pet-rules.mjs` prints PET RULES IN SYNC; each leaf passes `leaf-check.mjs --paths <owned>`.

### 5.9 Build plan (3 leaves, disjoint files)

**Leaf A: database** (no dependencies, goes first)
`supabase/migrations/20261104120000_pet_remake.sql`, `src/types/database.ts` (regenerated), `src/types/pet.ts` (rules mirror + shared types `PetStatus`, `HiResult`, `PetNote`, `Gesture`), `scripts/verify/pet-rules.mjs`, new `scripts/verify/pet-remake.mjs` (gates 1-14), pet section of `scripts/verify/rls-flows.mjs`. Gates 1-14, 30.

**Leaf B: server and AI** (needs A's types and RPCs)
`src/lib/pet.ts` (rewrite: `getPetView`, `sayHi`, `adoptPet`, `renamePet`, `fetchTodayNote`, `markVisit`), `src/lib/pet-ai.ts`, `src/lib/__tests__/pet-ai.test.ts`, `src/app/api/pet/today/route.ts`, `src/app/api/cron/pet-weekly/route.ts`, `vercel.json`, `src/lib/push-server.ts`, `src/lib/quiet-hours.ts`, `src/app/api/account/export/route.ts`, `package.json` (`@anthropic-ai/sdk`), `.env.example` (`ANTHROPIC_API_KEY`, `PET_AI_ENABLED`). Gates 17-22, 25 (server side).

**Leaf C: UI** (needs A's types; codes against B's `lib/pet.ts` signatures, so it can start in parallel)
`src/app/app/pet/**`, `src/components/app/Pet*.tsx` (PetHome, PetAdoptScreen, PetSvgCat/Dog with props, PetShelfSheet, PetNotesSheet, PetCelebration, PetPeek), `src/app/app/home/page.tsx`, `src/app/app/jelajah/page.tsx`, `src/app/app/games/page.tsx`, `src/app/app/aktivitas/page.tsx`, `src/lib/realtime.ts`, `src/app/app/profile/notifikasi/page.tsx`, `src/app/privasi/page.tsx` (AI note disclosure). Gates 15-16, 23-29.

Order: A, then B and C in parallel, then one integration run of `scripts/verify/run-all.mjs` on the local DB.

### 5.10 Risks and open questions

**Risks:** pose and item art is the biggest UI cost (keep SVG layers simple, one body per species plus overlays); a second AI provider next to OpenRouter (pet only, own key and kill switch); the `activities` trigger sits on a hot path (exception-safe, one indexed lock per insert); fans of feeding may miss stats (gestures stay).

**Questions for Eric**
1. The daily note uses Moment, bucket-list and calendar titles plus today's mood labels (never letters, Jar notes, answers or comments), sent to Anthropic. OK? Default: yes, disclosed on the privacy page.
2. Take Pet Kita out of the Games hub (it lives on the Home hero and in Jelajah)? Default: yes.
3. Keep the Monday push "A note from Mochi"? It needs a third Vercel cron; if the plan caps crons, it runs inside `event-reminders`. Default: yes.
