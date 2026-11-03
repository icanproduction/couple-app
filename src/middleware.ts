import { createServerClient } from '@supabase/ssr'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'
import { cleanInviteCode, homeFor, pendingOnboardingStep } from '@/app/onboarding/steps'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  let authHeaders: Record<string, string> = {}

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          authHeaders = headers ?? {}
          Object.entries(authHeaders).forEach(([k, v]) => supabaseResponse.headers.set(k, v))
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  // A redirect must carry the auth cookies getUser() may have just refreshed,
  // otherwise the browser keeps the stale token and is signed out next request.
  function redirect(to: string) {
    const res = NextResponse.redirect(new URL(to, request.url))
    supabaseResponse.cookies.getAll().forEach((cookie) => res.cookies.set(cookie))
    Object.entries(authHeaders).forEach(([k, v]) => res.headers.set(k, v))
    return res
  }

  // One query: name, role and couple membership. A failed read lets the page
  // render (it has its own empty states) instead of bouncing to onboarding.
  async function loadState() {
    const { data, error } = await supabase
      .from('profiles')
      .select('name, role, couple_members(couple_id)')
      .eq('id', user!.id)
      .maybeSingle()
    const members: unknown = data?.couple_members
    return {
      ok: !error,
      hasName: !!data?.name,
      hasCouple: Array.isArray(members) ? members.length > 0 : !!members,
      isAdmin: data?.role === 'admin',
    }
  }

  const path = request.nextUrl.pathname
  const isApp = path === '/app' || path.startsWith('/app/')
  const isAdmin = path === '/admin' || path.startsWith('/admin/')

  if (!user) {
    // The auth server didn't answer (offline, timeout, 5xx). That isn't
    // "signed out": the session cookie is intact, so let the page load and
    // show its own retry instead of bouncing the user to the login form.
    if (authError && isAuthRetryableFetchError(authError)) return supabaseResponse
    if (isApp || isAdmin || path.startsWith('/onboarding/')) {
      return redirect('/auth/login')
    }
    return supabaseResponse
  }

  // Signed-in users skip the landing & auth forms. An invite link they were
  // following still applies.
  if (path === '/' || path === '/auth/login' || path === '/auth/signup') {
    const invite = cleanInviteCode(request.nextUrl.searchParams.get('invite'))
    if (invite) return redirect(`/invite/${invite}`)
    const state = await loadState()
    return redirect(state.ok ? homeFor(state) : '/app/home')
  }

  // /app/* needs a finished profile and a couple.
  if (isApp) {
    const state = await loadState()
    const step = state.ok ? pendingOnboardingStep(state) : null
    if (step) return redirect(step)
  }

  // /admin/* — admins only.
  if (isAdmin) {
    const state = await loadState()
    if (!state.isAdmin) return redirect(state.ok ? homeFor(state) : '/app/home')
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/', '/auth/:path*', '/app/:path*', '/onboarding/:path*', '/invite/:path*', '/admin/:path*', '/admin'],
}
