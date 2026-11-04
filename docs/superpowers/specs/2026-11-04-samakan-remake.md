# Samakan remake: design spec

Date: 2026-11-04 · Owner: Eric · Status: design, not built
Scope: total remake of Samakan (hub, play, results, data, AI, pushes). Name kept.
Copy contract: `docs/COPY-GUIDE.md`. Every UI string in this file follows it.

**One line:** Samakan becomes a guess-each-other game that you answer on your own time and reveal together. It is async first, turns live when you are both on the screen, runs 7 rounds (about 3 minutes), and the server writes each set, often from the couple's own Daily Questions and Moments.

---

## 1. Experience audit (current code, walked as Eric and Kezia)

Timeline of one game today: tap a chapter, partner gets a push, both open, both tap ready, 3.8 s countdown, typewriter intro, then 10 x (story card, answer, wait, 3.5 s reveal), ending card, results. That is about 21 fixed screens, and roughly a third of the time goes to ceremony, not answers.

| # | Moment | What happens (file:line) | Why it hurts |
|---|---|---|---|
| 1 | Find it | Card says "Match answers in real time" (`games/page.tsx:20`) | Says how, not why it is fun |
| 2 | Hub | No "how it works", unlike Two Truths (`two-truths/page.tsx:132`) | First play is a guess |
| 3 | Hub | Hub never checks for the partner's open lobby (`samakan/page.tsx:20-68`) | Kezia waiting is invisible unless she pushes |
| 4 | Start | One tap creates the session and pushes the partner (`page.tsx:76-98`, `create/route.ts:107-117`) | No confirm, accidental pushes |
| 5 | Start | Tapping another chapter replaces your lobby and pushes again (`route.ts:79-86`) | Partner gets two or three pushes in a row |
| 6 | Start | Partner's lobby for another chapter is returned silently (`route.ts:79-82`) | You tap First Trip and land in New Home |
| 7 | Invite | Invites use kind `activity`, described as "Daily Mood, Bucket List, Savings, Jar..." (`profile/notifikasi/page.tsx:39`) | Turning that off silently kills game invites |
| 8 | Lobby | "I'm ready" is disabled until the partner connects (`SinkronisasiLobby.tsx:131`) | The starter has to sit and stare |
| 9 | Lobby | Closing the lobby expires the session (`[sessionId]/page.tsx:519-533`) | Partner taps the push and sees "This session has ended" (`:545-548`) |
| 10 | Lobby | Lobby dies after 10 min with no warning (`route.ts:6`) | Same dead link |
| 11 | Lobby | "Call your partner" push has only a client flag as limit (`Lobby.tsx:36-62`) | Reload, spam again |
| 12 | Countdown | 3-2-1 "GO!" and "READY" in caps (`SinkronisasiCountdown.tsx:33`, `Lobby.tsx:91`) | Arcade tone for a couples game |
| 13 | Countdown | Guest ignores `startAt`, local timer only (`Countdown.tsx:15-22` vs `page.tsx:360`) | Phones drift |
| 14 | Story | "Say it's the day you two first meet" (`data/samakan.ts:10`) | Odd for a couple of 3 years: role-play instead of them |
| 15 | Story | 30 ms/char typewriter, 11 cards per game, guest can't tap (`StoryCard.tsx:33`, `page.tsx:606`) | Guest is a passenger |
| 16 | Story | Bridges don't match the next round: "You start talking about deeper things." then "Pick a meal" (`data/samakan.ts:15` then `:32`) | Breaks its own story |
| 17 | Same pick | One tap commits, no undo (`RoundPilihSama.tsx:15-19`) | Fat finger is permanent |
| 18 | Same pick | Goal unclear: your honest taste, or what you think they'll pick? | People pick the obvious answer and learn nothing |
| 19 | Slider | Starts at 5 with a "Pick 5" button (`RoundSliderSama.tsx:13,59`) | Both tap without moving: 20 points |
| 20 | Slider | Scores how alike two traits are ("How much do you love coffee?") and never gives zero (`samakan.ts:24`) | Being different counts as a fail, and the points mean little |
| 21 | Slider | `storyPrompt` never shown for sliders (`RoundSliderSama.tsx:25`) | Story copy is wasted |
| 22 | Number | "Pick a number 1 to 10", default 5 (`RoundTebakAngka.tsx:13`), scored like a slider (`samakan.ts:41`) | Pure luck, or both tap "Pick 5" |
| 23 | Guess partner | Auto-advances 400 ms after your own pick, no back (`RoundTebakPasangan.tsx:23`) | The best mechanic, rushed |
| 24 | Reveal | Shows "Answer: X · Guess: Y" per player (`SinkronisasiReveal.tsx:29`) | You cross-match in your head |
| 25 | Reveal | No question on screen; gone after 3.5 s (`Reveal.tsx:55-85`, `page.tsx:54,408`) | The laugh-and-talk moment is cut off |
| 26 | Reveal | Red X and "Way off...", "Not quite..." (`Reveal.tsx:19`, `samakan.ts:61-71`) | Difference reads as failure |
| 27 | Disconnect | "{name} left the game" after 4 s away (`page.tsx:55`, `GameExitControls.tsx:59`) | Switching to WhatsApp to say "open the app" alarms the other phone |
| 28 | Disconnect | Guest relies on the host's phone for state (`page.tsx:268-270`) | Host battery dies, guest waits forever |
| 29 | Exit | Ending mid-game drops everything (`GameExitControls.tsx:28`) | 8 rounds of answers lost |
| 30 | Sound | BGM autoplays; mute only on the score bar (`page.tsx:185-198`, `SinkronisasiScoreBar.tsx:43`) | Loud at night, in public |
| 31 | Results | Round type + emoji + "+17", no questions, no answers (`SinkronisasiResults.tsx:29-34,104-115`) | Nothing to talk about, emoji breaks copy rule 2 |
| 32 | Results | Ending text shown twice (`page.tsx:602-604`, `:609-611`) | Filler |
| 33 | Again | "Play again" goes to the hub (`page.tsx:616`); 4 chapters x 10 fixed rounds | Second play is a memory test; content runs out after 4 games |
| 34 | History | Rows not tappable, no best, no streak (`samakan/page.tsx:190-229`); `round_types` written, never read (`route.ts:93`) | No reason to come back |
| 35 | Trust | Host scores on the client; RLS lets any member write any score (`page.tsx:382-410`, `base_schema.sql:529-541`) | Fragile; one phone is the source of truth |
| 36 | One phone | Impossible: ready needs two connected devices | Fine to drop, but say so |
| 37 | Long distance | Works only when both are free at the same minute | The common case, apart and busy, can't play |

