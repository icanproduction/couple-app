'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

// Reached through /auth/callback from the reset email, which signs the user in.
export default function ResetPasswordPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return
      setHasSession(!!user)
      setChecking(false)
    })
    return () => { cancelled = true }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('Password needs at least 8 characters.'); return }
    if (password !== confirm) { setError('The two passwords don\'t match.'); return }
    setError('')
    setLoading(true)

    const { error: updateError } = await createClient().auth.updateUser({ password })
    if (updateError) {
      const msg = updateError.message.toLowerCase()
      setError(msg.includes('different') || msg.includes('same')
        ? 'Your new password has to be different from the old one.'
        : msg.includes('weak')
        ? 'That password is too easy to guess. Try another one.'
        : 'Couldn\'t save the password. Try again.')
      setLoading(false)
      return
    }

    // The middleware sends unfinished accounts on to onboarding.
    router.replace('/app/home')
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-rose border-t-transparent" />
      </div>
    )
  }

  if (!hasSession) {
    return (
      <div className="animate-fade-in text-center">
        <h1 className="text-2xl font-bold text-ink">This link doesn&apos;t work</h1>
        <p className="mt-2 text-sm text-ink-muted">
          This password reset link has expired. Ask for a new one.
        </p>
        <p className="mt-8 text-sm">
          <Link href="/auth/forgot" className="font-semibold text-rose hover:text-rose-dark">
            Get a new link
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
        <h1 className="text-2xl font-bold text-ink">New password</h1>
        <p className="mt-1 text-sm text-ink-muted">Choose a new password for your account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="New password"
          type="password"
          placeholder="At least 8 characters"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Input
          label="Repeat password"
          type="password"
          placeholder="Type it again"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          error={error}
        />
        <div className="pt-2">
          <Button type="submit" loading={loading} size="lg">
            Save password
          </Button>
        </div>
      </form>
    </div>
  )
}
