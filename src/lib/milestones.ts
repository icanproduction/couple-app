// Relationship milestones (F20, also used by the timeline F22). Pure and
// import-free so scripts/verify can load it with plain node.
//
// "N hari" matches the home counter: day N is reached when daysSince(start)
// equals N, i.e. start + N days. Year milestones fall on the calendar
// anniversary; a 29 Feb start rolls to 1 Mar in common years, the same rule
// as the calendar and the reminder cron (Date.UTC overflow).

export interface Milestone {
  /** Stable key, e.g. "d100" or "y2" */
  key: string
  kind: 'days' | 'years'
  /** Days after the start date */
  days: number
  /** "YYYY-MM-DD" */
  date: string
  label: string
  /** Short line for cards */
  caption: string
}

const DAY_MS = 86_400_000
const DAY_MARKS = [7, 30, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]

function toUTC(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function toKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function diffDays(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS)
}

function anniversary(start: string, years: number): string {
  const [y, m, d] = start.split('-').map(Number)
  return toKey(Date.UTC(y + years, m - 1, d))
}

function dayCaption(days: number): string {
  if (days === 7) return 'Seminggu pertama'
  if (days === 30) return 'Sebulan bareng'
  if (days === 1000) return 'Seribu hari!'
  return `${days.toLocaleString('id-ID')} hari bareng`
}

/**
 * Every milestone from the start date up to `untilYears` years later, sorted
 * by date. Day marks: 7, 30, every 100 up to 1000, then every 500 (1500, 2000…).
 */
export function milestonesFor(startDate: string, untilYears = 10): Milestone[] {
  const out: Milestone[] = []
  const end = anniversary(startDate, untilYears)
  const horizon = diffDays(startDate, end)

  const marks = [...DAY_MARKS]
  for (let d = 1500; d <= horizon; d += 500) marks.push(d)
  for (const days of marks) {
    if (days > horizon) break
    out.push({
      key: `d${days}`,
      kind: 'days',
      days,
      date: toKey(toUTC(startDate) + days * DAY_MS),
      label: `${days.toLocaleString('id-ID')} hari`,
      caption: dayCaption(days),
    })
  }

  for (let y = 1; y <= untilYears; y++) {
    const date = anniversary(startDate, y)
    out.push({
      key: `y${y}`,
      kind: 'years',
      days: diffDays(startDate, date),
      date,
      label: `${y} tahun`,
      caption: y === 1 ? 'Anniversary pertama' : `Anniversary ke-${y}`,
    })
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'years' ? -1 : 1))
}

export interface MilestoneStatus {
  passed: Milestone[]
  /** The next milestone on or after today, with days left (0 = today) */
  next: (Milestone & { daysLeft: number }) | null
}

/** Split milestones around `today` ("YYYY-MM-DD", Jakarta). */
export function milestoneStatus(startDate: string, today: string, untilYears = 10): MilestoneStatus {
  const all = milestonesFor(startDate, Math.max(untilYears, Math.ceil(diffDays(startDate, today) / 365) + 2))
  const passed = all.filter((m) => m.date < today)
  const upcoming = all.find((m) => m.date >= today)
  return {
    passed,
    next: upcoming ? { ...upcoming, daysLeft: diffDays(today, upcoming.date) } : null,
  }
}