## 2. Devil's advocate

- **Why nobody plays twice.** Same 10 rounds in the same order. A replay tests memory, the score barely moves, the results show no answers, and there is nothing new to learn.
- **Why it feels "aneh".** It asks a long-term couple to pretend they just met. It mixes a lottery round with "who knows whom". It wraps a quiz in an arcade countdown, music and red X marks. It narrates a story that contradicts itself. Then it takes the reveal away before anyone can react.
- **Is real-time on two phones right?** Mostly no. Sitting together, two phones only earn their place by hiding answers until the reveal, and that is worth keeping. Apart, "both free right now" is rare, and the lobby punishes whoever arrives first. Async fits the other games' rhythm (Two Truths, Daily Question), and live can be a bonus that happens when both of you open the same set.
- **The score.** A single "sync %" invites "we're only 40%". What is worth counting is how well you read each other, plus what you learned when you didn't.
- **Length.** 10 rounds plus 11 story cards is too long for a habit. 7 rounds, no story, about 3 minutes.
- **The name.** "Samakan" (make it match) is in the copy guide's kept list. It is short, and it fits even better once the mechanic is "match your guess to their answer". Keep it. Drop "Sinkronisasi" from component names too.
- **Overlap risk.** Daily Question is open-ended, Deep Talk is long talk, Truth or Dare is one phone and loud, Two Truths is a bluff. Samakan's own job: a quick game of guessing each other, with a result you can compare over time.

## 3. Three remake concepts

| | A. Live, trimmed | B. Answer now, reveal together | C. Pass the phone |
|---|---|---|---|
| Core loop | Same lobby, 7 rounds, no story, reveal waits for both to tap Next | Either partner starts a 7-round set. Each answers on their own phone, whenever: own pick plus a guess of the partner's. A round reveals the moment both have answered, live if both are on screen, otherwise queued | One phone, cover screen: A answers, hands over, B answers and guesses, reveal on the same screen |
| Fun for two | Simultaneous reveal | Guessing, then a reveal of things you didn't know; personal rounds from your own Daily Questions, Moments, moods | Face-to-face laughing |
| Session | 4 min, both at once | about 3 min each, any time; live when both are here | 4 min together |
| Replay | Low unless content refreshes | High: daily personal set, 120-round bank, no repeats for 60 days | Medium |
| Effort | M | L | S |
| Risk | Still needs both online; keeps the 700-line host/guest sync | Async can feel flat; AI quality and safety | Duplicates Truth or Dare; useless apart |

**Scored choice** (1-5, weights in brackets):

| Criterion | A | B | C |
|---|---|---|---|
| Fits real life, together and apart (30%) | 2 | 5 | 3 |
| Replay value (25%) | 2 | 5 | 3 |
| Something to talk about (20%) | 3 | 4 | 5 |
| Build effort and risk (15%) | 4 | 2 | 4 |
| Own role among the games (10%) | 3 | 4 | 2 |
| **Weighted** | **2.60** | **4.25** | **3.45** |

**Chosen: B.** C's best idea (talk face to face) survives in B's live mode, where both phones sit on the sofa and the reveals land at the same moment.

## 4. Red team of B, and the patches

