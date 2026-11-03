# Deep Talk Level Unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan sistem unlock progresif (L1 → L2 → L3) yang persisten di card game Obrolan Bareng, ganti logic existing yang buggy (hanya tracking 1 level aktif tanpa history) dengan array `completed_levels[]`, plus celebration overlay saat unlock.

**Architecture:** Client-side gate menggunakan helper functions di `src/lib/deep-talk.ts` sebagai single source of truth. Migration additive (`ALTER TABLE ADD COLUMN` + backfill `UPDATE`). Pack page existing di-refactor untuk pakai helpers + tambah state `coming_soon` (0-pertanyaan). Level page existing di-augment dengan URL guard on-mount + celebration overlay. Tidak ada server-side enforcement (cooperative app, bukan adversarial).

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (PostgreSQL + RLS), Tailwind CSS, Lucide icons. No test framework di project — verifikasi via manual UAT.

**Reference spec:** `docs/superpowers/specs/2026-05-25-deep-talk-level-unlock-design.md`

**Discovered during planning:** Pack page (`[packSlug]/page.tsx`) sudah punya `isLevelUnlocked()` lokal + UI lock state, dan level page (`[level]/page.tsx`) sudah punya completion screen. Plan ini me-refactor logic yang sudah ada agar pakai `completed_levels[]` + tambah celebration moment.

---

## File Structure

**Modify:**
- `src/lib/deep-talk.ts` — tambah `LevelStatus` type, `isLevelUnlocked`, `getLevelStatus`, `markLevelCompleted` helpers; update `DeepTalkProgress` interface
- `src/types/database.ts` — tambah field `completed_levels: number[]` di `deep_talk_progress.Row/Insert/Update`
- `src/app/app/games/deep-talk/[packSlug]/page.tsx` — ganti lock logic lokal dgn helpers, tambah `coming_soon` state, tambah toast saat tap locked
- `src/app/app/games/deep-talk/[packSlug]/[level]/page.tsx` — tambah URL guard on-mount, ganti save logic saat completion pakai `markLevelCompleted`, integrate `UnlockCelebration`

**Create:**
- `src/components/app/UnlockCelebration.tsx` — overlay full-screen 1.5s saat unlock pertama kali
- `docs/migrations/2026-05-25-deep-talk-completed-levels.sql` — SQL migration untuk copy-paste ke Supabase Studio (project tidak punya `supabase/migrations/` folder)

---

## Task 1: Database Migration

**Files:**
- Create: `docs/migrations/2026-05-25-deep-talk-completed-levels.sql`
- DB: Tabel `deep_talk_progress` di Supabase staging + production

Project tidak punya `supabase/migrations/` folder — migration dijalankan manual via Supabase Studio SQL Editor. SQL ditulis ke file untuk referensi + versioning.

- [ ] **Step 1.1: Buat folder migrations dan tulis SQL**

Path: `docs/migrations/2026-05-25-deep-talk-completed-levels.sql`

```sql
-- Migration: deep-talk completed_levels[] array
-- Date: 2026-05-25
-- Spec: docs/superpowers/specs/2026-05-25-deep-talk-level-unlock-design.md
--
-- Adds completed_levels int[] to track which levels a couple has completed
-- per pack. Backfills based on existing is_completed flag.
-- Rollback: ALTER TABLE deep_talk_progress DROP COLUMN completed_levels;

ALTER TABLE deep_talk_progress
  ADD COLUMN completed_levels int[] NOT NULL DEFAULT '{}';

-- Backfill: row dengan is_completed = true dianggap selesai sampai level_number
UPDATE deep_talk_progress
SET completed_levels = ARRAY(SELECT generate_series(1, level_number))
WHERE is_completed = true AND completed_levels = '{}';

-- Verify
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE completed_levels <> '{}') AS rows_with_completions,
  COUNT(*) FILTER (WHERE is_completed = true AND completed_levels = '{}') AS backfill_misses
FROM deep_talk_progress;
```

- [ ] **Step 1.2: Jalankan di Supabase Studio (staging dulu)**

Buka Supabase Studio → SQL Editor → paste isi file → Run.

Expected output query verifikasi:
- `total_rows` = jumlah row existing
- `rows_with_completions` ≥ 0 (jumlah couple yang pernah complete level)
- `backfill_misses` = 0 (semua row dengan is_completed=true sudah ke-backfill)

- [ ] **Step 1.3: Verifikasi schema**

Run di SQL Editor:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'deep_talk_progress'
ORDER BY ordinal_position;
```

Expected: row `completed_levels | ARRAY | NO | '{}'::integer[]` muncul.

- [ ] **Step 1.4: Verifikasi RLS masih jalan**

Login sebagai user A (via app), buka `/app/games/deep-talk/kencan-pertama`, lalu cek browser network tab — query `deep_talk_progress` hanya return row dengan couple_id user A.

- [ ] **Step 1.5: Commit migration file**

```bash
git add docs/migrations/2026-05-25-deep-talk-completed-levels.sql
git commit -m "feat(deep-talk): add completed_levels migration

Adds completed_levels int[] column to deep_talk_progress with backfill
from is_completed flag. Migration must be run manually via Supabase
Studio SQL Editor.

