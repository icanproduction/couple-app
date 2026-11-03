import { createBrowserClient } from '@supabase/ssr'
import { isAuthRetryableFetchError, type User } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// For use in Client Components ('use client')
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Convenience singleton for client-side use
export const supabase = createClient()

/**
 * The signed-in user for a client page, from the local session: no network
 * round trip, so a dropped connection doesn't send people to the login form.
 * Safe because the middleware already validated the session for this page and
 * every query is still checked by RLS on the server. Returns null when there
 * is no session; throws only when an expired token couldn't be refreshed
 * because the auth server was unreachable.
 */
export async function getClientUser(): Promise<User | null> {
  const { data: { session }, error } = await createClient().auth.getSession()
  if (!session && error && isAuthRetryableFetchError(error)) throw error
  return session?.user ?? null
}
