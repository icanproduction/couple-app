import { createClient } from './supabase'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false
  const left = new Uint8Array(a)
  return left.length === b.length && left.every((v, i) => v === b[i])
}

export async function isPushSupported(): Promise<boolean> {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  return Notification.permission
}

/** The active registration, or null — never waits forever like `serviceWorker.ready`. */
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

/** How long to wait for a service worker that is still installing. */
const READY_TIMEOUT_MS = 5000

/**
 * The registration, waiting up to 5 s for one that is still installing.
 * `serviceWorker.ready` never settles when registration failed, so it is
 * raced against a timeout: null means "no service worker", and the caller
 * shows an error instead of a toggle that spins forever.
 */
async function waitForRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await getRegistration()
  if (existing) return existing
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), READY_TIMEOUT_MS) })
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export async function requestPushSubscription(): Promise<PushSubscription | null> {
  if (!(await isPushSupported()) || !VAPID_PUBLIC_KEY) return null

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const registration = await waitForRegistration()
  if (!registration) return null
  const serverKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)

  let subscription = await registration.pushManager.getSubscription()
  // A subscription made with an older VAPID key is rejected (403) by the push
  // service forever — replace it.
  if (subscription && !sameKey(subscription.options.applicationServerKey, serverKey)) {
    await subscription.unsubscribe()
    subscription = null
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: serverKey.buffer as ArrayBuffer,
    })
  }

  return subscription
}

export async function savePushSubscription(subscription: PushSubscription): Promise<boolean> {
  const json = subscription.toJSON()
  const keys = json.keys as { p256dh: string; auth: string } | undefined
  if (!json.endpoint || !keys?.p256dh || !keys?.auth) return false

  // RPC: an endpoint belongs to whoever is signed in on this browser now.
  const { error } = await createClient().rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: keys.p256dh,
    p_auth_key: keys.auth,
  })
  return !error
}

export async function removePushSubscription(): Promise<void> {
  const registration = await getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return

  const endpoint = subscription.endpoint
  await subscription.unsubscribe().catch(() => false)
  await createClient().from('push_subscriptions').delete().eq('endpoint', endpoint)
}

/** Full flow: request permission → subscribe → store in DB */
export async function enablePushNotifications(): Promise<boolean> {
  try {
    const subscription = await requestPushSubscription()
    if (!subscription) return false
    return await savePushSubscription(subscription)
  } catch {
    return false
  }
}
