// Arsip jawaban harian (F19): past daily questions with both answers, plus
// past AI questions (their answers aren't stored, so they're listed as
// prompts). Pure and runtime-import-free: callers pass the question list and
// today's Jakarta date, and scripts/verify can load it with plain node.
//
// RLS on daily_responses returns the partner's row only for dates I answered
// too, so "partner didn't answer" and "I can't see it yet" look the same.

export interface DailyResponseRow {
  answered_date: string
  profile_id: string
  question_index: number
  answer: string
}

export interface AiQuestionRow {
  question_date: string
  question: string | null
}

export interface DailyArchiveEntry {
  type: 'daily'
  date: string
  questionIndex: number
  question: string
  mine: string
  partner: string | null
}

export interface AiArchiveEntry {
  type: 'ai'
  date: string
  question: string
}

export type ArchiveEntry = DailyArchiveEntry | AiArchiveEntry

export interface ArchiveMonth {
  /** "YYYY-MM" */
  key: string
  label: string
  entries: ArchiveEntry[]
}

/** "YYYY-MM-DD" shifted by whole days (timezone independent) */
function shiftDate(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * Consecutive Jakarta days where BOTH partners answered, counting back from
 * today. Today doesn't break the streak while it's still incomplete (same rule
 * as the home card).
 */
export function computeStreak(rows: Pick<DailyResponseRow, 'answered_date' | 'profile_id'>[], today: string): number {
  const byDate = new Map<string, Set<string>>()
  for (const r of rows) {
    const set = byDate.get(r.answered_date) ?? new Set<string>()
    set.add(r.profile_id)
    byDate.set(r.answered_date, set)
  }
  let count = 0
  for (let i = 0; ; i++) {
    const answerers = byDate.get(shiftDate(today, -i))
    if (answerers && answerers.size >= 2) count++
    else if (i === 0) continue
    else break
  }
  return count
}

/** One entry per date I answered, newest first */
export function buildDailyEntries(
  rows: DailyResponseRow[],
  myId: string,
  questionText: (index: number) => string | undefined
): DailyArchiveEntry[] {
  const mine = rows.filter((r) => r.profile_id === myId)
  const partnerByDate = new Map<string, string>()
  for (const r of rows) if (r.profile_id !== myId) partnerByDate.set(r.answered_date, r.answer)
  return mine
    .map((r) => ({
      type: 'daily' as const,
      date: r.answered_date,
      questionIndex: r.question_index,
      question: questionText(r.question_index) ?? `Pertanyaan #${r.question_index + 1}`,
      mine: r.answer,
      partner: partnerByDate.get(r.answered_date) ?? null,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Generated AI questions up to and including `today`, newest first */
export function buildAiEntries(rows: AiQuestionRow[], today: string): AiArchiveEntry[] {
  return rows
    .filter((r): r is AiQuestionRow & { question: string } => !!r.question?.trim() && r.question_date <= today)
    .map((r) => ({ type: 'ai' as const, date: r.question_date, question: r.question }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Case-insensitive match on the question and both answers */
export function matchesQuery(entry: ArchiveEntry, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = entry.type === 'daily'
    ? [entry.question, entry.mine, entry.partner ?? '']
    : [entry.question]
  return haystack.some((s) => s.toLowerCase().includes(q))
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Newest month first; within a month newest date first, the daily answer before the AI prompt */
export function groupByMonth(entries: ArchiveEntry[]): ArchiveMonth[] {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date) || (a.type === 'daily' ? -1 : 1))
  const months: ArchiveMonth[] = []
  for (const e of sorted) {
    const key = e.date.slice(0, 7)
    const last = months[months.length - 1]
    if (last?.key === key) last.entries.push(e)
    else months.push({ key, label: monthLabel(key), entries: [e] })
  }
  return months
}