Refs: docs/superpowers/specs/2026-05-25-deep-talk-level-unlock-design.md"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/database.ts` (deep_talk_progress.Row, Insert, Update)
- Modify: `src/lib/deep-talk.ts` (DeepTalkProgress interface)

- [ ] **Step 2.1: Update `src/types/database.ts`**

Cari blok `deep_talk_progress` (sudah ada). Tambahkan field `completed_levels` di `Row`, `Insert`, dan `Update`:

```ts
deep_talk_progress: {
  Row: {
    id: string
    couple_id: string
    pack_id: string
    level_number: number
    current_question_index: number
    completed_levels: number[]            // NEW
    is_completed: boolean | null
    started_at: string | null
    last_played_at: string | null
  }
  Insert: {
    id?: string
    couple_id: string
    pack_id: string
    level_number?: number
    current_question_index?: number
    completed_levels?: number[]           // NEW (optional karena ada default)
    is_completed?: boolean | null
    started_at?: string | null
    last_played_at?: string | null
  }
  Update: {
    id?: string
    couple_id?: string
    pack_id?: string
    level_number?: number
    current_question_index?: number
    completed_levels?: number[]           // NEW
    is_completed?: boolean | null
    started_at?: string | null
    last_played_at?: string | null
  }
  Relationships: [ /* unchanged */ ]
}
```

- [ ] **Step 2.2: Update `DeepTalkProgress` interface di `src/lib/deep-talk.ts`**

Lokasi: ~line 28 (existing interface). Tambah field `completed_levels`:

```ts
export interface DeepTalkProgress {
  id: string
  couple_id: string
  pack_id: string
  level_number: number
  current_question_index: number
  completed_levels: number[]              // NEW
  is_completed: boolean | null
  last_played_at: string | null
}
```

- [ ] **Step 2.3: Verifikasi compile**

```bash
npm run build
```

Expected: build sukses 0 error. Kalau ada error "Property 'completed_levels' does not exist" di file lain → catat untuk diperbaiki di task berikutnya (kemungkinan di pack page atau level page yang akan kita refactor anyway).

- [ ] **Step 2.4: Commit**

```bash
git add src/types/database.ts src/lib/deep-talk.ts
git commit -m "feat(deep-talk): add completed_levels to TypeScript types

Updates DeepTalkProgress interface and Supabase generated types to
include completed_levels: number[] field added in migration.

Refs: docs/superpowers/specs/2026-05-25-deep-talk-level-unlock-design.md"
```

---

## Task 3: Helper Functions di Lib

**Files:**
- Modify: `src/lib/deep-talk.ts` — tambah `LevelStatus` type, `isLevelUnlocked`, `getLevelStatus`, `markLevelCompleted`

- [ ] **Step 3.1: Tambah `LevelStatus` type dan `isLevelUnlocked` helper**

Tambah di `src/lib/deep-talk.ts` setelah interfaces (sebelum `getPacksWithProgress`):

```ts
export type LevelStatus = 'coming_soon' | 'locked' | 'unlocked' | 'completed'

/**
 * Cek apakah level boleh dimainkan berdasarkan completed_levels.
 * L1 selalu unlocked. L2+ butuh level sebelumnya ada di completed_levels.
 */
export function isLevelUnlocked(levelNumber: number, completedLevels: number[]): boolean {
  if (levelNumber === 1) return true
  return completedLevels.includes(levelNumber - 1)
}

/**
 * Status visual level. Prioritas:
 * 1. coming_soon (0 pertanyaan) — selalu menang, tidak playable
 * 2. completed (ada di completed_levels)
 * 3. unlocked (level sebelumnya completed)
 * 4. locked (default)
 */
export function getLevelStatus(
  level: DeepTalkLevel,
  completedLevels: number[]
): LevelStatus {
  if ((level.question_count ?? 0) === 0) return 'coming_soon'
  if (completedLevels.includes(level.level_number)) return 'completed'
  if (isLevelUnlocked(level.level_number, completedLevels)) return 'unlocked'
  return 'locked'
}
```

- [ ] **Step 3.2: Tambah `markLevelCompleted` helper**

Tambah di `src/lib/deep-talk.ts` setelah `saveProgress` (di akhir file):

```ts
/**
 * Mark a level as completed in completed_levels[]. Re-fetches existing progress
 * to merge (handles race when partner also completes simultaneously).
 *
 * Returns unlockedNext = true hanya jika level ini BARU pertama kali completed
 * (bukan replay). Caller pakai flag ini untuk decide apakah show celebration.
 */
export async function markLevelCompleted(
  coupleId: string,
  packId: string,
  levelNumber: number,
  totalQuestions: number
): Promise<{ unlockedNext: boolean }> {
  const supabase = createClient()

  // Re-fetch existing untuk merge (race-safe)
  const existing = await getProgress(coupleId, packId)
  const completed = new Set(existing?.completed_levels ?? [])
  const wasNew = !completed.has(levelNumber)
  completed.add(levelNumber)

  await supabase.from('deep_talk_progress').upsert(
    {
      couple_id: coupleId,
      pack_id: packId,
      level_number: levelNumber,
      current_question_index: totalQuestions,
      completed_levels: Array.from(completed).sort((a, b) => a - b),
      is_completed: existing?.is_completed ?? false,
      last_played_at: new Date().toISOString(),
    },
    { onConflict: 'couple_id,pack_id' }
  )

  return { unlockedNext: wasNew }
}
```

