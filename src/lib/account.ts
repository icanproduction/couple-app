// Server-only: joining or leaving a couple and deleting an account (F01, F02).
// Used by /api/couple/join, /api/couple/leave and /api/account/delete. Never
// import from a client component (it reaches for the service role).
import { createServerSupabaseClient, createServiceRoleClient } from './supabase-server'
import { removeCoupleBucketPictures } from './bucket'

type UserClient = Awaited<ReturnType<typeof createServerSupabaseClient>>
type AdminClient = ReturnType<typeof createServiceRoleClient>

// Same names as MOMENTS_BUCKET in ./moments — not imported from there because
// that module pulls in the browser client.
const MOMENTS_BUCKET = 'moments'
export const AVATARS_BUCKET = 'avatars'
export const DELETE_ACCOUNT_CONFIRM = 'DELETE ACCOUNT'
/** The phrase app versions before the English switch send; still accepted. */
const DELETE_ACCOUNT_CONFIRM_LEGACY = 'HAPUS AKUN' // copy-ok: legacy request value, still accepted

/** True when the typed phrase confirms account deletion (current or legacy). */
export function isDeleteAccountConfirm(value: unknown): boolean {
  return value === DELETE_ACCOUNT_CONFIRM || value === DELETE_ACCOUNT_CONFIRM_LEGACY
}

export interface LeaveResult {
  coupleId: string
  /** True when the caller was the last member and the couple is gone. */
  deleted: boolean
  /** Photo files removed from storage (only when `deleted`). */
  removedFiles: number
}

const PAGE = 1000
const REMOVE_BATCH = 100

/** Every object path under `prefix` (folders are walked `depth` levels deep). */
async function listObjects(admin: AdminClient, bucket: string, prefix: string, depth: number): Promise<string[]> {
  const paths: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: PAGE, offset })
    if (error) throw new Error(error.message)
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`
      // Folders come back without an id.
      if (item.id === null) {
        if (depth > 0) paths.push(...(await listObjects(admin, bucket, path, depth - 1)))
      } else {
        paths.push(path)
      }
    }
    if ((data?.length ?? 0) < PAGE) break
  }
  return paths
}

async function removeObjects(admin: AdminClient, bucket: string, paths: string[]): Promise<number> {
  let removed = 0
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    const batch = paths.slice(i, i + REMOVE_BATCH)
    const { data, error } = await admin.storage.from(bucket).remove(batch)
    if (error) throw new Error(error.message)
    removed += data?.length ?? 0
  }
  return removed
}

/** Remove a deleted couple's photos: moments/<couple_id>/<moment_id>/<file>. */
export async function removeCouplePhotos(coupleId: string): Promise<number> {
  const admin = createServiceRoleClient()
  const paths = await listObjects(admin, MOMENTS_BUCKET, coupleId, 2)
  return removeObjects(admin, MOMENTS_BUCKET, paths)
}

/** Remove the user's avatar files: avatars/<uid>/avatar.<ext>. */
export async function removeAvatarFiles(userId: string): Promise<number> {
  const admin = createServiceRoleClient()
  const paths = await listObjects(admin, AVATARS_BUCKET, userId, 1)
  return removeObjects(admin, AVATARS_BUCKET, paths)
}

/**
 * Leave the caller's couple as the caller (leave_couple needs auth.uid()).
 * When that empties the couple, its photos are removed too — best effort:
 * the rows are already gone, so a storage hiccup only leaves orphan files.
 */
export async function leaveCoupleAs(supabase: UserClient): Promise<LeaveResult> {
  const { data, error } = await supabase.rpc('leave_couple')
  if (error) throw new Error(error.message)
  const result = (data ?? {}) as { couple_id?: string; deleted?: boolean }
  if (!result.couple_id) throw new Error('Couldn\'t leave this couple')

  let removedFiles = 0
  if (result.deleted) {
    try {
      removedFiles = await removeCouplePhotos(result.couple_id)
    } catch (e) {
      console.error('[account] couple photo cleanup failed:', result.couple_id, e instanceof Error ? e.message : e)
    }
  }
  return { coupleId: result.couple_id, deleted: !!result.deleted, removedFiles }
}

/** join_couple's hint when joining would delete a couple that holds memories. */
export const COUPLE_HAS_DATA = 'COUPLE_HAS_DATA'

export class JoinError extends Error {
  constructor(message: string, readonly code: string | null) {
    super(message)
  }
}

export interface JoinResult {
  coupleId: string
  /** The couple I was alone in before, now deleted (null when there was none or it was this one). */
  discardedCoupleId: string | null
  /** Photo files of that discarded couple removed from storage. */
  removedFiles: number
}

/**
 * Join the couple behind `code` as the caller (join_couple needs auth.uid()).
 * Without `discard`, the database refuses when my current solo couple holds
 * memories (JoinError code COUPLE_HAS_DATA). When the join deletes my old
 * couple, its photos are removed too — best effort, like leaveCoupleAs.
 */
export async function joinCoupleAs(supabase: UserClient, userId: string, code: string, discard: boolean): Promise<JoinResult> {
  const { data: before, error: beforeError } = await supabase
    .from('couple_members').select('couple_id').eq('profile_id', userId).maybeSingle()
  if (beforeError) throw new Error(beforeError.message)
  const previous = before?.couple_id ?? null

  const { data: coupleId, error } = await supabase.rpc('join_couple', { p_code: code, p_discard: discard })
  if (error) throw new JoinError(error.message, error.hint === COUPLE_HAS_DATA ? COUPLE_HAS_DATA : null)
  if (!coupleId) throw new JoinError('Couldn\'t join', null)

  let discardedCoupleId: string | null = null
  let removedFiles = 0
  if (previous && previous !== coupleId) {
    const admin = createServiceRoleClient()
    const { data: still, error: lookupError } = await admin.from('couples').select('id').eq('id', previous).maybeSingle()
    if (lookupError) {
      console.error('[account] old couple lookup failed:', previous, lookupError.message)
    } else if (!still) {
      discardedCoupleId = previous
      try {
        removedFiles = await removeCouplePhotos(previous)
      } catch (e) {
        console.error('[account] old couple photo cleanup failed:', previous, e instanceof Error ? e.message : e)
      }
      try {
        removedFiles += await removeCoupleBucketPictures(admin, previous)
      } catch (e) {
        console.error('[account] old couple bucket picture cleanup failed:', previous, e instanceof Error ? e.message : e)
      }
    }
  }
  return { coupleId, discardedCoupleId, removedFiles }
}
