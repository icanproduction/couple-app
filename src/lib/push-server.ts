// Server-only Web Push sending. Never import from a client component.
import webpush from 'web-push'
import { createServiceRoleClient } from './supabase-server'
import { inQuietHours, isPushMuted } from './quiet-hours'

export interface PushPayload {
  title: string
  body: string
  url: string
}

export interface PushResult {
  sent: number
  failed: number
  stale: number
  /** Not sent because the recipient switched this kind off or is in quiet hours */
  muted?: boolean
}

/**
 * What a notification is about; each maps to a switch in notification_prefs
 * (/app/profile/notifikasi). 'admin' broadcasts ignore the switches but still
 * respect quiet hours.
 */
export type PushKind = 'kangen' | 'letters' | 'moments' | 'reminders' | 'activity' | 'admin'
export const PUSH_KINDS: readonly PushKind[] = ['kangen', 'letters', 'moments', 'reminders', 'activity', 'admin']

export function isPushKind(value: unknown): value is PushKind {
  return typeof value === 'string' && (PUSH_KINDS as readonly string[]).includes(value)
}

// Quiet-hours math lives in an import-free module so it can be unit-tested.
export { inQuietHours }

export interface SendOptions {
  /**
   * Deliver even during the recipient's quiet hours (the per-kind switch still
   * applies). For pushes that are sent exactly once and never retried — the
   * daily cron jobs — where "held back" would really mean "lost".
   */
  ignoreQuietHours?: boolean
}

async function isMuted(profileId: string, kind: PushKind | undefined, options: SendOptions): Promise<boolean> {
  const admin = createServiceRoleClient()
  const { data: prefs, error } = await admin
    .from('notification_prefs')
    .select('kangen, letters, moments, reminders, activity, quiet_start, quiet_end')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) {
    // Fail open: a lookup error must not swallow a Kangen.
    console.error('[push] prefs lookup failed:', error.message)
    return false
  }
  return isPushMuted(prefs, kind, options)
}

let vapidReady: boolean | null = null

function ensureVapid(): boolean {
  if (vapidReady !== null) return vapidReady
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) {
    vapidReady = false
    return false
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@coupleapp.id', publicKey, privateKey)
  vapidReady = true
  return true
}

/** Only same-app paths: "/app/home" yes, "//evil.com" or "https://…" no. */
export function isSafeAppPath(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\') && url.length <= 300
}

/**
 * Sends to every device of one profile and prunes subscriptions the push
 * service reports as gone (404/410). Other failures are logged, not thrown.
 * Skipped (muted: true) when the recipient turned `kind` off or is in quiet
 * hours (unless `options.ignoreQuietHours`).
 */
export async function sendPushToProfile(
  profileId: string,
  payload: PushPayload,
  kind?: PushKind,
  options: SendOptions = {},
): Promise<PushResult | null> {
  if (!ensureVapid()) return null
  if (await isMuted(profileId, kind, options)) return { sent: 0, failed: 0, stale: 0, muted: true }

  const admin = createServiceRoleClient()
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')
    .eq('profile_id', profileId)
  if (error) {
    console.error('[push] subscription lookup failed:', error.message)
    return { sent: 0, failed: 0, stale: 0 }
  }

  const body = JSON.stringify(payload)
  const stale: string[] = []
  let sent = 0
  let failed = 0

  await Promise.allSettled(
    (subs ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          body,
          { TTL: 60 * 60 * 24 }
        )
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) {
          stale.push(sub.endpoint)
        } else {
          failed++
          // 403 here usually means the VAPID key pair changed since subscribing.
          console.error('[push] send failed:', status ?? err)
        }
      }
    })
  )

  if (stale.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', stale)
  }
  return { sent, failed, stale: stale.length }
}
