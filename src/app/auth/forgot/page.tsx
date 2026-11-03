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
        ? 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.'
        : 'Gagal mengirim email. Periksa koneksi lalu coba lagi.')
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
        <h1 className="text-2xl font-bold text-ink">Cek email kamu</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Kalau <span className="font-semibold text-ink">{email.trim()}</span> terdaftar, link untuk membuat
          password baru sudah kami kirim. Buka link itu di browser ini.
        </p>
        <p className="mt-8 text-sm text-ink-muted">
          <Link href="/auth/login" className="font-semibold text-rose hover:text-rose-dark">
            Kembali ke halaman masuk
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
        <h1 className="text-2xl font-bold text-ink">Lupa Password</h1>
        <p className="mt-1 text-sm text-ink-muted">Kami kirim link untuk membuat password baru</p>
      </div>

      {linkError && (
        <div className="mb-5 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-xs leading-relaxed text-ink-light">
          Link reset sudah tidak berlaku atau dibuka di browser lain. Minta link baru di bawah ini.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="kamu@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
          error={error}
        />
        <div className="pt-2">
          <Button type="submit" loading={loading} size="lg">
            Kirim Link Reset
          </Button>
        </div>
      </form>

      <p className="mt-8 text-center text-sm text-ink-muted">
        Ingat password?{' '}
        <Link href="/auth/login" className="font-semibold text-rose hover:text-rose-dark">
          Masuk
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
