import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient, isAuthRetryableFetchError } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

// Next 14 patches fetch with a data cache; a cached Supabase GET once made the
// event-reminders cron re-read deleted rows. Database reads are never cacheable.
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' })

// Service role client — bypasses RLS. Use for admin/system operations only.
export function createServiceRoleClient() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: noStoreFetch } }
  )
}

/**
 * The signed-in user for a server page. When the auth server is unreachable
 * (timeout, 5xx) it throws so the error boundary offers "Coba lagi", instead
 * of returning null and logging the user out.
 */
export async function getServerUser(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (!user && error && isAuthRetryableFetchError(error)) {
    throw new Error('Layanan sedang lambat. Coba lagi sebentar ya.')
  }
  return user
}

// For use in Server Components, Route Handlers, and Server Actions
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: noStoreFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from Server Component — cookies can only be set
            // in middleware or Route Handlers; this is safe to ignore here.
          }
        },
      },
    }
  )
}