| Attack | Patch |
|---|---|
| Async reveals are anticlimactic; the second answerer gets all the fun | Per-round reveal: the second answerer sees each reveal live as they go. The first one, back later, steps through the same reveal screens one by one before the summary. |
| Partner never finishes | Set stays open 7 days. One nudge, allowed 3 h after start. After 7 days it ends; rounds both answered stay visible, and a one-sided answer is never shown. |
| Becomes homework next to the Daily Question | No daily reminder, no streak pushes. The only pushes are partner-triggered (start, finish, one nudge). The streak is weekly, not daily. |
| Peeking (dev tools, realtime payloads) | Answers sit in an RPC-only table, the same pattern as Two Truths (`20261103132000_two_truths.sql:52-55`). The realtime row carries counts only. |
| Personal rounds feel creepy or wrong | AI sees only things both partners already see in the app (Daily Question answers, Moment titles and places, mood counts, Bucket List titles). Each personal round shows a "From your Moments" chip. "Skip this one" is always there. One switch turns personal rounds off for the couple. |
| A scale guess starts a fight ("you think I'm messy?") | Scale prompts measure preferences, never virtues or flaws (safety rule S6). |
| Score anxiety | No percentage anywhere. You get "9 of 12 matches" plus "3 new things you learned", and misses are styled as news, not as red. |
| AI cost and latency | One personal set per couple per day, a $0.025 hard cap, a 12 s timeout, and a curated bank as the instant fallback. The partner never waits on AI, because rounds exist before their push is sent. |
| Sync bugs | No host. The server is the only source of truth. A client calls an RPC, then refetches on a realtime ping. A partner dropping out is a non-event. |
| New couple with no data | If there are fewer than 3 personal facts, skip AI and use the bank. Copy: "Answer a few Daily Questions first and these get personal." |

---

## 5. Final spec

### 5.1 Experience principles

1. Answer on your own time; reveal together when you can.
2. Every round is about the two of you. No lottery rounds, no role-play.
3. Differences are news, not failures. Nothing turns red.
4. Let a reveal sit. No timers, no auto-advance, and a line to talk about.
5. Short and fresh: 7 rounds, about 3 minutes, never the same set twice in 60 days.

### 5.2 Screens and states (360 px)

```
GAMES HUB CARD               SAMAKAN HUB
+------------------+         +------------------------------------+
| [icon] Your turn |         | <  Samakan                         |
| Samakan          |         | Guess each other's answers         |
| Guess each       |         +------------------------------------+
| other's answers  |         | +- Your turn ---------------------+|
+------------------+         | | Kezia started "Weekends"        ||
                             | | Kezia 7 of 7 . You 0 of 7       ||
                             | | [ Answer now ]                  ||
                             | +---------------------------------+|
                             | Start a set                        |
                             | +- For you two ------------------+ |
                             | | From your Daily Questions and  | |
                             | | Moments. One a day. [ Start ]  | |
                             | +--------------------------------+ |
                             | [Food]   [Weekends] [Home]         |
                             | [Travel] [Habits]   [Plans]        |
                             | Best 11 of 12 . 3 weeks in a row   |
                             | Past sets                          |
                             |  Weekends     3 Nov  9 of 12     > |
                             |  For you two  1 Nov  7 of 12     > |
                             |  Older games (4)                 > |
                             | How it works (collapsed)           |
                             +------------------------------------+
```
Hub card states: none open (start options) · mine open, partner not started ("Waiting for Kezia", nudge after 3 h) · partner's open ("Your turn") · both in progress ("Kezia is on round 4") · open set blocks a new one ("Finish or end this set first", `End set`).

```
START SHEET                      GENERATING (For you two only)
+------------------------------+ +------------------------------+
| Start "Weekends"?            | |                              |
| 7 rounds, about 3 minutes.   | |  Writing seven rounds for    |
| Kezia gets a notification    | |  you two...       (spinner)  |
| and can answer whenever.     | |  Using your Daily Questions, |
| [ Cancel ]       [ Start ]   | |  Moments and moods.          |
+------------------------------+ +------------------------------+
```
Generating times out at 12 s into a bank set, with the line "Couldn't write personal rounds this time, so here's a mixed set."

```
ROUND: GUESS (pick + guess)        ROUND: MATCH (2 options)
+------------------------------+   +------------------------------+
| x  Weekends      Round 2 / 7 |   | x  Weekends      Round 1 / 7 |
|    o * o o o o o  Kezia here |   |    * o o o o o o             |
| Pick a comfort food after a  |   | Long weekend plan?           |
| long day.                    |   | +-----------+ +-----------+  |
| YOU                          |   | | Staycation| | Road trip |  |
| [Indomie telur][Nasi Padang] |   | | in town   | | out of    |  |
| [Martabak    ][Bakso       ] |   | |           | | the city  |  |
| YOUR GUESS FOR KEZIA         |   | +-----------+ +-----------+  |
| [Indomie telur][Nasi Padang] |   | Pick what you'd actually     |
| [Martabak    ][Bakso       ] |   | want. Match if you agree.    |
| Skip this one    [ Lock in ] |   | Skip this one    [ Lock in ] |
+------------------------------+   +------------------------------+
ROUND: SCALE (1-5 + guess)         LOCKED, PARTNER NOT YET
+------------------------------+   +------------------------------+
| How spicy can you go?        |   | Locked in.                   |
| Mild only      Level 5 seblak|   | Kezia hasn't answered this   |
| YOU      (1)(2)(3)(4)(5)     |   | one yet. Keep going, the     |
| GUESS    (1)(2)(3)(4)(5)     |   | reveal waits for you.        |
| Skip this one    [ Lock in ] |   | Change answer  [ Next round ]|
+------------------------------+   +------------------------------+
```
Nothing is pre-selected. "Lock in" stays disabled until every required pick is made. "Change answer" works until the partner answers that round. "Skip this one" works only before either of you answers, with at most 2 skips per set; the partner sees "Skipped by Eric".

