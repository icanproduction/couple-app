'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Heart, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cleanInviteCode } from '@/app/onboarding/steps'

function signupErrorMessage(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'This email already has an account. Log in instead.'
  }
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Try again in a few minutes.'
  if (m.includes('weak')) return 'That password is too easy to guess. Try another one.'
  if (m.includes('password')) return 'Password needs at least 8 characters.'
  if (m.includes('email')) return 'That email address isn\'t valid.'
  return 'Couldn\'t sign you up. Check your connection and try again.'
}

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteCode = cleanInviteCode(searchParams.get('invite'))
  const loginHref = inviteCode ? `/auth/login?invite=${inviteCode}` : '/auth/login'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Set when the project requires email confirmation: signUp returns no session.
  const [sentTo, setSentTo] = useState('')
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  // Where the confirmation link lands after /auth/callback signs the user in.
  function emailRedirectTo() {
    const next = inviteCode ? `/invite/${inviteCode}` : '/onboarding/welcome'
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: emailRedirectTo() },
    })

    if (authError) {
      setError(signupErrorMessage(authError.message))
      setLoading(false)
      return
    }

    if (!data.session) {
      // With confirmations on, an already-registered email comes back as a
      // user without identities instead of an error.
      if (data.user && data.user.identities?.length === 0) {
        setError('This email already has an account. Log in instead.')
      } else {
        setSentTo(email.trim())
      }
      setLoading(false)
      return
    }

    router.push(inviteCode ? `/onboarding/couple?code=${inviteCode}` : '/onboarding/welcome')
  }

  async function resend() {
    setResendState('sending')
    const { error: resendError } = await createClient().auth.resend({
      type: 'signup',
      email: sentTo,
      options: { emailRedirectTo: emailRedirectTo() },
    })
    setResendState(resendError ? 'error' : 'sent')
  }

  if (sentTo) {
    return (
      <div className="animate-fade-in text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sage/15">
          <MailCheck className="h-7 w-7 text-sage-dark" strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-bold text-ink">Check your email</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          We sent a confirmation link to <span className="font-semibold text-ink">{sentTo}</span>.
          Open it in this browser to continue
          {inviteCode ? ' and join your partner straight away' : ''}.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-white p-4 text-xs text-ink-muted shadow-card">
          No email? Check your spam folder, or{' '}
          <button
            type="button"
            onClick={resend}
            disabled={resendState === 'sending' || resendState === 'sent'}
            className="font-semibold text-rose hover:text-rose-dark disabled:opacity-60"
          >
            {resendState === 'sending' ? 'sending…' : resendState === 'sent' ? 'sent again' : 'send it again'}
          </button>
          {resendState === 'error' && (
            <p className="mt-2 text-danger">Couldn&apos;t resend it. Wait a moment and try again.</p>
          )}
        </div>

        <p className="mt-8 text-sm text-ink-muted">
          Already confirmed?{' '}
          <Link href={loginHref} className="font-semibold text-rose hover:text-rose-dark">
            Log in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50">
          <Heart className="h-7 w-7 text-rose" strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-bold text-ink">Create account</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {inviteCode ? 'Sign up to join your partner' : 'Set up Nanti Kita for the two of you'}
        </p>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <Input
          label="Password"
          type="password"
          placeholder="At least 8 characters"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          error={error}
        />

        <div className="pt-2">
          <Button type="submit" loading={loading} size="lg">
            Sign up
          </Button>
        </div>
      </form>

      <p className="mt-8 text-center text-sm text-ink-muted">
        Have an account?{' '}
        <Link href={loginHref} className="font-semibold text-rose hover:text-rose-dark">
          Log in
        </Link>
      </p>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  )
}
