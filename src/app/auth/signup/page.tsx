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
    return 'Email ini sudah terdaftar. Silakan masuk.'
  }
  if (m.includes('rate limit') || m.includes('too many')) return 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.'
  if (m.includes('weak')) return 'Password terlalu mudah ditebak. Coba yang lain.'
  if (m.includes('password')) return 'Password minimal 8 karakter.'
  if (m.includes('email')) return 'Alamat email tidak valid.'
  return 'Gagal mendaftar. Periksa koneksi lalu coba lagi.'
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
        setError('Email ini sudah terdaftar. Silakan masuk.')
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
        <h1 className="text-2xl font-bold text-ink">Cek email kamu</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Kami sudah kirim link konfirmasi ke <span className="font-semibold text-ink">{sentTo}</span>.
          Buka link itu di browser ini untuk melanjutkan
          {inviteCode ? ' dan langsung bergabung dengan pasanganmu' : ''}.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-white p-4 text-xs text-ink-muted shadow-card">
          Tidak ada email? Cek folder spam, atau{' '}
          <button
            type="button"
            onClick={resend}
            disabled={resendState === 'sending' || resendState === 'sent'}
            className="font-semibold text-rose hover:text-rose-dark disabled:opacity-60"
          >
            {resendState === 'sending' ? 'mengirim…' : resendState === 'sent' ? 'sudah dikirim ulang' : 'kirim ulang'}
          </button>
          {resendState === 'error' && (
            <p className="mt-2 text-danger">Gagal mengirim ulang. Tunggu sebentar lalu coba lagi.</p>
          )}
        </div>

        <p className="mt-8 text-sm text-ink-muted">
          Sudah konfirmasi?{' '}
          <Link href={loginHref} className="font-semibold text-rose hover:text-rose-dark">
            Masuk
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
        <h1 className="text-2xl font-bold text-ink">Buat Akun</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {inviteCode ? 'Daftar untuk bergabung dengan pasangan' : 'Mulai perjalanan bersama pasangan'}
        </p>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="kamu@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <Input
          label="Password"
          type="password"
          placeholder="Min. 8 karakter"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          error={error}
        />

        <div className="pt-2">
          <Button type="submit" loading={loading} size="lg">
            Daftar
          </Button>
        </div>
      </form>

      <p className="mt-8 text-center text-sm text-ink-muted">
        Sudah punya akun?{' '}
        <Link href={loginHref} className="font-semibold text-rose hover:text-rose-dark">
          Masuk
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
