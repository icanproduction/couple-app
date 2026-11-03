import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { safeNextPath } from '@/app/onboarding/steps'

// The origin the browser actually used. `request.nextUrl.origin` can report the
// server's own hostname instead (e.g. localhost vs 127.0.0.1, or a proxy), and
// redirecting there would land on a host that doesn't have the new session
// cookie — or has a different user's.
function requestOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
  return host ? `${proto}://${host}` : request.nextUrl.origin
}

// Landing point for links in Supabase emails (signup confirmation, password
// reset): trades the one-time code for a session, then continues to `next`.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const origin = requestOrigin(request)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const target = new URL(next, origin)
      return NextResponse.redirect(target.origin === origin ? target : new URL('/app/home', origin))
    }
  }

  // Expired/used link, or opened in a different browser than the one that
  // requested it (the PKCE verifier lives there).
  const fallback = next === '/auth/reset' ? '/auth/forgot?error=link' : '/auth/login?error=link'
  return NextResponse.redirect(new URL(fallback, origin))
}
