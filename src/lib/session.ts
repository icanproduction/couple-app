import { createClient } from './supabase'
import { removePushSubscription } from './notifications'

/**
 * Sign out and leave nothing of this user on the device: their push
 * subscription (so the next person doesn't get their notifications) and the
 * service-worker caches (so cached pages can't show their data).
 */
export async function signOutCompletely(): Promise<void> {
  await removePushSubscription().catch(() => undefined)
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    // Cache API unavailable (private mode) — nothing cached to clear.
  }
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()
  // Offline or the server rejected the revoke: still drop the local session so
  // this device is signed out.
  if (error) await supabase.auth.signOut({ scope: 'local' })
}
