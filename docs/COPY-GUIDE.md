# Nanti Kita copy guide

The app's copy is English, except for a few names that stay Indonesian. This
guide is the contract for every string a user can see: UI text, toasts, errors,
push notifications, AI output, emails built by the app, game and question
content, and the messages raised by SQL functions.

Checks: `node scripts/verify/copy-audit.mjs` (Indonesian leftovers, em dashes)
and `node scripts/verify/slop-gate.mjs` (AI tells, must score 5/5). See the end
of this file.

## Who reads it

Indonesian couples in their 20s and 30s, dating, engaged or married, on their
phones. They read English well but casually. Write the way a warm, slightly
playful friend texts. Never sound like a brochure or a therapist.

## Names that stay Indonesian

Keep these exact spellings. Never translate them and never add a gloss in
brackets. Describe them in English around the name instead.

| Name | What it is | Example |
|---|---|---|
| Nanti Kita | the app | "Welcome to Nanti Kita" |
| Kangen | the miss-you ping | "Send a Kangen", "Kezia sent you a Kangen" |
| Jelajah | the explore tab | tab label "Jelajah" |
| Samakan | the real-time sync game (was shown as "Sinkronisasi") | "Play Samakan" |
| Pet Kita | the shared virtual pet | "Pet Kita is hungry" |

## Glossary (Indonesian → English)

| Indonesian | English |
|---|---|
| Beranda | Home |
| Kalender | Calendar |
| Profil | Profile |
| Pasangan (noun, the other person) | your partner, or the partner's name when known |
| Kita Berdua | Us |
| Mood Harian | Daily Mood |
| Aktivitas | Activity |
| Milestone | Milestones |
| Perjalanan Kita | Our Story |
| Recap Bulanan | Monthly Recap |
| Kenangan | Memories |
| Moment / Peta Moment | Moments / Moments Map |
| Kenangan hari ini | On This Day |
| Toples / Toples Apresiasi | Jar (renamed 2026-11-03; route stays /app/toples) |
| Scrapbook | Scrapbook |
| Surat Rahasia / surat | Letters / letter |
| surat terkunci sampai … | locked until … |
| Ngobrol & Main | Talk & Play |
| Arsip Jawaban / Arsip Pertanyaan | Past Answers / Past Questions |
| Peliharaan | Pet |
| Rencana | Plans |
| Ide Date | Date Ideas |
| Bucket list | Bucket List |
| Abadikan jadi Moment | Save as a Moment |
| Pertanyaan harian | Daily Question |
| Keuangan / Tabungan / target tabungan | Money / Savings / savings goal |
| Transaksi / pemasukan / pengeluaran | transaction / money in / money out |
| Wishlist | Wishlist |
| Acara / pengingat | event / reminder |
| hari bersama | days together |
| Kode undangan / Buat kode baru | invite code / New code |
| Keluar dari pasangan | Leave this couple |
| Ruang kenangan (closed couple) | Memory archive |
| Hapus akun | Delete account |
| Jam tenang | Quiet hours |
| Ekspor data | Export my data |
| Masuk / Daftar / Keluar (auth) | Log in / Sign up / Log out |
| Lupa password | Forgot password |
| Premium / Buka Premium | Premium / Get Premium |

Anything not listed: translate the meaning in plain words, then add it here if
it repeats.

## Voice

- Second person. Use the partner's name when the code has it.
- Short. Buttons are 1 to 3 words in sentence case: "Save letter", not
  "Save Letter" and not "Click here to save".
- Plain verbs. "Couldn't save the letter. Check your connection and try again."
  Say what happened, then what to do. No "Oops", "Uh-oh", "Whoops".
- Contractions are fine (you're, can't, it's).
- At most one exclamation mark per screen, and only for a real celebration.
- Questions in games and Deep Talk read like a person asking across the table,
  not like a survey.

## Hard rules

1. **No em dashes (—)** anywhere in user-facing copy. Use a comma, a period, a
   colon, or brackets. (En dashes in number ranges like "1–3" are fine.)
2. **No decorative emoji** in sentences, headings, buttons, toasts or push
   notifications. Keep emoji only where the emoji itself is the content: mood
   picker faces, reaction buttons, pet states, stickers, Deep Talk pack icons.
3. **No AI tells.** Banned words and shapes (the slop gate catches most):
   journey, unlock, seamless, elevate, embark, delve, tapestry, treasure trove,
   realm, foster, navigate (feelings), "deepen your bond", "strengthen your
   relationship", "create lasting memories", "cherish every moment", "not just
   X, but Y", "whether you're X or Y", the reflex list of three adjectives,
   hedge stacks, closing summaries. Exception: "unlock" may describe a letter
   that literally opens at a set time only if no other word fits; prefer
   "opens".
4. **Never invent proof.** No user counts, ratings, testimonials.
5. **Do not change anything that is code or data**, only the words people
   read:
   - route paths and URLs (`/app/toples`, `/app/perjalanan` stay)
   - table and column names, RPC names, enum and CHECK values, values written
     to the database (for example mood keys, round types like `tebak_pasangan`,
     category keys), localStorage keys, push `kind` ids, query keys, test ids
   - when a stored value is Indonesian, keep the value and map it to an
     English label for display. Mark the value's line `// copy-ok: stored value`.

## Dates, numbers, money

- Dates and times: `Intl` / `toLocale*` with `'en-GB'` (→ "3 November 2026",
  "Mon 3 Nov", 24-hour time). Timezone logic stays Asia/Jakarta.
- Relative time: "just now", "5 min ago", "2 h ago", "yesterday", "3 days ago".
- Money stays Indonesian style: `'id-ID'` number format with the "Rp" prefix
  (Rp 1.500.000). Indonesians expect it.
- Plurals: handle 1 vs many ("1 day together", "12 days together").
- Spelling: American (color, favorite, organize, canceled), whatever the date
  format.

## Errors and server messages

- API routes return English `error` strings in the same plain style.
- SQL functions (RAISE EXCEPTION) are re-created in
  `supabase/migrations/20261103120000_english_content.sql` with English
  messages. Signatures, behaviour and SQLSTATE codes stay identical.
- Messages a client matches on: the letter-open RPC uses "locked" (was
  "terkunci") and "not found" (was "tidak ditemukan"). Client matchers accept
  both the old and the new word, so mixed versions during a deploy still work.

## AI output

Prompts are written in English and ask for English output, with the
Indonesian context kept: couples in Indonesia, places in Indonesian cities,
budgets in Rupiah. Never ask the model for Indonesian.

## Content translation (questions, quizzes, game decks)

Translate the intent, not word for word. Keep it culturally Indonesian where
that is the point (Lebaran with both families, mudik, arisan, kos, ojol), using
the local word in an English sentence when there is no good English one.
Content must be safe for a mixed audience: no sexual content, no alcohol
dares, nothing dangerous or humiliating in public.

## How to check your work

```bash
node scripts/verify/copy-audit.mjs --paths <your paths>        # Indonesian + em dash
node scripts/verify/slop-gate.mjs --paths <your paths> --name <x>   # 5/5 required
node scripts/verify/copy-audit.mjs --db                        # DB content + SQL functions
```

A false positive (an English word the marker list mistakes for Indonesian, or a
stored value) gets a `// copy-ok: <reason>` comment on that line. Use it
rarely; the reviewer reads every one.