- [ ] **Step 3.3: Verifikasi compile dan import**

```bash
npm run build
```

Expected: sukses 0 error. Helpers belum dipakai dimana-mana, tapi harus compile.

- [ ] **Step 3.4: Commit**

```bash
git add src/lib/deep-talk.ts
git commit -m "feat(deep-talk): add level unlock helper functions

Adds LevelStatus type, isLevelUnlocked, getLevelStatus, and
markLevelCompleted helpers as single source of truth for level
gating logic. Race-safe via re-fetch-before-merge pattern.

Refs: docs/superpowers/specs/2026-05-25-deep-talk-level-unlock-design.md"
```

---

## Task 4: UnlockCelebration Component

**Files:**
- Create: `src/components/app/UnlockCelebration.tsx`

- [ ] **Step 4.1: Tulis component**

Path: `src/components/app/UnlockCelebration.tsx`

```tsx
'use client'

import { useEffect } from 'react'
import { Sparkles } from 'lucide-react'

interface Props {
  levelNumber: number
  levelTitle: string
  questionCount: number
  onDismiss: () => void
}

export default function UnlockCelebration({ levelNumber, levelTitle, questionCount, onDismiss }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 1800)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onDismiss}
    >
      <div className="flex flex-col items-center px-8 text-center text-white animate-scale-in">
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-full bg-rose/40 animate-ping" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-rose to-rose-dark shadow-glow">
            <Sparkles className="h-12 w-12 text-white" strokeWidth={1.5} />
          </div>
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-white/70">Level Terbuka</p>
        <h2 className="mt-2 text-3xl font-extrabold drop-shadow-md">Level {levelNumber}</h2>
        <p className="mt-1 text-lg font-bold text-white/90">{levelTitle}</p>
        <p className="mt-3 text-sm text-white/70">{questionCount} pertanyaan baru menanti</p>
      </div>
    </div>
  )
}
```

Animasi yang dipakai (`animate-fade-in`, `animate-scale-in`, `animate-ping`, `shadow-glow`) semuanya sudah tersedia di `tailwind.config.js` (verified) dan default Tailwind.

- [ ] **Step 4.2: Verifikasi compile**

```bash
npm run build
```

Expected: sukses. Component belum dipakai.

- [ ] **Step 4.3: Commit**

```bash
git add src/components/app/UnlockCelebration.tsx
git commit -m "feat(deep-talk): add UnlockCelebration overlay component

Full-screen overlay 1.8s with rose gradient pulse + sparkles icon.
Auto-dismisses or click-to-dismiss. Used when player unlocks a new
level for the first time.

Refs: docs/superpowers/specs/2026-05-25-deep-talk-level-unlock-design.md"
```

---

## Task 5: Refactor Pack Page — Use Helpers + Coming Soon State

**Files:**
- Modify: `src/app/app/games/deep-talk/[packSlug]/page.tsx`

Existing pack page sudah punya `isLevelUnlocked()` dan `getLevelStatus()` lokal yang **buggy** (pakai single `level_number` + `is_completed`). Refactor: hapus lokal, pakai helper dari lib, tambah handling `coming_soon`.

- [ ] **Step 5.1: Update imports**

Ganti import dari `@/lib/deep-talk` (line 7):

```ts
import {
  getPackBySlug,
  getLevelsForPack,
  getProgress,
  getLevelStatus,
  type LevelStatus,
} from '@/lib/deep-talk'
```

Hapus baris 7 yang lama, ganti dengan blok di atas. Pertahankan `type` imports di line 8.

- [ ] **Step 5.2: Hapus fungsi `isLevelUnlocked` dan `getLevelStatus` lokal**

Di file pack page, hapus lines 54-71 (kedua function lokal). Pakai helper dari lib.

- [ ] **Step 5.3: Update fungsi `getButtonLabel`**

Ganti signature & body (line 73-78). Status sekarang return `LevelStatus` dari lib (4 nilai), bukan `'locked'|'completed'|'in_progress'|'available'`:

```ts
function getButtonLabel(status: LevelStatus): string {
  if (status === 'coming_soon') return 'Segera Hadir'
  if (status === 'locked') return 'Terkunci'
  if (status === 'completed') return 'Main Lagi'
  return 'Mulai'  // unlocked
}
```

Note: kita drop status `in_progress` dari display karena tidak ada di spec — bisa direstore nanti kalau diperlukan dari `progress.current_question_index`.

- [ ] **Step 5.4: Tambah state untuk inline toast**

Setelah `const [loading, setLoading] = useState(true)` (~line 26), tambah:

```ts
const [lockedToast, setLockedToast] = useState<string | null>(null)

useEffect(() => {
  if (!lockedToast) return
  const timer = setTimeout(() => setLockedToast(null), 2000)
  return () => clearTimeout(timer)
}, [lockedToast])
```

