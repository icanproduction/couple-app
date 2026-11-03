import type { RelationshipLevel } from '@/types/app'

// Parse "YYYY-MM-DD" as local midnight to avoid UTC-offset shifting
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const JAKARTA_TZ = 'Asia/Jakarta'
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Today's date in Jakarta as "YYYY-MM-DD". Use this instead of
 * `new Date().toISOString().split('T')[0]` (UTC — still yesterday before
 * 07:00 WIB) or local-clock math (UTC on the Vercel server).
 */
export function todayJakarta(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JAKARTA_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

/** Month key "YYYY-MM" in Jakarta time */
export function monthKeyJakarta(now: Date = new Date()): string {
  return todayJakarta(now).slice(0, 7)
}

function dateKeyToUTC(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function utcToDateKey(ms: number): string {
  return new Date(ms).toISOString().split('T')[0]
}

/** Whole days from date key `from` to date key `to` — timezone independent */
function dayDiff(from: string, to: string): number {
  return Math.round((dateKeyToUTC(to) - dateKeyToUTC(from)) / DAY_MS)
}

/** Number of full days between a past date and today (Jakarta) */
export function daysSince(dateStr: string): number {
  return dayDiff(dateStr, todayJakarta())
}

/** Number of days until a future date (returns 0 if today, negative if past) */
export function daysUntil(dateStr: string): number {
  return dayDiff(todayJakarta(), dateStr)
}

/** Format a date string to Indonesian locale: "22 Maret 2026" */
export function formatDateID(dateStr: string): string {
  const date = parseLocalDate(dateStr)
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Format a date string to short Indonesian: "22 Mar" */
export function formatDateShortID(dateStr: string): string {
  const date = parseLocalDate(dateStr)
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Get the next occurrence of a recurring annual event.
 * If the event date this year is in the past, return next year's date.
 */
export function getNextOccurrence(eventDateStr: string): string {
  const [, monthStr, dayStr] = eventDateStr.split('-')
  const month = parseInt(monthStr, 10) - 1
  const day = parseInt(dayStr, 10)
  const today = todayJakarta()
  // A recurring event that hasn't happened yet for the first time.
  if (eventDateStr >= today) return eventDateStr
  const year = Number(today.slice(0, 4))

  // Date.UTC rolls Feb 29 over to Mar 1 in non-leap years, like before.
  const thisYear = utcToDateKey(Date.UTC(year, month, day))
  if (thisYear >= today) return thisYear
  return utcToDateKey(Date.UTC(year + 1, month, day))
}

/**
 * Couple relationship level based on days together.
 * Benih: 0–90d | Tumbuh: 91–365d | Mekar: 366–730d | Abadi: 731d+
 */
export function getRelationshipLevel(days: number): RelationshipLevel {
  if (days >= 731) return 'Abadi'
  if (days >= 366) return 'Mekar'
  if (days >= 91) return 'Tumbuh'
  return 'Benih'
}

/** Human-readable countdown label in Indonesian */
export function countdownLabel(days: number): string {
  if (days === 0) return 'Hari ini'
  if (days === 1) return 'Besok'
  if (days < 0) return `${Math.abs(days)} hari lalu`
  return `${days} hari lagi`
}

/** Return the ISO first-of-month string for a given date: "YYYY-MM-01" */
export function toMonthKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}
