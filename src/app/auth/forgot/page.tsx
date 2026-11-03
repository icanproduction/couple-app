'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { KeyRound, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

function ForgotForm() {
  const searchParams = useSearchParams()
  const linkError = searchParams.get('error') === 'link'

  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: resetError } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/auth/reset')}`,
    })
    setLoading(false)

    if (resetError) {
      const msg = resetError.message.toLowerCase()
      setError(msg.includes('rate limit') || msg.includes('too many')
        ? 'Too many attempts. Try again in a few minutes.'
        : 'Couldn\'t send the email. Check your connection and try again.')
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="animate-fade-in text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sage/15">
          <MailCheck className="h-7 w-7 text-sage-dark" strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-bold text-ink">Check your email</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          If <span className="font-semibold text-ink">{email.trim()}</span> has an account, we&apos;ve sent it a
          link to set a new password. Open the link in this browser.
        </p>
        <p className="mt-8 text-sm text-ink-muted">
          <Link href="/auth/login" className="font-semibold text-rose hover:text-rose-dark">
            Back to log in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50">
          <KeyRound className="h-7 w-7 text-rose" strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-bold text-ink">Forgot password</h1>
        <p className="mt-1 text-sm text-ink-muted">We&apos;ll email you a link to set a new password</p>
      </div>

      {linkError && (
        <div className="mb-5 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-xs leading-relaxed text-ink-light">
          That reset link has expired or was opened in a different browser. Ask for a new one below.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
          error={error}
        />
        <div className="pt-2">
          <Button type="submit" loading={loading} size="lg">
            Send reset link
          </Button>
        </div>
      </form>

      <p className="mt-8 text-center text-sm text-ink-muted">
        Remembered it?{' '}
        <Link href="/auth/login" className="font-semibold text-rose hover:text-rose-dark">
          Log in
        </Link>
      </p>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotForm />
    </Suspense>
  )
}