- [ ] **Step 5.5: Ganti loop render level**

Cari blok `{levels.map((level, idx) => { ... })}` (mulai ~line 118). Ganti seluruh body callback dengan implementasi baru:

```tsx
{levels.map((level, idx) => {
  const status = getLevelStatus(level, progress?.completed_levels ?? [])
  const colors = LEVEL_COLORS[idx] ?? LEVEL_COLORS[0]
  const label = getButtonLabel(status)
  const isCompleted = status === 'completed'
  const isUnlocked = status === 'unlocked' || status === 'completed'
  const isComingSoon = status === 'coming_soon'

  return (
    <div
      key={level.id}
      onClick={() => {
        if (status === 'locked') {
          setLockedToast(`Selesaikan Level ${level.level_number - 1} dulu untuk membuka ini ✨`)
        }
      }}
      className={`rounded-2xl border p-4 transition-all ${
        isUnlocked
          ? 'border-border bg-white shadow-card'
          : isComingSoon
            ? 'border-amber-200 bg-amber-50/40'
            : 'border-border bg-cream/30 opacity-70 cursor-pointer'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-xl ${
          isUnlocked ? colors.bg : isComingSoon ? 'bg-amber-100' : 'bg-cream'
        }`}>
          {isUnlocked ? LEVEL_EMOJIS[idx] : isComingSoon ? '🌟' : '🔒'}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-bold ${isUnlocked ? 'text-ink' : 'text-ink-muted'}`}>
              Level {level.level_number}: {level.title}
            </p>
            {isCompleted && <CheckCircle2 className="h-4 w-4 text-sage" />}
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">{level.description}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              isUnlocked ? colors.badge : isComingSoon ? 'bg-amber-100 text-amber-700' : 'bg-cream text-ink-muted'
            }`}>
              {isComingSoon ? 'Segera Hadir' : `${level.question_count} pertanyaan`}
            </span>
          </div>
        </div>
      </div>

      {isUnlocked && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (!coupleId) return
            router.push(`/app/games/deep-talk/${packSlug}/${level.level_number}`)
          }}
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all active:scale-[0.98] ${
            isCompleted
              ? 'bg-cream text-ink-muted hover:bg-cream/80'
              : `text-white shadow-sm`
          }`}
          style={!isCompleted ? { background: pack.color ?? '#E07A9E' } : {}}
        >
          {isCompleted ? (
            <><RotateCcw className="h-4 w-4" /> {label}</>
          ) : (
            <><Play className="h-4 w-4" /> {label}</>
          )}
        </button>
      )}

      {status === 'locked' && (
        <div className="mt-3 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-ink-muted" />
          <p className="text-xs text-ink-muted">Selesaikan Level {level.level_number - 1} untuk membuka</p>
        </div>
      )}

      {isComingSoon && (
        <div className="mt-3 flex items-center gap-1.5">
          <p className="text-xs text-amber-700">Konten level ini sedang dipersiapkan</p>
        </div>
      )}
    </div>
  )
})}
```

- [ ] **Step 5.6: Tambah toast renderer**

Di JSX, tepat sebelum closing `</div>` paling luar (line 191), tambahkan:

```tsx
{lockedToast && (
  <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
    <div className="rounded-full bg-ink px-5 py-2.5 text-xs font-semibold text-white shadow-elevated max-w-[90vw]">
      {lockedToast}
    </div>
  </div>
)}
```

- [ ] **Step 5.7: Verifikasi compile**

```bash
npm run build
```

Expected: sukses 0 error.

- [ ] **Step 5.8: Manual UAT — pack page**

Jalankan `npm run dev`, buka mobile viewport di browser (DevTools). Login as test couple.

| Skenario | Expected |
|---|---|
| Buka `/app/games/deep-talk/kencan-pertama` (couple baru, no progress) | L1 ada tombol "Mulai" warna rose. L2 + L3 grayed-out + 🔒 + text "Selesaikan Level X-1 untuk membuka". |
| Tap badan tile L2 (bukan tombol) | Toast inline muncul di bawah selama 2 detik: "Selesaikan Level 1 dulu untuk membuka ini ✨" |
| Buka `/app/games/deep-talk/masa-depan-kita` (L2 dan L3 dengan question_count=0) | L1 unlocked normal. L2 + L3 tampil dengan background amber pucat, badge "Segera Hadir", icon 🌟, text "Konten level ini sedang dipersiapkan". Tidak ada tombol Main. Tap → tidak ada toast (bukan locked). |

- [ ] **Step 5.9: Commit**

```bash
git add src/app/app/games/deep-talk/[packSlug]/page.tsx
git commit -m "refactor(deep-talk): pack page uses completed_levels helpers

Replaces buggy local isLevelUnlocked (used single level_number flag
that gets overwritten when moving between levels) with shared helpers
from lib/deep-talk. Adds 'coming_soon' state for levels with zero
questions. Adds inline toast when tapping a locked level.

