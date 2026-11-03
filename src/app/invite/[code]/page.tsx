import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Archive, Clock, SearchX, Users } from 'lucide-react'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { cleanInviteCode } from '@/app/onboarding/steps'

export const dynamic = 'force-dynamic'

type Problem = 'closed' | 'expired' | 'full' | 'not_found'

const PROBLEMS: Record<Problem, { icon: typeof Clock; title: string; body: string }> = {
  closed: {
    icon: Archive,
    title: 'This code no longer works',
    body: 'The couple space behind this code was closed when one of them left. Ask your partner to start a new space, then send you the new invite code.',
  },
  expired: {
    icon: Clock,
    title: 'This invite code has expired',
    body: 'Invite codes last 7 days. Ask your partner to open Profile, tap "New code", then send you the new link.',
  },
  full: {
    icon: Users,
    title: 'This couple is already complete',
    body: 'This code belongs to a couple where both people have already joined. Double-check the code your partner sent.',
  },
  not_found: {
    icon: SearchX,
    title: 'We couldn\'t find this invite code',
    body: 'It may have a typo, or it was replaced with a new code. Ask your partner to send the invite link again.',
  },
}

/**
 * Can this code be joined right now? Looked up with the service role because
 * a not-yet-member can't read the couple; only the verdict leaves the server.
 */
async function inviteProblem(code: string, userId: string | null): Promise<Problem | null> {
  const admin = createServiceRoleClient()
  const { data: target, error } = await admin
    .from('couples')
    .select('invite_expires_at, closed_at, couple_members(profile_id)')
    .eq('invite_code', code)
    .maybeSingle()
  if (error) return null // Let join_couple give the verdict instead.
  if (!target) return 'not_found'
  const members = target.couple_members.map((m) => m.profile_id)
  if (userId && members.includes(userId)) return null
  // Before 'expired': leaving also expires the code, but "ask for a new code"
  // is the wrong advice for a couple that can never be joined again.
  if (target.closed_at) return 'closed'
  if (members.length >= 2) return 'full'
  if (new Date(target.invite_expires_at).getTime() <= Date.now()) return 'expired'
  return null
}

export default async function InvitePage({ params }: { params: { code: string } }) {
  const code = cleanInviteCode(params.code)
  if (!code) redirect('/')

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Already in a couple: only someone still alone may switch over — the join
    // step asks them to confirm when that deletes a couple holding memories.
    const { data: membership } = await supabase
      .from('couple_members')
      .select('couple_id')
      .eq('profile_id', user.id)
      .maybeSingle()

    if (membership) {
      const { count } = await supabase
        .from('couple_members')
        .select('*', { count: 'exact', head: true })
        .eq('couple_id', membership.couple_id)
      if ((count ?? 0) >= 2) redirect('/app/home')
    }
  }

  const problem = await inviteProblem(code, user?.id ?? null)
  if (!problem) {
    // Join step with the invite code pre-filled (after signing up if needed).
    redirect(user ? `/onboarding/couple?code=${code}` : `/auth/signup?invite=${code}`)
  }

  const { icon: Icon, title, body } = PROBLEMS[problem]
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-lg flex-col items-center justify-center px-8 text-center animate-fade-in">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50">
        <Icon className="h-8 w-8 text-rose" />
      </div>
      <h1 className="text-xl font-bold text-ink">{title}</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">{body}</p>
      <p className="mt-4 rounded-xl bg-cream px-3 py-1.5 font-mono text-sm font-bold tracking-[0.2em] text-ink-muted">{code}</p>

      <div className="mt-8 w-full max-w-xs space-y-3">
        {user ? (
          <>
            <Link
              href="/onboarding/couple?join=1"
              className="block w-full rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated"
            >
              Enter another code
            </Link>
            <Link href="/app/home" className="block w-full py-2 text-sm font-semibold text-ink-muted hover:text-ink">
              Not now
            </Link>
          </>
        ) : (
          <>
            <Link
              href="/auth/signup"
              className="block w-full rounded-2xl bg-rose py-3.5 text-sm font-bold text-white shadow-elevated"
            >
              Sign up first
            </Link>
            <Link href="/auth/login" className="block w-full py-2 text-sm font-semibold text-ink-muted hover:text-ink">
              Have an account? Log in
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
