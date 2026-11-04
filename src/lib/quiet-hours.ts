// Quiet hours ("Jam tenang") for push notifications. Import-free so it runs
// on the server, in the browser and in node verify scripts alike.

/** Hour 0–23 in Asia/Jakarta. */
export function jakartaHour(now: Date = new Date()): number {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hourCycle: 'h23' }).format(now))
  return h === 24 ? 0 : h
}

/**
 * Quiet from `start` up to (not including) `end`, Jakarta time.
 * start > end wraps past midnight (22 → 6 is quiet 22.00–05.59).
 * Missing or equal hours mean no quiet hours.
 */
export function inQuietHours(start: number | null, end: number | null, now: Date = new Date()): boolean {
  if (start === null || end === null || start === end) return false
  const h = jakartaHour(now)
  return start < end ? h >= start && h < end : h >= start || h < end
}

/** Kinds with an on/off switch in notification_prefs. */
const SWITCH_KINDS = ['kangen', 'letters', 'moments', 'reminders', 'activity', 'games', 'pet'] as const

export interface MutePrefs {
  kangen: boolean
  letters: boolean
  moments: boolean
  reminders: boolean
  activity: boolean
  /** Game invites and results. Optional: a row read without the column counts as on. */
  games?: boolean
  /** Pet Kita (adoption, Monday note). Optional: a row read without the column counts as on. */
  pet?: boolean
  quiet_start: number | null
  quiet_end: number | null
}

/**
 * Should a push of `kind` be held back for someone with these prefs?
 * - The per-kind switch always wins ('admin' has no switch).
 * - Quiet hours hold everything back, unless `ignoreQuietHours` — used by the
 *   once-a-day cron pushes, which have no later run to deliver them.
 * No prefs row means everything on, no quiet hours.
 */
export function isPushMuted(
  prefs: MutePrefs | null,
  kind: string | undefined,
  options: { ignoreQuietHours?: boolean } = {},
  now: Date = new Date(),
): boolean {
  if (!prefs) return false
  const switchKey = SWITCH_KINDS.find((k) => k === kind)
  if (switchKey && prefs[switchKey] === false) return true
  if (options.ignoreQuietHours) return false
  return inQuietHours(prefs.quiet_start, prefs.quiet_end, now)
}

/** "22:00": how hours are written in the app (24-hour, en-GB style). */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}
