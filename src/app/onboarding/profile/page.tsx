'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Smile } from 'lucide-react'
import { createClient, getClientUser } from '@/lib/supabase'
import { getMyCouple, seedCalendarEvents } from '@/lib/couple'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface SavedDates {
  birthday: string | null
  relationship_start_date: string | null
}

export default function OnboardingProfilePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedDates | null>(null)
  const [name, setName] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | ''>('')
  const [birthday, setBirthday] = useState('')
  const [relationshipStart, setRelationshipStart] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Pre-fill whatever is already saved (returning to this step, or sent here
  // by the middleware because the name is missing).
  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const user = await getClientUser()
      if (!user) { router.replace('/auth/login'); return }
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, gender, birthday, relationship_start_date')
        .eq('id', user.id)
        .maybeSingle()
      if (cancelled) return
      setUserId(user.id)
      if (profile) {
        setName(profile.name ?? '')
        setGender(profile.gender === 'male' || profile.gender === 'female' ? profile.gender : '')
        setBirthday(profile.birthday ?? '')
        setRelationshipStart(profile.relationship_start_date ?? '')
        setSaved({ birthday: profile.birthday, relationship_start_date: profile.relationship_start_date })
      }
    }
    load()
    return () => { cancelled = true }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || loading) return
    if (!name.trim()) { setError('Please enter your name'); return }
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        name: name.trim(),
        gender: gender || null,
        birthday: birthday || null,
        relationship_start_date: relationshipStart || null,
      })
      .eq('id', userId)

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    // Joined through an invite before filling the profile? Then the couple
    // step is done — seed the calendar now that the dates exist, and move on.
    let couple = null
    try {
      couple = await getMyCouple(userId)
    } catch {
      // Unknown — the couple step re-checks and forwards if needed.
    }
    if (couple) {
      await seedCalendarEvents(userId, couple.id, saved).catch((err) => console.warn('seedCalendarEvents', err))
      router.push(couple.memberCount >= 2 ? '/onboarding/install' : '/onboarding/invite')
      return
    }
    router.push('/onboarding/couple')
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50">
          <Smile className="h-7 w-7 text-rose" strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-bold text-ink">First, a little about you</h1>
        <p className="mt-1 text-sm text-ink-muted">What does your partner usually call you?</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Nickname"
          type="text"
          placeholder="e.g. Budi, Babe, B"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          autoComplete="given-name"
          error={error}
        />

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            I&apos;m a...
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setGender('male')}
              className={`flex-1 rounded-2xl border py-3 text-sm font-semibold transition-all ${
                gender === 'male'
                  ? 'border-rose bg-rose-50 text-rose'
                  : 'border-border bg-white text-ink-muted hover:border-rose'
              }`}
            >
              Guy
            </button>
            <button
              type="button"
              onClick={() => setGender('female')}
              className={`flex-1 rounded-2xl border py-3 text-sm font-semibold transition-all ${
                gender === 'female'
                  ? 'border-rose bg-rose-50 text-rose'
                  : 'border-border bg-white text-ink-muted hover:border-rose'
              }`}
            >
              Girl
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            When&apos;s your birthday?
          </label>
          <input
            type="date"
            value={birthday}
            onChange={e => setBirthday(e.target.value)}
            className="w-full rounded-2xl border border-border bg-white px-4 py-3.5 text-sm text-ink focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20"
          />
          <p className="text-xs text-ink-muted">
            We&apos;ll remind your partner when it&apos;s close
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            When did you two get together?
          </label>
          <input
            type="date"
            value={relationshipStart}
            onChange={e => setRelationshipStart(e.target.value)}
            className="w-full rounded-2xl border border-border bg-white px-4 py-3.5 text-sm text-ink focus:border-rose focus:outline-none focus:ring-2 focus:ring-rose/20"
          />
          <p className="text-xs text-ink-muted">
            Used to count your days together and remind you of anniversaries
          </p>
        </div>

        <div className="pt-2">
          <Button type="submit" loading={loading} disabled={!userId} size="lg">
            Continue
          </Button>
        </div>
      </form>
    </div>
  )
}
