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
    if (password.length < 8) { setError('Password minimal 8 karakter.'); return }
    if (password !== confirm) { setError('Konfirmasi password tidak sama.'); return }
    setError('')
    setLoading(true)

    const { error: updateError } = await createClient().auth.updateUser({ password })
    if (updateError) {
      const msg = updateError.message.toLowerCase()
      setError(msg.includes('different') || msg.includes('same')
        ? 'Password baru harus berbeda dari yang lama.'
        : msg.includes('weak')
        ? 'Password terlalu mudah ditebak. Coba yang lain.'
        : 'Gagal menyimpan password. Coba lagi.')
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
        <h1 className="text-2xl font-bold text-ink">Link tidak valid</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Link reset password sudah tidak berlaku. Minta link baru, ya.
        </p>
        <p className="mt-8 text-sm">
          <Link href="/auth/forgot" className="font-semibold text-rose hover:text-rose-dark">
            Minta link baru
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
        <h1 className="text-2xl font-bold text-ink">Password Baru</h1>
        <p className="mt-1 text-sm text-ink-muted">Buat password baru untuk akunmu</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Password Baru"
          type="password"
          placeholder="Min. 8 karakter"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Input
          label="Ulangi Password"
          type="password"
          placeholder="Ketik ulang password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          error={error}
        />
        <div className="pt-2">
          <Button type="submit" loading={loading} size="lg">
            Simpan Password
          </Button>
        </div>
      </form>
    </div>
  )
}