```
REVEAL (stays until Next)          I FINISHED FIRST
+------------------------------+   +------------------------------+
| Pick a comfort food after a  |   | You're done.                 |
| long day.                    |   | Kezia has answered 2 of 7.   |
| Eric       Nasi Padang       |   | We'll tell you when she's    |
|  Kezia guessed it      [ok]  |   | done.                        |
| Kezia      Martabak          |   | [ See 2 reveals ]            |
|  You guessed Bakso   New     |   | [ Nudge Kezia ] (after 3 h)  |
| 1 match . 1 new to you       |   +------------------------------+
| Talk about it: the best      |
| martabak you've ever had.    |
|                   [ Next ]   |
+------------------------------+
RESULTS (both answers per round)   OLDER GAME (legacy, read-only)
+------------------------------+   +------------------------------+
| Weekends . 3 Nov             |   | First Trip . 12 Oct  72%     |
|      9 of 12 matches         |   | From the first version of    |
|   3 new things you learned   |   | Samakan.                     |
|   Your best set so far       |   | 1 Where to tomorrow?         |
| "You agree on weekends more  |   |   Eric Beach . Kezia Beach   |
|  than you think. The one     |   | 2 How long can you walk?     |
|  that got you: Kezia's       |   |   Eric 7 . Kezia 4           |
|  comfort food."              |   | ...                          |
| Talk about it: when did      |   | [ Back to Samakan ]          |
|  martabak become hers?       |   +------------------------------+
| 1 Long weekend    Same pick >|
| 2 Comfort food    1 of 2    >|
| ...                          |
| [ Done ]      [ Another set ]|
+------------------------------+
```
Other states:
- **Partner left (live).** An inline line, "Kezia stepped away. Your answers are saved." No overlay, nothing ends.
- **Offline.** A top banner, "You're offline. Your picks are saved here and send when you're back." "Lock in" is disabled, and picks are kept in `localStorage` (`nk:samakan:draft:<setId>`, every access in try/catch).
- **Ended or expired set.** Results show the rounds both answered. Copy: "This set ended. Rounds you both answered are below."
- **No partner yet.** "Samakan needs two. Invite your partner first."

### 5.3 Mechanics

- **Set.** 7 rounds in a fixed kind order: `match, guess, scale, guess, match, scale, guess`. One open set per couple. Either partner can start or end it. It is open for 7 days, then `expired` (applied lazily on hub load or create, no cron).
- **Round kinds** (stored values; labels in brackets):
  - `match` ("Same page"): 2 options. Each picks what they'd actually want. +1 if the picks are equal. Max 1.
  - `guess` ("Guess me"): 4 options. Pick your own answer, then guess your partner's. +1 per correct guess. Max 2.
  - `scale` ("On a scale"): 1-5 with low and high labels. Rate yourself, then guess your partner. +1 per exact guess; off by one shows "Close", 0 points. Max 2.
- **Max per set** is 12. A skipped round leaves both the score and the max. **"New to you"** counts wrong guesses (a guess off by 2 or more, or the wrong option).
- **Timing.** No timers, no countdown, no auto-advance, no audio. A round reveals the moment the second answer lands (realtime). The first finisher gets a reveal walk-through on return.
- **Answers** can change until the partner answers that round, then they lock.
- **Best** is the highest matches/max among sets with at least 5 answered rounds; ties go to the latest. **Streak** is consecutive Jakarta weeks (Monday start) with at least 1 finished set, and the current week doesn't break it until it ends. **Sets played** counts finished sets. The hub also shows "Last time: 9 of 12".
- **Sources.** "For you two" is the AI-written set, at most 1 per couple per Jakarta day. Six bank themes (`food, weekends, home, travel, habits, plans`) are unlimited. `mixed` is the fallback. The bank has 120 rounds at launch (40 per kind), and a couple sees no `bank_id` again within 60 days (if the bank runs dry, oldest-used comes first). Option order for `guess` is shuffled once at creation and stored.
- **What persists.** On the server: sets, rounds, answers, matches, the read-out and AI usage. On the device: unsent picks only.
- **Live mode** is a presence channel `samakan:<setId>`, used only to show "Kezia is here". Game state arrives through `postgres_changes` UPDATE on `samakan_sets`, followed by a refetch of `samakan_set_state`. There is no broadcast game protocol and no host.