Refs: docs/superpowers/specs/2026-05-25-deep-talk-level-unlock-design.md"
```

---

## Task 6: Level Page — URL Guard + Mark Complete + Celebration

**Files:**
- Modify: `src/app/app/games/deep-talk/[packSlug]/[level]/page.tsx`

Existing level page sudah punya completion screen (Trophy + "Level X Selesai!"). Tambahan: (1) guard URL — kalau locked/coming_soon redirect kembali, (2) saat `isCompleted` set true → panggil `markLevelCompleted` (bukan `saveProgress`), (3) kalau `unlockedNext: true` → show UnlockCelebration sebelum completion screen.

- [ ] **Step 6.1: Update imports**

Ganti import block di lines 7-14:

```ts
import {
  getPackBySlug,
  getLevelsForPack,
  getQuestionsForLevel,
  getProgress,
  saveProgress,
  markLevelCompleted,
  getLevelStatus,
} from '@/lib/deep-talk'
import type { DeepTalkPack, DeepTalkQuestion, DeepTalkLevel } from '@/lib/deep-talk'
import UnlockCelebration from '@/components/app/UnlockCelebration'
```

- [ ] **Step 6.2: Tambah state untuk celebration + next level info**

Setelah `const [flipped, setFlipped] = useState(false)` (~line 33), tambah:

```ts
const [showCelebration, setShowCelebration] = useState(false)
const [nextLevel, setNextLevel] = useState<DeepTalkLevel | null>(null)
const [allLevels, setAllLevels] = useState<DeepTalkLevel[]>([])
```

- [ ] **Step 6.3: Update `loadData` — store all levels + URL guard**

Cari dalam `loadData` (line 35) blok yang load levels (~line 69-71). Ganti dari:

```ts
const levels = await getLevelsForPack(p.id)
const targetLevel = levels.find(l => l.level_number === levelNumber)
if (!targetLevel) { setLoading(false); return }
```

Menjadi:

```ts
const levels = await getLevelsForPack(p.id)
setAllLevels(levels)
const targetLevel = levels.find(l => l.level_number === levelNumber)
if (!targetLevel) { setLoading(false); return }

// URL guard: cek status level berdasarkan completed_levels
const prog = await getProgress(membership.couple_id, p.id)
const status = getLevelStatus(targetLevel, prog?.completed_levels ?? [])
if (status === 'locked') {
  router.replace(`/app/games/deep-talk/${packSlug}?locked=${levelNumber}`)
  return
}
if (status === 'coming_soon') {
  router.replace(`/app/games/deep-talk/${packSlug}?coming_soon=${levelNumber}`)
  return
}
```

Lalu hapus duplicate `const prog = await getProgress(...)` lebih ke bawah (line ~77, di blok restore progress). Pakai `prog` yang sudah di-fetch di guard:

```ts
// Restore progress (prog sudah di-fetch di URL guard di atas)
if (prog && prog.level_number === levelNumber && !prog.is_completed) {
  setCurrentIndex(prog.current_question_index)
}
```

- [ ] **Step 6.4: Update `useEffect` save logic**

Cari useEffect yang save progress (line 88-94):

```ts
useEffect(() => {
  if (!coupleId || !packId || questions.length === 0 || loading) return
  setSaving(true)
  saveProgress(coupleId, packId, levelNumber, currentIndex, isCompleted)
    .finally(() => setSaving(false))
}, [currentIndex, isCompleted])
```

Ganti menjadi:

```ts
// Save in-progress (saat user scroll antar pertanyaan)
useEffect(() => {
  if (!coupleId || !packId || questions.length === 0 || loading || isCompleted) return
  setSaving(true)
  saveProgress(coupleId, packId, levelNumber, currentIndex, false)
    .finally(() => setSaving(false))
}, [currentIndex])

