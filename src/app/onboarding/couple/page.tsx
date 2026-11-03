'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Heart, Link2 } from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'
import { createCouple, getMyCouple, isCoupleHasDataError, isExpiredInviteError, joinCouple } from '@/lib/couple'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ExpiredInviteNotice } from '@/components/account/ExpiredInviteNotice'
import { DiscardCoupleModal } from '@/components/account/DiscardCoupleModal'
import { cleanInviteCode } from '@/app/onboarding/steps'

type Mode = 'choose' | 'create' | 'join'

interface Me {
  id: string
  hasName: boolean
  onboardingComplete: boolean
  coupleId: string | null
  /** My couple is closed (partner left): joining another deletes this archive. */
  coupleClosed: boolean
}

function CouplePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prefilledCode = cleanInviteCode(searchParams.get('code'))
  // Someone already waiting alone in their own couple may still join their
  // partner's — but only when they came here to join.
  const wantsJoin = !!prefilledCode || searchParams.get('join') === '1'
  // Arrived here right after "Keluar dari pasangan" on the profile page.
  const justLeft = searchParams.get('left') === '1'

  const [me, setMe] = useState<Me | null>(null)
  const [mode, setMode] = useState<Mode>(wantsJoin ? 'join' : 'choose')
  const [inviteCode, setInviteCode] = useState(prefilledCode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Loading who I am failed: show a retry instead of guessing (a guess of
  // "no name yet" would send a successful join to the profile step).
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  // Joining would delete my current space (it holds memories): confirm first.
  const [discardCode, setDiscardCode] = useState<string | null>(null)
  const [discardError, setDiscardError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function check() {
      setLoadError('')
      const supabase = createClient()
      const user = await getClientUser()
      if (!user) { router.replace('/auth/login'); return }

      try {
        const [{ data: profile, error: profileError }, couple] = await Promise.all([
          supabase.from('profiles').select('name, onboarding_complete').eq('id', user.id).maybeSingle(),
          getMyCouple(user.id),
        ])
        if (profileError) throw new Error(profileError.message)
        if (cancelled) return
        const hasName = !!profile?.name
        const onboardingComplete = !!profile?.onboarding_complete

        if (couple) {
          const alone = couple.memberCount < 2
          if (!(alone && wantsJoin)) {
            // A closed couple (partner left) is an archive, not a waiting
            // room: there is no invite code to share, so go to the app.
            const waiting = alone && !couple.closedAt
            router.replace(
              !hasName ? '/onboarding/profile'
                : waiting ? '/onboarding/invite'
                : onboardingComplete ? '/app/home'
                : '/onboarding/install'
            )
            return
          }
        }
        setMe({
          id: user.id, hasName, onboardingComplete,
          coupleId: couple?.id ?? null, coupleClosed: !!couple?.closedAt,
        })
      } catch (e: unknown) {
        if (cancelled) return
        setLoadError(e instanceof Error && e.message ? e.message : 'Gagal memuat data')
      }
    }
    check()
    return () => { cancelled = true }
  }, [router, wantsJoin, attempt])

  async function handleCreate() {
    if (!me || loading) return
    setLoading(true)
    setError('')
    try {
      await createCouple(me.id)
      router.push('/onboarding/invite')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal membuat pasangan')
      setLoading(false)
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!me || loading) return
    const code = cleanInviteCode(inviteCode)
    if (!code) { setError('Masukkan kode undangan'); return }
    setLoading(true)
    setError('')
    try {
      const coupleId = await joinCouple(code, me.id)
      if (coupleId === me.coupleId) {
        setError('Ini kode undangan kamu sendiri. Masukkan kode dari pasanganmu.')
        setLoading(false)
        return
      }
      afterJoin()
    } catch (e: unknown) {
      if (isCoupleHasDataError(e)) {
        setDiscardError('')
        setDiscardCode(code)
      } else {
        setError(e instanceof Error ? e.message : 'Gagal bergabung')
      }
      setLoading(false)
    }
  }

  async function confirmDiscardJoin() {
    if (!me || !discardCode || loading) return
    setLoading(true)
    setDiscardError('')
    try {
      await joinCouple(discardCode, me.id, { discard: true })
      afterJoin()
    } catch (e: unknown) {
      setDiscardError(e instanceof Error ? e.message : 'Gagal bergabung')
      setLoading(false)
    }
  }

  function afterJoin() {
    if (!me) return
    // Profile still empty (signed up from an invite link)? Fill it next.
    router.push(!me.hasName ? '/onboarding/profile' : me.onboardingComplete ? '/app/home' : '/onboarding/install')
  }

  if (loadError) {
    return (
      <div className="animate-fade-in py-10 text-center">
        <p className="mb-6 text-sm text-danger">Gagal memuat datamu: {loadError}</p>
        <Button onClick={() => setAttempt((n) => n + 1)} variant="secondary" size="lg">
          Coba Lagi
        </Button>
      </div>
    )
  }

  if (!me) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-rose border-t-transparent" />
      </div>
    )
  }

  if (mode === 'choose') {
    return (
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-ink">Hubungkan Pasangan</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Buat akun bersama atau bergabung dengan undangan
          </p>
        </div>

        {justLeft && (
          <div className="mb-4 rounded-2xl border border-border bg-cream px-4 py-3 text-xs leading-relaxed text-ink-muted">
            Kamu sudah keluar dari pasangan sebelumnya. Buat pasangan baru atau gabung dengan kode undangan.
          </div>
        )}

        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        <div className="space-y-3">
          <button
            onClick={() => { setError(''); setMode('create') }}
            className="flex w-full items-center gap-4 rounded-2xl border border-border bg-white p-4 text-left transition-colors hover:border-rose hover:bg-rose-50"
          >
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-rose-50">
              <Heart className="h-5 w-5 text-rose" strokeWidth={2} />
            </div>
            <div>
              <p className="font-semibold text-ink">Buat Pasangan Baru</p>
              <p className="text-sm text-ink-muted">Undang pasanganmu dengan kode</p>
            </div>
          </button>

          <button
            onClick={() => { setError(''); setMode('join') }}
            className="flex w-full items-center gap-4 rounded-2xl border border-border bg-white p-4 text-left transition-colors hover:border-rose hover:bg-rose-50"
          >
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-sage/20">
              <Link2 className="h-5 w-5 text-sage-dark" strokeWidth={2} />
            </div>
            <div>
              <p className="font-semibold text-ink">Gabung dengan Kode</p>
              <p className="text-sm text-ink-muted">Sudah punya kode undangan</p>
            </div>
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'create') {
    return (
      <div className="animate-fade-in">
        <button
          onClick={() => { setError(''); setMode('choose') }}
          className="mb-6 text-sm font-medium text-ink-muted hover:text-ink"
        >
          ← Kembali
        </button>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-ink">Buat Pasangan Baru</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Kamu akan mendapat kode undangan untuk dibagikan ke pasangan
          </p>
        </div>
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}
        <Button onClick={handleCreate} loading={loading} size="lg">
          Buat Sekarang
        </Button>
      </div>
    )
  }

  // mode === 'join'
  return (
    <div className="animate-fade-in">
      <button
        onClick={() => { setError(''); setMode('choose') }}
        className="mb-6 text-sm font-medium text-ink-muted hover:text-ink"
      >
        ← Kembali
      </button>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Masukkan Kode</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Masukkan kode undangan dari pasanganmu
        </p>
      </div>

      <form onSubmit={handleJoin} className="space-y-4">
        <Input
          label="Kode Undangan"
          type="text"
          placeholder="Contoh: ABCD1234"
          value={inviteCode}
          onChange={e => setInviteCode(e.target.value.toUpperCase())}
          required
          autoComplete="off"
          error={isExpiredInviteError(error) ? undefined : error || undefined}
        />
        {isExpiredInviteError(error) && <ExpiredInviteNotice />}
        <div className="pt-2">
          <Button type="submit" loading={loading} size="lg">
            Gabung
          </Button>
        </div>
      </form>

      <DiscardCoupleModal
        open={discardCode !== null}
        onClose={() => setDiscardCode(null)}
        onConfirm={confirmDiscardJoin}
        loading={loading}
        error={discardError}
        closed={me.coupleClosed}
      />
    </div>
  )
}

export default function OnboardingCouplePage() {
  return (
    <Suspense>
      <CouplePage />
    </Suspense>
  )
}