### 5.4 AI (Claude Sonnet 5.5, server only)

- **Client.** `@anthropic-ai/sdk` in `src/lib/samakan-ai.ts`, env `ANTHROPIC_API_KEY` (server only, added to `.env.example`). The rest of the app stays on GPT Luna via OpenRouter (`src/lib/llm.ts:16`).
- **Call 1, rounds.** Live on tap of "For you two", inside `POST /api/games/samakan/sets`, before the partner's push.
- **Call 2, read-out.** Once per finished set, from `POST /api/games/samakan/sets/[id]/readout`, which the final answerer's client calls. Any results view that finds no read-out calls it too, guarded by a claim (`readout_status pending`).
- **Request.** `client.messages.parse({ model: 'claude-sonnet-5-5', max_tokens: 1200 (rounds) | 300 (read-out), thinking: { type: 'between_tools' }, output_config: { effort: 'low', format: zodOutputFormat(schema) }, system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: CONTEXT }] }, { timeout: 12_000, maxRetries: 1 })`. `between_tools` is how Sonnet 5.5 turns thinking off (`disabled` returns a 400). Check `stop_reason` before reading output: a `refusal` or `max_tokens` goes to the bank. Server-side `fallbacks` stays off on purpose, because a free bank fallback beats a second paid model under a hard per-couple cap. Revisit if refusals pass 2%.
- **System prompt outline** (byte-stable, no dates or names, about 1,500 tokens, above the 512-token cache minimum):
  1. Role: write a 7-round Samakan set for one couple in Indonesia.
  2. Kind definitions and the fixed order.
  3. Safety rules S1-S8.
  4. `AI_STYLE_RULES` from `src/lib/ai-style.ts`.
  5. 6 good and 3 bad example rounds.
  6. Option rules: short, distinct, everyday Indonesian life, local words allowed.
  7. Use the context to make 3 to 5 rounds personal and mark their `source`; keep the rest general.
- **Read-out system prompt** (about 700 tokens): a warm two-sentence read of how in sync they were. Reference at least one real answer, end with one question to talk about, no percentages, no advice tone.
- **Rounds context** (user message, at most 1,800 tokens, built server-side):
  - first names, days together, today's Jakarta date
  - last 10 Daily Question answers from each partner, 140 characters max each, with the question text
  - last 8 Moments: title, place, month
  - mood counts per person over 14 days (keys only, no notes)
  - up to 8 open Bucket List titles
  - top love language per person, if known
  - the couple's last 40 Samakan prompts and their skipped prompts, to avoid repeats
