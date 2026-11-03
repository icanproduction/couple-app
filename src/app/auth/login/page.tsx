'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cleanInviteCode, homeFor } from '@/app/onboarding/steps'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteCode = cleanInviteCode(searchParams.get('invite'))
  const linkError = searchParams.get('error') === 'link'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setUnconfirmed(false)
    setLoading(true)

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })

    if (authError) {
      const msg = authError.message.toLowerCase()
      if (authError.code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
        setUnconfirmed(true)
        setError('Email kamu belum dikonfirmasi. Buka link konfirmasi yang kami kirim ke email-mu dulu, ya.')
      } else if (msg.includes('rate limit') || msg.includes('too many')) {
        setError('Terlalu banyak percobaan. Coba lagi beberapa menit lagi.')
      } else if (authError.code === 'invalid_credentials' || msg.includes('invalid login')) {
        setError('Email atau password salah.')
      } else {
        setError('Gagal masuk. Periksa koneksi lalu coba lagi.')
      }
      setLoading(false)
      return
    }

    // Came from an invite link: let the invite page decide (join or home).
    if (inviteCode) {
      router.replace(`/invite/${inviteCode}`)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, role, onboarding_complete, couple_members(couple_id)')
      .eq('id', data.user.id)
      .maybeSingle()

    const members: unknown = profile?.couple_members
    const state = {
      hasName: !!profile?.name,
      hasCouple: Array.isArray(members) ? members.length > 0 : !!members,
      isAdmin: profile?.role === 'admin',
    }

    // Flag still false but they're actually done (e.g. skipped the last step).
    if (state.hasName && state.hasCouple && !profile?.onboarding_complete) {
      await supabase.from('profiles').update({ onboarding_complete: true }).eq('id', data.user.id)
    }

    router.replace(homeFor(state))
  }

  async function resendConfirmation() {
    setResendState('sending')
    const next = inviteCode ? `/invite/${inviteCode}` : '/app/home'
    const { error: resendError } = await createClient().auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    })
    setResendState(resendError ? 'error' : 'sent')
  }

  return (
    <div className="animate-fade-in">
      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50">
          <Heart className="h-7 w-7 text-rose" strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-bold text-ink">Masuk</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {inviteCode ? 'Masuk untuk bergabung dengan pasangan' : 'Selamat datang kembali'}
        </p>
      </div>

      {linkError && (
        <div className="mb-5 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-xs leading-relaxed text-ink-light">
          Link di email sudah tidak berlaku atau dibuka di browser lain. Kalau email-mu sudah terkonfirmasi, silakan masuk di sini.
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
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
          placeholder="••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          error={error}
        />

        {unconfirmed && (
          <p className="text-xs text-ink-muted">
            Tidak ada email?{' '}
            <button
              type="button"
              onClick={resendConfirmation}
              disabled={resendState === 'sending' || resendState === 'sent'}
              className="font-semibold text-rose hover:text-rose-dark disabled:opacity-60"
            >
              {resendState === 'sending' ? 'Mengirim…' : resendState === 'sent' ? 'Link sudah dikirim ulang' : 'Kirim ulang link konfirmasi'}
            </button>
            {resendState === 'error' && <span className="block pt-1 text-danger">Gagal mengirim ulang. Coba lagi sebentar lagi.</span>}
          </p>
        )}

        <div className="text-right">
          <Link href="/auth/forgot" className="text-xs font-semibold text-ink-muted hover:text-rose">
            Lupa password?
          </Link>
        </div>

        <div className="pt-1">
          <Button type="submit" loading={loading} size="lg">
            Masuk
          </Button>
        </div>
      </form>

      <p className="mt-8 text-center text-sm text-ink-muted">
        Belum punya akun?{' '}
        <Link
          href={inviteCode ? `/auth/signup?invite=${inviteCode}` : '/auth/signup'}
          className="font-semibold text-rose hover:text-rose-dark"
        >
          Daftar sekarang
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