// Mark level completed saat isCompleted flag jadi true (sekali saja)
useEffect(() => {
  if (!isCompleted || !coupleId || !packId) return

  setSaving(true)
  markLevelCompleted(coupleId, packId, levelNumber, questions.length)
    .then(({ unlockedNext }) => {
      // Next level info untuk celebration
      const next = allLevels.find(l => l.level_number === levelNumber + 1)
      // Show celebration hanya kalau: (1) baru pertama kali completed, (2) ada next level, (3) next level punya konten (bukan coming_soon)
      if (unlockedNext && next && (next.question_count ?? 0) > 0) {
        setNextLevel(next)
        setShowCelebration(true)
      }
    })
    .finally(() => setSaving(false))
}, [isCompleted])
```

- [ ] **Step 6.5: Render UnlockCelebration di JSX**

Cari blok completion screen (mulai `if (isCompleted) {` line 138). Tambah di awal block (sebelum existing return):

```tsx
if (isCompleted) {
  return (
    <>
      {showCelebration && nextLevel && (
        <UnlockCelebration
          levelNumber={nextLevel.level_number}
          levelTitle={nextLevel.title}
          questionCount={nextLevel.question_count ?? 0}
          onDismiss={() => setShowCelebration(false)}
        />
      )}
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center px-8 text-white text-center"
        style={{ background: `linear-gradient(135deg, ${pack.color ?? '#E07A9E'}, ${pack.color ?? '#E07A9E'}99)` }}
      >
        {/* ... existing trophy + heading + buttons (KEEP AS-IS) ... */}
      </div>
    </>
  )
}
```

Pertahankan semua body completion screen yang sudah ada (Trophy icon, "Level X Selesai!", buttons). Cuma bungkus dengan fragment + render UnlockCelebration di atasnya.

- [ ] **Step 6.6: Verifikasi compile**

```bash
npm run build
```

Expected: sukses 0 error.

- [ ] **Step 6.7: Manual UAT — level page**

Jalankan `npm run dev`, login as test couple di mobile viewport.

**Setup test data:** Pakai "Kencan Pertama" (L1 = 15q, L2 = 18q, L3 = 20q — semuanya ada konten).

| # | Skenario | Expected |
|---|---|---|
| 1 | Buka `/app/games/deep-talk/kencan-pertama/1` langsung (L1 unlocked default) | Card pertama tampil normal. |
| 2 | Klik next 14 kali sampai pertanyaan 15/15, lalu klik next sekali lagi | Background `markLevelCompleted` dipanggil. UnlockCelebration overlay muncul 1.8s ("Level Terbuka — Level 2 — Lebih Dalam — 18 pertanyaan baru menanti"). Setelah dismiss/timeout, completion screen Trophy tampil di belakang. |
| 3 | Tap "Kembali ke Deep Talk" di completion screen | Navigasi ke `/app/games/deep-talk`. Buka pack "Kencan Pertama" lagi → L1 ada ✓ check, L2 sekarang unlocked. |
| 4 | Akses URL `/app/games/deep-talk/kencan-pertama/3` langsung (L3 locked, belum complete L2) | Redirect ke `/app/games/deep-talk/kencan-pertama?locked=3` (query param boleh diabaikan UI, atau bisa dipakai untuk auto-show toast — task 7 optional). Tidak crash. |
| 5 | Pakai pack "Masa Depan Kita" (L2 punya 0 question), akses URL `/app/games/deep-talk/masa-depan-kita/2` | Redirect ke pack page dengan `?coming_soon=2`. Tidak crash. |
| 6 | Setelah complete L1 di skenario 2, ulang L1 dengan tap "Main Lagi" di pack page | Saat reach Q15 dan tap next, completion screen muncul **TANPA UnlockCelebration** (karena `unlockedNext = false` — L2 sudah di completed_levels dari sebelumnya). |
| 7 | Complete L3 (max level, no next level setelahnya) | Completion screen muncul TANPA UnlockCelebration (karena `nextLevel` undefined). |

- [ ] **Step 6.8: Commit**

```bash
git add src/app/app/games/deep-talk/[packSlug]/[level]/page.tsx
git commit -m "feat(deep-talk): level page URL guard + completion + celebration

- Adds on-mount URL guard that redirects locked/coming_soon levels
  back to pack page with query param hint
- Replaces saveProgress(isCompleted=true) with markLevelCompleted
  helper that updates completed_levels[] array
- Triggers UnlockCelebration overlay when a new next level is unlocked
  for the first time (not on replay, not on max-level completion,
  not when next level is coming_soon)

Refs: docs/superpowers/specs/2026-05-25-deep-talk-level-unlock-design.md"
```

---

## Task 7: Wire Query Param Hints (Optional Polish)

**Files:**
- Modify: `src/app/app/games/deep-talk/[packSlug]/page.tsx`

Saat user di-redirect dari level page karena akses URL locked/coming_soon, pack page menerima query param `?locked=N` atau `?coming_soon=N`. Tampilkan toast yang sama supaya feedback jelas.

- [ ] **Step 7.1: Tambah useEffect untuk baca query param**

Di pack page, setelah `useEffect(() => { loadData() }, [loadData])` (~line 52), tambahkan:

```ts
import { useSearchParams } from 'next/navigation'
// ...di dalam komponen:
const searchParams = useSearchParams()

useEffect(() => {
  const lockedParam = searchParams.get('locked')
  const comingSoonParam = searchParams.get('coming_soon')
  if (lockedParam) {
    setLockedToast(`Selesaikan Level ${Number(lockedParam) - 1} dulu untuk membuka Level ${lockedParam} ✨`)
  } else if (comingSoonParam) {
    setLockedToast(`Level ${comingSoonParam} masih dalam persiapan, nantikan ya 🌟`)
  }
}, [searchParams])
```

Tambahkan `useSearchParams` ke existing import dari `next/navigation` di line 4.

- [ ] **Step 7.2: Verifikasi compile**

```bash
npm run build
```

Expected: sukses.

- [ ] **Step 7.3: Manual UAT**

| Skenario | Expected |
|---|---|
| Akses URL `/app/games/deep-talk/kencan-pertama/3` saat L2 belum complete | Redirect ke pack page. Toast muncul: "Selesaikan Level 2 dulu untuk membuka Level 3 ✨" |
| Akses URL `/app/games/deep-talk/masa-depan-kita/2` (L2 = 0 questions) | Redirect ke pack page. Toast: "Level 2 masih dalam persiapan, nantikan ya 🌟" |

- [ ] **Step 7.4: Commit**

```bash
git add src/app/app/games/deep-talk/[packSlug]/page.tsx
git commit -m "feat(deep-talk): show toast when redirected from locked URL

Reads ?locked=N and ?coming_soon=N query params (set by level page
URL guard) and shows the inline toast so user gets feedback about
why they were bounced back.

Refs: docs/superpowers/specs/2026-05-25-deep-talk-level-unlock-design.md"
```

---

## Task 8: Backward Compatibility — Old Progress Couples

**Files:**
- (No file changes — verification + manual DB inspection)

Couple yang sudah pernah main sebelum migration mungkin punya state buggy: `level_number = 2, is_completed = false, current_question_index > 0` (sedang main L2 padahal sebelumnya nggak ada gating). Setelah migration backfill, `completed_levels` mereka mungkin `[]` (karena `is_completed = false` tidak match backfill criteria).

Verifikasi: behavior yang masuk akal adalah L1 mereka **harus** dianggap completed kalau mereka sedang main L2+. Tapi ini adalah edge case yang membutuhkan keputusan produk.

- [ ] **Step 8.1: Query DB untuk identify edge cases**

Jalankan di Supabase Studio:

```sql
SELECT couple_id, pack_id, level_number, current_question_index, is_completed, completed_levels
FROM deep_talk_progress
WHERE level_number > 1
  AND is_completed = false
  AND completed_levels = '{}';
```

Catat berapa baris. Kalau 0 → tidak ada edge case, lanjut ke step 8.3.

- [ ] **Step 8.2: (Conditional — jika ada edge case) Jalankan backfill kedua**

Logika: kalau couple sedang play level N (N > 1), implicit assumption mereka sudah lewatin L1..L(N-1).

```sql
UPDATE deep_talk_progress
SET completed_levels = ARRAY(SELECT generate_series(1, level_number - 1))
WHERE level_number > 1
  AND is_completed = false
  AND completed_levels = '{}';
```

Verifikasi ulang dengan query step 8.1 — harus 0 row.

Tambahkan query SQL ini ke `docs/migrations/2026-05-25-deep-talk-completed-levels.sql` sebagai "Backfill Pass 2".

- [ ] **Step 8.3: Manual UAT — old progress couple**

Cari atau buat akun couple yang punya progress lama (atau seed via SQL):

```sql
-- Simulasi: couple ABC pernah main Kencan Pertama, sudah selesai L1, baru mulai L2
INSERT INTO deep_talk_progress (couple_id, pack_id, level_number, current_question_index, completed_levels, is_completed, last_played_at)
VALUES ('<test_couple_id>', '<kencan_pertama_pack_id>', 2, 5, '{1}', false, NOW());
```

Login as couple itu, buka `/app/games/deep-talk/kencan-pertama`:
- L1 → ✓ Selesai (tombol "Main Lagi")
- L2 → unlocked, tombol "Mulai" (resume dari Q5 lewat URL? — Resume otomatis sebenernya cuma berlaku kalau buka level page langsung, pack page selalu mulai dari awal — acceptable)
- L3 → locked + 🔒

- [ ] **Step 8.4: Commit (jika ada perubahan SQL file)**

Kalau step 8.2 ditambahkan ke SQL:

```bash
git add docs/migrations/2026-05-25-deep-talk-completed-levels.sql
git commit -m "fix(deep-talk): backfill pass 2 for in-progress couples

Couples currently playing level N (level_number > 1, is_completed=false)
implicitly completed levels 1..N-1. Adds second backfill UPDATE to
populate their completed_levels array.

Refs: docs/superpowers/specs/2026-05-25-deep-talk-level-unlock-design.md"
```

---

## Task 9: Full Regression UAT

**Files:**
- (No file changes — manual verification)

Pastikan tidak ada fitur lain yang regress.

- [ ] **Step 9.1: Build clean**

```bash
npm run build
```

Expected: 0 error, 0 warning baru dibanding sebelum fitur ini.

- [ ] **Step 9.2: Regression checks dengan dev server**

Login as test couple, lalu visit dan basic-test tiap fitur:

| Fitur | Quick check |
|---|---|
| Home (`/app/home`) | Dashboard load. Deep Talk banner muncul. |
| Games hub (`/app/games`) | 5 game cards muncul (Pet, Sinkronisasi, Obrolan Bareng, Truth or Dare locked, Love Language locked). |
| Samakan (`/app/games/samakan`) | Halaman load tanpa error. |
| Pet (`/app/pet`) | Halaman load. |
| Daily Question | Bisa jawab. |
| Finance (`/app/finance`) | Load. |
| Calendar (`/app/calendar`) | Load. |
| Letters (`/app/letters`) | Load. |
| Admin (`/admin/deep-talk`) | Login as admin role. Pack list load. Bisa edit pertanyaan. |

Spot-check, bukan exhaustive — kalau ada yang break, fix sebelum lanjut.

- [ ] **Step 9.3: Mobile viewport check**

Chrome DevTools → Toggle device toolbar → iPhone SE atau Android Pixel.

| Cek | Expected |
|---|---|
| Pack page kartu level | Tidak overflow horizontal, tombol tap area ≥ 44px |
| UnlockCelebration overlay | Centered, text tidak ke-cut viewport |
| Toast inline | Tidak overlap BottomNav (bottom-24 sudah cukup di-atas BottomNav default) |

- [ ] **Step 9.4: PWA install check (optional)**

Build production: `npm run build && npm start`. Akses dari Chrome desktop, install sebagai PWA. Test sekenario completion + unlock di standalone PWA mode.

- [ ] **Step 9.5: DB final state inspection**

Setelah semua skenario UAT, jalankan di Supabase Studio:

```sql
SELECT
  c.id AS couple_id,
  p.title AS pack_title,
  pr.level_number AS current_level,
  pr.completed_levels,
  pr.is_completed,
  pr.current_question_index,
  pr.last_played_at
FROM deep_talk_progress pr
JOIN deep_talk_packs p ON p.id = pr.pack_id
JOIN couples c ON c.id = pr.couple_id
WHERE c.id = '<test_couple_id>'
ORDER BY p.sort_order, pr.last_played_at DESC;
```

Expected: tiap row punya `completed_levels` array yang konsisten dengan yang diuji secara manual.

---

## Task 10: Production Migration + Deploy

**Files:**
- (No file changes — deployment ops)

- [ ] **Step 10.1: Buat PR**

```bash
git push origin <current-branch>
gh pr create --title "feat(deep-talk): progressive level unlock with celebration" --body "$(cat <<'EOF'
## Summary
- Tambah sistem unlock progresif (L1 → L2 → L3) di Obrolan Bareng
- Refactor lock logic existing yang buggy ke shared helpers di lib/deep-talk
- Tambah UnlockCelebration overlay saat unlock pertama kali
- Tambah 'coming_soon' state untuk level yang belum ada kontennya

## Database migration
**WAJIB DI-RUN DI SUPABASE STUDIO SEBELUM DEPLOY:**
File: `docs/migrations/2026-05-25-deep-talk-completed-levels.sql`

## Test plan
- [ ] Migration dry-run di staging Supabase
- [ ] UAT skenario 1-7 di Task 6.7
- [ ] Regression check di Task 9.2
- [ ] Mobile viewport check di Task 9.3
- [ ] Backward compat couple lama (Task 8.3)

Refs: docs/superpowers/specs/2026-05-25-deep-talk-level-unlock-design.md

🤖 Generated with Claude Code
EOF
)"
```

- [ ] **Step 10.2: Setelah PR approved — jalankan migration di production Supabase**

Buka production Supabase Studio (BUKAN staging) → SQL Editor → paste isi `docs/migrations/2026-05-25-deep-talk-completed-levels.sql` → Run. Jalankan verifikasi query (terakhir di file).

**PENTING:** Migration HARUS dijalankan SEBELUM merge PR, karena code baru expect kolom `completed_levels` ada. Kalau merge dulu tanpa migration → app crash.

- [ ] **Step 10.3: Merge PR**

Setelah migration sukses di production:

```bash
gh pr merge <pr-number> --squash
```

Vercel auto-deploy dari main.

- [ ] **Step 10.4: Smoke test production**

Buka production URL → login → buka `/app/games/deep-talk/kencan-pertama` → cek lock state tampil. Cek 1 user yang punya progress lama tidak regress.

- [ ] **Step 10.5: Rollback plan (jika perlu)**

Kalau ada masalah serius post-deploy:

1. **Code rollback:** Vercel dashboard → Deployments → klik deployment sebelum merge → "Promote to Production".
2. **DB rollback (jika perlu):** Di Supabase Studio:
   ```sql
   ALTER TABLE deep_talk_progress DROP COLUMN completed_levels;
   ```
   Data lain tidak rusak. App versi lama akan jalan normal.

---

## Self-Review Checklist (untuk planner — sudah dilakukan)

**Spec coverage:**
- ✅ Section 1 (Goal & Scope): Out-of-scope items respected — no Level 4, no admin panel changes, no content seeding
- ✅ Section 2 (Data Model): Task 1 (SQL migration) + Task 2 (TS types)
- ✅ Section 3 (UI & Components): Task 4 (UnlockCelebration), Task 5 (pack page refactor)
- ✅ Section 4 (Data Flow): Task 6 (level page completion → markLevelCompleted → celebration)
- ✅ Section 5 (Testing): Task 5.8, 6.7, 7.3, 8.3, 9.2-9.5 cover all 7 UAT scenarios

**Type consistency:**
- `LevelStatus = 'coming_soon' | 'locked' | 'unlocked' | 'completed'` — used consistently in Task 3, 5, 6
- `markLevelCompleted(coupleId, packId, levelNumber, totalQuestions)` signature consistent
- `DeepTalkProgress.completed_levels: number[]` consistent across lib and database types

**Placeholder scan:** No TBD/TODO/placeholder strings found.

**Discovered gaps fixed inline:**
- Pack page sudah punya lock logic lokal — plan now refactors instead of "creates from scratch"
- Project tidak punya `supabase/migrations/` — plan creates `docs/migrations/` instead
- `started_at` field di DB types yang tidak ada di lib interface — preserved in Task 2 update