- **Never sent to the model:** letters, Kangen, money, mood notes, Moment descriptions or comments, Two Truths stories.
- **Rounds output schema** (strict; every field is required, and fields that don't apply are empty strings or arrays):
```json
{"type":"object","additionalProperties":false,"required":["rounds"],
 "properties":{"rounds":{"type":"array","items":{"type":"object","additionalProperties":false,
  "required":["kind","prompt","options","low","high","talk","source"],
  "properties":{"kind":{"enum":["match","guess","scale"]},"prompt":{"type":"string"},
   "options":{"type":"array","items":{"type":"string"}},"low":{"type":"string"},"high":{"type":"string"},
   "talk":{"type":"string"},"source":{"enum":["daily","moments","mood","bucket","general"]}}}}}}
```
  Read-out schema: `{ headline, note, ask }`, all strings.
- **Server validation** (zod, after parse): exactly 7 rounds in kind order; options 2/4/0 by kind, unique, 1-32 characters each; prompt 8-140 characters; talk at most 120; `tidyAiText` applied; near-duplicate check against the couple's past prompts. A round that fails is replaced by a bank round of the same kind. If 3 or more fail, the whole set comes from the bank, with `fallback_reason = 'invalid'`.
- **Safety rules** (prompt and server regex blocklist):
  - S1 nothing sexual, no bodies, weight or looks
  - S2 no exes, jealousy, cheating, breakups
  - S3 no money amounts, salary, debt
  - S4 no religion, politics, family conflict or in-laws
  - S5 no health, pregnancy, fertility, mental-health labels; no alcohol, drugs, gambling
  - S6 scale prompts rate preferences, never virtues or flaws; no "most annoying habit"
  - S7 mood sets the tone only and is never quoted back ("you've been sad a lot" is banned)
  - S8 personal rounds use only facts in the context, never invented events
  - Read-out: never judges the relationship ("incompatible", "red flag")
- **Cost** (Sonnet 5.5: $2 input, $10 output, $2.50 cache write, $0.20 cache read per MTok). Each estimate assumes a cache write, because with few couples a 5-minute cache rarely hits.
  - Rounds: 1,500 system x $2.50 + 1,300 context x $2 + 800 output x $10 = **$0.0144** (worst case at the caps: $0.0194).
  - Read-out: 700 x $2.50 + 900 x $2 + 150 x $10 = **$0.0051** (worst case: $0.0072).
  - **Per couple per day:** typical $0.019 (1 personal set + 1 read-out). A bank-only day with 2 read-outs is $0.010. Hard cap **$0.025**, so about $0.75 a month at most.
- **Cap enforcement.** `samakan_claim_ai(couple, kind, reserve_micros)` (service role) locks the couple row and sums today's `usd_micros` plus pending reserves. It refuses when the total would pass 25,000 micros, or when the count limit is hit (rounds: 1/day, read-outs: 2/day). After the call, the actual usage (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) is written back. A refused claim falls back to the bank, or to the template read-out: "{matches} of {max} matches. {new} new things you learned. Talk about it: {talk line of the biggest miss}."
- **Identical rounds on both phones.** Rounds are inserted once, server-side, into `samakan_rounds` (with position and stored option order) before the invite push goes out. Both phones read the same rows through `samakan_set_state`, and nothing is generated on a client.
- **Personal switch.** `couples.samakan_personal` (default true). When off, the server skips the AI call and reads no couple data.

### 5.5 Data model (migration `20261104120000_samakan_v2.sql`)

- `samakan_sets`: `id, couple_id, created_by (set null), source ('ai'|'bank'), theme, fallback_reason, status ('open'|'done'|'ended'|'expired'), progress jsonb {profile_id: answered_count}, matches smallint, max_matches smallint, readout jsonb {headline,note,ask,by}, readout_status ('none'|'pending'|'done'), version int, created_at, finished_at, ended_by`.
  - Partial unique index on `couple_id` where `status = 'open'`.
  - RLS: select for members; no client writes. Added to `supabase_realtime` (it holds no answer values).
- `samakan_rounds`: `id, set_id, position 0-6, kind, prompt, options text[], low_label, high_label, talk, source, bank_id, skipped_by, skipped_at`, unique `(set_id, position)`. Select for members.
- `samakan_answers`: `id, round_id, profile_id (set null), pick smallint, guess smallint null, answered_at, updated_at`, unique `(round_id, profile_id)`. **No client grants, no policies**, RPC only (Two Truths pattern).
- `samakan_ai_usage`: `id, couple_id, set_id, kind ('rounds'|'readout'), status, reserve_micros, usd_micros, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, model, jakarta_date, created_at`. Service role only.
- `samakan_push_log`: `recipient_id, set_id, kind ('start'|'finish'|'nudge'), jakarta_date, created_at`, unique `(set_id, kind)` for finish and nudge. Service role only.
- `couples.samakan_personal boolean not null default true`; `notification_prefs.games boolean not null default true`.
- **RPCs** (security definer; errors carry hint codes `SK_AUTH, SK_NO_PARTNER, SK_CLOSED, SK_NOT_FOUND, SK_INVALID, SK_LOCKED, SK_ANSWERED, SK_SKIP_LIMIT, SK_OPEN_SET`):
  - `samakan_hub()`: open set summary and both progress counts, last 20 finished sets, best, streak, sets played, the count of older games, and the personal switch.
  - `samakan_set_state(set)`: rounds, my answers, and partner answers only for rounds I have answered too, plus progress and status.
  - `samakan_answer(round, pick, guess)`: validates ranges by kind; locks the round row (`for update`) so two simultaneous answers score once; upserts while the partner hasn't answered; returns `{revealed, partner?, done}`. When it writes the last answer, it sets status `done`, computes `matches/max_matches`, sets `finished_at` and writes an `activities` row (no answer text).
  - `samakan_skip(round)`, `samakan_end(set)`, `samakan_set_personal(bool)`.
  - Service role only: `samakan_insert_set(couple, creator, source, theme, reason, rounds jsonb)`, which returns the new id or the existing open id; `samakan_claim_ai`; `samakan_finish_ai`; `samakan_claim_readout`; `samakan_save_readout`.
- **Old data.**
  - Run `update game_sessions set status = 'expired' where status in ('waiting','playing')`.
  - Replace `game_sessions_member_all` with a select-only member policy and revoke insert, update and delete from `authenticated`. No rows are deleted.
  - `/app/games/samakan/[sessionId]` becomes a read-only "Older game" view built from `rounds` jsonb (each round has `config` plus `hostAnswer` and `guestAnswer`).
  - `POST /api/games/samakan/create` returns `410 { error: "This version of Samakan was retired. Refresh the app." }`.
  - `recap.ts:144` counts finished `samakan_sets` plus completed `game_sessions`.
  - The verify scripts that insert `game_sessions` (`rls-flows.mjs:159,173`, `account.mjs:305`) change to assert that inserts are refused.
- New play route: `/app/games/samakan/set/[setId]`. The static `set` segment outranks `[sessionId]`, so old push links still open the legacy view.

### 5.6 Notifications (new push kind `games`)

| Push | To | Rule |
|---|---|---|
| "Eric started a Samakan set. Seven quick rounds, answer whenever." | partner | On create, never for a set the partner started |
| "Kezia finished Samakan. See how you matched." | first finisher | Sent from the read-out route; skipped if the recipient answered in the last 2 min (they're live) |
| "Eric's still waiting on your Samakan answers." | partner | Manual nudge, at most 1 per set, at least 3 h after start, only if the partner hasn't finished |

- At most 3 Samakan pushes per recipient per Jakarta day (counted in `samakan_push_log`).
- Quiet hours apply (`isPushMuted`). A held push is dropped, and the activity feed and hub badge still show it.
- `games` joins `PUSH_KINDS` and `SWITCH_KINDS`, with a "Games" row in notification settings: "When your partner starts, finishes or nudges you in Samakan".
- No reminder or streak pushes, ever.

### 5.7 Copy samples (final voice)

- Games card: "Samakan" / "Guess each other's answers"
- Hub subtitle: "Seven quick rounds. You answer now, {partner} answers whenever."
- How it works: "Pick your answer, then guess {partner}'s. Each round opens once you've both answered."
- For you two: "From your Daily Questions and Moments. One a day." Used: "Today's personal set is done. Back tomorrow."
- Live: "Kezia is here. Answers show up as soon as you both lock in."
- Locked: "Locked in. Kezia hasn't answered this one yet."
- Reveal labels: "Same pick", "Read you right", "Close", "New to you", "Different picks".
- Results: "9 of 12 matches. 3 new things you learned about each other."
- New best: "Your best set so far." Streak: "3 weeks in a row."
- End set: "End this set for both of you? Rounds you both answered stay in your history."
- Skip: "Skip this one" / "Skipped by Kezia"
- Fallback: "Couldn't write personal rounds this time, so here's a mixed set."
- No data yet: "Answer a few Daily Questions first and these get personal."
- Errors: "Couldn't save your answer. Check your connection and try again."

### 5.8 Curated bank examples (each round has a `talk` line in the build)

**match (2 options)**
1. Long weekend plan? · Staycation in town / Road trip out of the city
2. Rainy Sunday? · Movie marathon at home / Mall and coffee
3. Dinner tonight? · Cook together / Order GoFood
4. Next date night? · Street food crawl / Nice dinner, dressed up
5. Saturday morning? · Car Free Day walk / Sleep in, big brunch
6. Holiday photos? · Hundreds, every angle / A few, then phones away
7. Our someday home? · Apartment in the city / House with a small yard

**guess (4 options, pick + guess)**
1. Pick a comfort food after a long day. · Indomie telur / Nasi Padang / Martabak manis / Bakso
2. Your ideal Saturday night? · Movie at home / Night market / Out with friends / Early sleep
3. Which chore would you happily do every week? · Cooking / Laundry / Dishes / Groceries
4. When you're stressed, what helps most? · Talking it out / Quiet time alone / Something to eat / A long nap
5. Dream trip for next year? · Japan / Labuan Bajo / Korea / Europe
6. Which gift would make your week? · A handwritten letter / Something to eat / A gadget / A day planned for you
7. First thing you do in the morning? · Coffee / Check my phone / Quick workout / Snooze three times
8. (personal, source moments) On the Bandung trip in August, what do you still bring up most? · The cold mornings / Kue balok / Getting lost / The villa view

**scale (1-5, self + guess)**
1. How spicy can you go? · Mild only / Level 5 seblak
2. How far ahead do you plan a trip? · Book on the day / Spreadsheet ready
3. How chatty are you in the morning? · Don't talk to me yet / Talking before my eyes open
4. How much do you like surprises? · Tell me first / Surprise me anytime
5. How long can you wait for food when you're hungry? · Feed me now / I can wait an hour
6. How into karaoke are you? · I'll hold the bags / Give me the mic
7. How much quiet do you need after a busy week? · None, let's go out / A whole day to myself

### 5.9 Acceptance criteria (verification gates)

1. Creating a set inserts exactly 7 rounds in the order `match, guess, scale, guess, match, scale, guess`. Both partners' `samakan_set_state` return identical round ids, prompts and option order.
2. A second create while a set is open returns the open set's id (`existing: true`), including the partner's set, and inserts nothing.
3. `authenticated` cannot select, insert, update or delete `samakan_answers`. No RPC, table, embed or realtime payload exposes a partner answer for a round the caller hasn't answered.
4. `samakan_answer` rejects an out-of-range or missing pick or guess for its kind with `SK_INVALID`.
5. An answer can change until the partner answers that round; after that the call returns `SK_LOCKED`.
6. Two simultaneous answers to one round both store, and `matches` comes out the same as a sequential run.
7. Scoring: match +1 when equal; guess +1 per correct guess; scale +1 per exact guess. Max is 12 with no skips, and a skipped round reduces the max by its own max.
8. The set flips to `done` exactly when both have answered every non-skipped round, storing `matches`, `max_matches` and `finished_at`, and it writes one activity row with no answer text.
9. A skip succeeds only before anyone answers the round, and a 3rd skip in a set returns `SK_SKIP_LIMIT`.
10. Open sets older than 7 days become `expired` on the next hub load or create. Rounds both answered stay visible; one-sided answers are never returned.
11. `samakan_sets` is in the realtime publication, its row never contains answer values, and every answer bumps `version`.
12. A second "For you two" on the same Jakarta day makes no API call (mock counter) and creates a bank set with `fallback_reason = 'daily_limit'`.
13. A timeout (12 s), API error, `refusal`, `max_tokens` stop or schema failure still produces a bank set within 13 s.
14. Fixture outputs containing S1-S8 violations or em dashes are replaced round by round, and 3 or more failures produce a full bank set.
15. The built context contains no letters, Kangen, money, mood notes, Moment descriptions or comments (fixture check), and stays at or under 1,800 tokens.
16. `SYSTEM` is byte-identical across couples and dates (snapshot), at least 512 tokens, and carries `cache_control`. Every call writes `samakan_ai_usage` with `usd_micros` computed from `usage`.
17. Per couple per Jakarta day, AI spend never passes 25,000 micros, with at most 1 rounds call and 2 read-out calls. Anything past that uses the template.
18. With `samakan_personal = false`, the create route reads no Daily Question, Moment, mood or Bucket List rows and makes no API call.
19. Each finished set has at most 1 read-out. The read-out has no percent sign, no em dash, a note of 220 characters or fewer, and an `ask`.
20. There is no auto-advance, countdown or audio anywhere; a reveal stays until Next.
21. No round input has a pre-selected value, and "Lock in" is disabled until every required pick is made.
22. Results list every non-skipped round with its prompt, both picks, both guesses and the match marks, and every past-set row opens its results.
23. The hub shows best, weeks in a row (Jakarta weeks, Monday start) and sets played, matching a fixture couple's expected values.
24. Pushes: a start push goes to the partner only; a finish push goes to the first finisher and is suppressed when they answered within 2 min; nudges are capped at 1 per set and only after 3 h; at most 3 per recipient per day; quiet hours and the `games` switch apply (unit tests on `isPushMuted(prefs, 'games')`).
25. Legacy: completed `game_sessions` rows open read-only with questions and both answers; no `waiting` or `playing` rows remain; `POST /api/games/samakan/create` returns 410; `authenticated` can't insert into `game_sessions`.
26. Recap counts finished sets plus legacy completed games for the month.
27. `copy-audit.mjs` passes on the new paths and the bank, and `slop-gate.mjs` scores 5/5.
28. `layout-audit` finds no horizontal scroll at 360 px on the hub, every round kind, reveal and results.
29. Offline: "Lock in" is disabled and the banner shows; picks survive a reload and send once the phone is back online.
30. `leaf-check.mjs` passes for each leaf's paths, and `scripts/verify/game-samakan.mjs` prints "game samakan verification passed".

### 5.10 Build plan (3 leaves, disjoint files)

| Leaf | Owns | Depends on | Gates |
|---|---|---|---|
| A. Data and rules | `supabase/migrations/20261104120000_samakan_v2.sql`, `src/types/samakan.ts`, `src/types/database.ts`, `src/components/games/samakan/logic.ts` (pure scoring, validation, streak, bank pick), `src/data/samakan-bank.ts` (120 rounds), `src/lib/recap.ts`, `scripts/verify/game-samakan.mjs`, `scripts/verify/rls-flows.mjs`, `scripts/verify/account.mjs` | none | 1-11, 23, 25 (DB), 26, 27 (bank) |
| B. Server, AI, push | `src/app/api/games/samakan/**`, `src/lib/samakan-ai.ts`, `src/lib/push-server.ts`, `src/lib/quiet-hours.ts`, `src/app/app/profile/notifikasi/page.tsx`, `package.json`, `package-lock.json`, `.env.example`, `scripts/verify/samakan-ai.mjs` (mocked SDK) | A (RPC names, types) | 12-19, 24, 25 (410) |
| C. Screens | `src/app/app/games/samakan/**` (hub, `set/[setId]`, legacy `[sessionId]`), `src/components/games/samakan/*.tsx`, `src/lib/samakan.ts`, `src/app/app/games/page.tsx`, deletes `src/components/game/{Sinkronisasi*,Round*,StoryCard,GameExitControls}.tsx` and `public/audio/samakan-bgm.m4a` (keeps `DeepTalkPackIcon.tsx`, used by Deep Talk) | A types; B route contract (stub until B lands) | 20-23, 25 (UI), 27, 28, 29 |

Order: A first. Then B and C in parallel, with C stubbing `POST /sets` and `/readout`. Closing pass: full `run-all.mjs`.

### 5.11 Risks and open questions for Eric

1. **Personal rounds send Daily Question answers, Moment titles and mood counts to Anthropic.** Default on with a visible switch in the hub (recommended), or default off and ask on the first "For you two"?
2. **The lobby goes away completely.** Live play only happens when you both open the same set. Is that enough, or do you want a "Play now together" button that sends a push saying "I'm on Samakan right now"? It would count toward the 3-a-day cap.
3. **A second AI provider.** Samakan would add `@anthropic-ai/sdk` and `ANTHROPIC_API_KEY` alongside OpenRouter. Env-only for v1 (recommended), or a key field in Admin → AI (Vault) like the current LLM key?
