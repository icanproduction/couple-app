# Deep Talk Level Unlock — Design Spec

**Date:** 2026-05-25
**Feature:** Sistem unlock progresif untuk level di card game "Obrolan Bareng" (Deep Talk)
**Status:** Approved for planning

---

## 1. Goal & Scope

### Tujuan
Tambahkan sistem progresi "Level Unlock" di card game **Obrolan Bareng** (`/app/games/deep-talk`). Saat ini semua level di tiap pack langsung dapat diakses, yang menghilangkan sense of progression. Setelah fitur ini diterapkan: tiap pack jadi journey berlapis — hanya Level 1 yang terbuka di awal, level berikutnya unlock setelah pasangan menyelesaikan level sebelumnya.

### In scope
- Sistem unlock progresif per-pack (L1 → L2 → L3) berdasarkan penyelesaian semua pertanyaan di level
- Migration kolom `completed_levels int[]` di tabel `deep_talk_progress` + backfill data lama
- UI lock state di pack page (`/app/games/deep-talk/[packSlug]`): grayed-out + icon gembok
- Inline toast saat user tap locked level
- Celebration overlay 1.5s saat unlock terjadi
- Badge "Segera Hadir" untuk level dengan 0 pertanyaan (terlepas dari unlock status)
- Backward compat: couple dengan progress lama tetap berfungsi

### Out of scope
- Tidak menambah Level 4 (tetap 3 level per pack)
- Tidak mengisi konten L2/L3 yang masih kosong di 4 pack (akan diisi via admin panel kapan-kapan)
- Tidak ada perubahan di admin panel
- Tidak ada perubahan di game lain (Samakan, Pet Kita)
- Tidak ada Supabase RLS/RPC tambahan (client-side gate cukup untuk app couple cooperative)

---

## 2. Arsitektur & Data Model

### Database migration

```sql
ALTER TABLE deep_talk_progress
  ADD COLUMN completed_levels int[] NOT NULL DEFAULT '{}';

-- Backfill: couple yang sudah is_completed = true otomatis dianggap selesai sampai level_number saat ini
UPDATE deep_talk_progress
SET completed_levels = ARRAY(SELECT generate_series(1, level_number))
WHERE is_completed = true AND completed_levels = '{}';
```

Migration additive — RLS yang sudah ada (per couple_members) tetap berlaku. Rollback aman: `ALTER TABLE deep_talk_progress DROP COLUMN completed_levels`.

### TypeScript interface update

Di `src/lib/deep-talk.ts`:

```ts
export interface DeepTalkProgress {
  id: string
  couple_id: string
  pack_id: string
  level_number: number              // tetap: level aktif/last-played
  current_question_index: number    // tetap
  completed_levels: number[]        // BARU: [1], [1,2], [1,2,3]
  is_completed: boolean | null
  last_played_at: string | null
}
```

Juga update `src/types/database.ts` (Supabase generated types) — `Row`, `Insert`, dan `Update` di `deep_talk_progress`.

### Aturan unlock — helper functions

Single source of truth di `src/lib/deep-talk.ts`:

```ts
export type LevelStatus = 'coming_soon' | 'locked' | 'unlocked' | 'completed'

export function isLevelUnlocked(levelNumber: number, completedLevels: number[]): boolean {
  if (levelNumber === 1) return true
  return completedLevels.includes(levelNumber - 1)
}

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

Edge case priority: `coming_soon` (0 pertanyaan) selalu menang atas lock state. Level tanpa konten tidak pernah jadi lockable atau completable.

### Penegakan
- **Pack page:** render kartu sesuai `getLevelStatus`. Locked + coming_soon tidak clickable.
- **Level page:** on-mount cek status. Locked atau coming_soon → `router.replace(packPage)` + toast.
- **Tidak ada server-side enforcement** — keputusan sadar untuk app couple yang cooperative, bukan adversarial.

---

## 3. UI & Components

### File yang berubah

| File | Perubahan |
|---|---|
| `src/lib/deep-talk.ts` | Tambah `isLevelUnlocked`, `getLevelStatus`, `markLevelCompleted` helpers. Update `DeepTalkProgress` interface. |
| `src/app/app/games/deep-talk/[packSlug]/page.tsx` | Render kartu level dengan 4 state visual: `coming_soon`, `locked`, `unlocked`, `completed`. |
| `src/app/app/games/deep-talk/[packSlug]/[level]/page.tsx` | (1) Guard on mount — redirect jika locked/coming_soon. (2) Saat pertanyaan terakhir selesai → trigger celebration + mark complete. |
| `src/components/app/UnlockCelebration.tsx` | **Baru.** Overlay full-screen yang muncul 1.5s saat level unlock. |
| `src/types/database.ts` | Tambah `completed_levels: number[]` di `deep_talk_progress.Row/Insert/Update`. |

### Visual states (kartu level di pack page)

```
┌──────────────────────────────────┐
│ ① Pemanasan         ✓ Selesai     │  ← completed (rose tint, check)
│   15 pertanyaan                   │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ ② Lebih Dalam         ▶            │  ← unlocked (tile penuh, hover effect)
│   18 pertanyaan                   │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ ③ Jujur Sepenuhnya   🔒            │  ← locked (grayed, opacity-50, tap → toast)
│   20 pertanyaan                   │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ ② Lebih Dalam     Segera Hadir   │  ← coming_soon (badge amber, tidak tap-able)
│   Belum ada pertanyaan            │
└──────────────────────────────────┘
```

Pakai design system existing: `bg-rose/5`, `border-border`, `text-ink-muted`, `shadow-card`. Locked tile pakai `opacity-50 grayscale` + `cursor-not-allowed`. Coming soon pakai badge amber (`bg-amber-50 text-amber-700`). Tap locked → toast inline 2 detik di bawah pack header: *"Selesaikan Level X dulu untuk membuka ini ✨"*.

### UnlockCelebration component

```
Overlay backdrop-blur, fade-in 200ms.
Center stack:
  – Lingkaran rose pulse animation (h-24 w-24, scale 1→1.1→1)
  – Lucide <Sparkles /> putih besar
  – Text "Level 2 Terbuka!" (text-xl font-bold)
  – Subtext "Lebih Dalam — 18 pertanyaan baru"
Auto-dismiss 1.5s → fade-out → onDismiss()
```

Props: `levelNumber: number`, `levelTitle: string`, `questionCount: number`, `onDismiss: () => void`.

Tidak butuh library confetti — cukup CSS keyframes pulse + animate-fade-in yang sudah ada di tailwind config.

### Flow user di level page (saat pertanyaan terakhir)

User tap "Pertanyaan Berikutnya" di Q terakhir → cek `currentIndex === questions.length - 1` → call `markLevelCompleted(coupleId, packId, levelNumber, totalQuestions)` → kalau ada next level yang sebelumnya locked (unlockedNext = true) → set state `showCelebration = true`. Halaman level tetap render di belakang (backdrop blur), no race condition.

---

## 4. Data Flow & Error Handling

### Happy path — finish last question

```
User tap "Pertanyaan Berikutnya" di Q terakhir
  │
  ├─ optimistic UI: showCelebration = true
  │
  └─ async:
       └─ markLevelCompleted() upsert ke deep_talk_progress

Celebration overlay 1.5s
  │
  └─ onDismiss → router.replace('/app/games/deep-talk/[packSlug]')
       Pack page re-fetch progress → tampilan L+1 sudah unlocked
