// Browser-only picture helpers for the bucket list page: shrinking a picked
// photo, uploading it with progress, and signed URLs with a small cache.
// The storage rules and the save order live in src/lib/bucket.ts.
import { createClient } from '@/lib/supabase'
import { compressImage } from '@/lib/image'
import { BUCKET_PICTURES, BUCKET_PICTURE_MAX_BYTES, signBucketPictures, type PictureUpload } from '@/lib/bucket'

/** Bigger originals are refused before decoding (a 50 MB file can crash a phone tab). */
const MAX_SOURCE_BYTES = 40 * 1024 * 1024
/** An upload with no progress for this long is treated as dead. */
const STALL_MS = 30_000
/** A cached signed URL is reused only with at least this much life left. */
const REUSE_MARGIN_MS = 15 * 60 * 1000

export type PictureProblem = 'offline' | 'network' | 'stalled' | 'too-big' | 'format' | 'denied' | 'failed'

const MESSAGES: Record<PictureProblem, string> = {
  offline: 'You\'re offline. Connect to the internet and try again.',
  network: 'The upload stopped. Check your connection and try again.',
  stalled: 'The upload stalled on a slow connection. Try again, or save without the picture.',
  'too-big': 'That picture is too big. Try a smaller one.',
  format: 'This picture format isn\'t supported. Try a JPG or PNG.',
  denied: 'Couldn\'t upload the picture. Refresh the page and try again.',
  failed: 'Couldn\'t upload the picture. Try again.',
}

/** An upload or prepare failure with a message that is safe to show. */
export class PictureError extends Error {
  readonly problem: PictureProblem
  constructor(problem: PictureProblem, message?: string) {
    super(message ?? MESSAGES[problem])
    this.name = 'PictureError'
    this.problem = problem
  }
}

export interface PreparedPicture {
  blob: Blob
  /** Object URL of the shrunk picture, for the form preview. Revoke it when done. */
  preview: string
}

/** Shrinks a picked photo to 1600px JPEG (like Moments). Throws PictureError. */
export async function preparePicture(file: File): Promise<PreparedPicture> {
  if (file.type && !file.type.startsWith('image/')) throw new PictureError('format', 'Pick a photo or picture file.')
  if (file.size > MAX_SOURCE_BYTES) throw new PictureError('too-big', 'That picture is too big. Pick one under 40 MB.')
  let blob: Blob
  try {
    blob = (await compressImage(file)).blob
  } catch (e) {
    // compressImage already words its errors for people
    throw new PictureError('format', e instanceof Error ? e.message : undefined)
  }
  if (blob.size > BUCKET_PICTURE_MAX_BYTES) throw new PictureError('too-big')
  return { blob, preview: URL.createObjectURL(blob) }
}

function problemFromResponse(status: number, body: string): PictureProblem {
  let text = body
  try {
    const parsed = JSON.parse(body) as { statusCode?: string | number; error?: string; message?: string }
    text = `${parsed.statusCode ?? ''} ${parsed.error ?? ''} ${parsed.message ?? ''}`
  } catch {
    // not JSON, keep the raw text
  }
  if (status === 413 || /\b413\b|too large|maximum allowed size/i.test(text)) return 'too-big'
  if (status === 415 || /mime|content type/i.test(text)) return 'format'
  if (status === 401 || status === 403 || /row-level security|unauthori[sz]ed|jwt|\b40[13]\b/i.test(text)) return 'denied'
  return 'failed'
}

/**
 * Uploads straight to Storage with XMLHttpRequest so the form can show real
 * progress (supabase-js has no progress events). It sends the same request
 * supabase-js sends for a Blob (multipart body with a cacheControl field,
 * x-upsert false), so CORS and the bucket's type check behave the same.
 * `onProgress` gets 0..1. A connection that stops moving for 30 s is dropped.
 */
export function uploadWithProgress(onProgress: (fraction: number) => void): PictureUpload {
  return async (path, blob) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new PictureError('offline')
    const { data: { session } } = await createClient().auth.getSession()
    if (!session) throw new PictureError('denied')

    const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET_PICTURES}/${path}`
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      let stalled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const arm = () => {
        clearTimeout(timer)
        timer = setTimeout(() => { stalled = true; xhr.abort() }, STALL_MS)
      }
      xhr.open('POST', endpoint)
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
      xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '')
      xhr.setRequestHeader('x-upsert', 'false')
      const body = new FormData()
      body.append('cacheControl', '3600')
      body.append('', blob.type === 'image/jpeg' ? blob : new Blob([blob], { type: 'image/jpeg' }))
      xhr.upload.onprogress = (e) => {
        arm()
        if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total))
      }
      xhr.onload = () => {
        clearTimeout(timer)
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(1)
          resolve()
        } else {
          reject(new PictureError(problemFromResponse(xhr.status, xhr.responseText)))
        }
      }
      xhr.onerror = () => {
        clearTimeout(timer)
        reject(new PictureError(navigator.onLine === false ? 'offline' : 'network'))
      }
      xhr.onabort = () => {
        clearTimeout(timer)
        reject(new PictureError(stalled ? 'stalled' : 'network'))
      }
      arm()
      xhr.send(body)
    })
  }
}

// Reusing a still-fresh signed URL keeps the browser's image cache warm when
// the list reloads (live updates would otherwise re-download every picture).
const signed = new Map<string, { url: string; expiresAt: number }>()

/** Signed URLs for picture paths; `fresh` skips the cache (after an <img> failed). */
export async function signPictures(paths: string[], opts: { fresh?: boolean } = {}): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const missing: string[] = []
  const now = Date.now()
  for (const path of Array.from(new Set(paths))) {
    const hit = opts.fresh ? undefined : signed.get(path)
    if (hit && hit.expiresAt - now > REUSE_MARGIN_MS) out[path] = hit.url
    else missing.push(path)
  }
  if (missing.length) {
    const fresh = await signBucketPictures(createClient(), missing)
    for (const [path, value] of Object.entries(fresh)) {
      signed.set(path, value)
      out[path] = value.url
    }
  }
  return out
}

/** A new signed URL for one picture whose URL failed to load, or null. */
export async function resignPicture(path: string): Promise<string | null> {
  const urls = await signPictures([path], { fresh: true })
  return urls[path] ?? null
}

/** Drops cached URLs of files that were replaced or deleted. */
export function forgetPictures(paths: (string | null | undefined)[]) {
  for (const p of paths) if (p) signed.delete(p)
}