```

### Helper: markLevelCompleted

Di `src/lib/deep-talk.ts`:

```ts
export async function markLevelCompleted(
  coupleId: string,
  packId: string,
  levelNumber: number,
  totalQuestions: number
): Promise<{ unlockedNext: boolean }> {
  const supabase = createClient()
  const existing = await getProgress(coupleId, packId)
  const completed = new Set(existing?.completed_levels ?? [])
  const wasNew = !completed.has(levelNumber)
  completed.add(levelNumber)

  await supabase.from('deep_talk_progress').upsert({
    couple_id: coupleId,
    pack_id: packId,
    level_number: levelNumber,
    current_question_index: totalQuestions,
    completed_levels: Array.from(completed).sort((a, b) => a - b),
    is_completed: existing?.is_completed ?? false,
    last_played_at: new Date().toISOString(),
  }, { onConflict: 'couple_id,pack_id' })

  return { unlockedNext: wasNew }
}
```

`unlockedNext = true` hanya jika level baru pertama kali diselesaikan. Replay level completed = tidak ada celebration spam.

### Edge cases

| Skenario | Behavior |
|---|---|
| User akses `/deep-talk/[pack]/3` langsung (URL) padahal L2 belum done | On-mount: load progress, kalau `getLevelStatus !== 'unlocked' && !== 'completed'` → `router.replace(pack)` + toast `Level masih terkunci` |
| User offline saat finish Q terakhir | Upsert error → catch → tetap show celebration (optimistic), tapi tampilkan toast small `Akan disinkronkan saat online`. Pas pack page reload, sync ulang dari local state ke DB. Risiko: kalau user close app sebelum online, harus selesaikan ulang. Acceptable. |
| Couple lama dengan `is_completed: true` tapi `completed_levels: []` | Backfill SQL (section 2) men-set `completed_levels = [1..level_number]`. Idempotent. |
| Pack baru pertama kali dimainkan, belum ada row di `deep_talk_progress` | `getProgress` return null → treat sebagai `completed_levels: []` → L1 unlocked, L2/L3 locked. Saat finish L1 pertama kali → upsert otomatis insert. |
| Race: 2 partner tap "Pertanyaan terakhir" hampir bersamaan | Upsert dengan `onConflict: 'couple_id,pack_id'` → last-write-wins. Helper re-fetch existing dulu sebelum merge `completed_levels`. Worst case: 1 partner lihat celebration, lainnya tidak — pack page reload akan sama. |
| Network gagal upsert + tidak bisa fetch existing | `markLevelCompleted` throw → catch di level page → tetap show celebration + toast error. State lokal: `completed_levels` belum ke-update. Next session user re-do level itu. Tidak rusak data. |
| Level dengan 0 pertanyaan (4 pack saat ini) | `getLevelStatus` return `'coming_soon'` SEBELUM cek lock state → tidak pernah jadi locked/unlocked. Tap → no-op. Tidak pernah bisa di-complete. Tidak block lock state level lain. |

### Loading states

- Pack page: spinner kecil di tengah saat fetch `getPacksWithProgress` (sudah ada).
- Level page: spinner saat load questions (sudah ada).
- Celebration: optimistic, tidak nunggu DB sukses → user nggak ngerasain delay.

---

## 5. Testing & Verification

Project belum punya test suite (no `jest`/`vitest` di package.json). Verifikasi via **manual UAT di dev environment + DB inspection**.

### Pre-deploy checklist

#### 1. Migration dry-run di Supabase Studio

- Jalankan `ALTER TABLE` + `UPDATE` backfill di staging dulu.
- Verifikasi: `SELECT couple_id, pack_id, level_number, completed_levels, is_completed FROM deep_talk_progress` — semua row punya `completed_levels` non-NULL.
- Untuk row `is_completed = true`, `completed_levels` harus berisi `[1..level_number]`.
- Verifikasi RLS masih jalan: query sebagai user A tidak boleh lihat data couple B.

#### 2. TypeScript compile clean

- `npm run build` → 0 error.
- Cek `src/types/database.ts` aligned dengan kolom baru.
- Import `DeepTalkProgress` di seluruh repo nggak break.

#### 3. Dev server manual UAT (`npm run dev`)

| # | Skenario | Expected |
|---|---|---|
| 1 | Login couple baru, buka `/app/games/deep-talk/kencan-pertama` | L1 unlocked (clickable), L2 + L3 grayed-out + 🔒 |
| 2 | Tap locked L2 di skenario 1 | Toast inline 2 detik: "Selesaikan Level 1 dulu untuk membuka ini ✨" |
| 3 | Buka L1, jawab semua 15 pertanyaan sampai habis | Celebration overlay 1.5s "Level 2 Terbuka!" → redirect ke pack page → L2 sekarang unlocked, L1 ada checkmark "Selesai" |
| 4 | Ulangi L1 (sudah completed) | Tidak ada celebration saat finish. Replay silent. |
| 5 | Akses URL `/app/games/deep-talk/masa-depan-kita/3` langsung tanpa selesaikan L1 dulu | Redirect ke `/app/games/deep-talk/masa-depan-kita` + toast "Level masih terkunci" |
| 6 | Buka pack "Masa Depan Kita" (L1 only ada konten, L2/L3 kosong) | L1 unlocked. L2 + L3 tampil dengan badge **"Segera Hadir"** (amber), tidak tap-able. Kalau L1 selesai, L2 TIDAK berubah jadi unlocked (tetap "Segera Hadir"). |
| 7 | Login couple lama (progress `is_completed: true, level 2`) | Backfill SQL sudah set `completed_levels: [1, 2]`. Pack page tampil: L1 ✓, L2 ✓, L3 unlocked. Tidak ada celebration retroactive. |

#### 4. DB inspection setelah skenario 3

```sql
SELECT completed_levels, current_question_index, is_completed
FROM deep_talk_progress
WHERE couple_id = '<test>' AND pack_id = '<kencan-pertama>';
```

Expected: `completed_levels = '{1}'`, `current_question_index = 15`, `is_completed = false`.

#### 5. Regression checks (TIDAK boleh berubah)

- Samakan, Pet Kita, Daily Question, Finance, Calendar, Letters semua jalan normal.
- Existing Deep Talk progress row tidak corrupted.
- Admin panel `/admin/deep-talk` masih bisa edit pack/level/question seperti biasa.

#### 6. PWA & mobile

Test di mobile browser (Chrome Android / Safari iOS) — celebration overlay nggak ke-cut viewport, locked tile tap area cukup besar (min-h-14).

### Rollback plan

- Migration additive (`ADD COLUMN` + `UPDATE`). Rollback aman: `ALTER TABLE deep_talk_progress DROP COLUMN completed_levels`.
- Tidak ada data loss — kolom lama tidak berubah.
- Kalau bug post-deploy: revert commit di Vercel (rollback ke deployment sebelumnya). DB column tetap, tidak dipakai.

---

## Decisions Log

| Pertanyaan | Keputusan |
|---|---|
| Apakah ini fitur baru atau modifikasi existing? | Modifikasi existing "Obrolan Bareng" (Deep Talk). Tidak ada game baru. |
| Struktur unlock? | Per-pack progression. L1 default unlocked, L2 → L1 done, L3 → L2 done. |
| Total level? | 3 level per pack (sesuai DB existing). "Sampai lvl 4" adalah misphrasing dari user. |
| Trigger unlock? | Selesai semua pertanyaan di level itu. Tidak ada cooldown atau threshold persentase. |
| UI lock state? | Tampil grayed-out + icon gembok (visible progression). |
| Data model? | Tambah kolom `completed_levels int[]` di `deep_talk_progress`. |
| Pendekatan enforcement? | Client-side gate (App couple cooperative — tidak butuh RLS/RPC). |
| Empty levels (0 pertanyaan)? | Badge "Segera Hadir" — visible tapi tidak playable. |
| Celebration? | Overlay full-screen 1.5s saat unlock pertama kali (tidak pada replay). |
