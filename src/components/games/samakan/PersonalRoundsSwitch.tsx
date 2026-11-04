'use client'

// Profile switch for Samakan's "For you two" set. It belongs to the couple,
// so either partner can flip it, and the other sees it in the activity feed.
// Off: the server reads no Daily Question, Moment or mood rows and makes no
// AI call.

import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { codeFor, getPersonalRounds, messageFor, setPersonalRounds } from '@/lib/samakan'

export default function PersonalRoundsSwitch({ coupleId }: { coupleId: string }) {
  const [on, setOn] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    let cancelled = false
    getPersonalRounds(coupleId)
      .then((v) => { if (!cancelled) setOn(v) })
      .catch(() => { if (!cancelled) setError('Couldn\'t load this setting. Check your connection.') })
    return () => { cancelled = true }
  }, [coupleId])

  async function toggle() {
    if (on === null || busy.current) return
    busy.current = true
    const next = !on
    setSaving(true)
    setError(null)
    setOn(next)
    try {
      setOn(await setPersonalRounds(next))
    } catch (e) {
      setOn(!next)
      setError(codeFor(e) === 'NETWORK' ? 'Couldn\'t save the switch. Check your connection and try again.' : messageFor(e))
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  const checked = on === true
  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Personal rounds in Samakan"
        onClick={toggle}
        disabled={on === null || saving}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3.5 text-left transition-colors hover:bg-cream disabled:opacity-60"
      >
        <span className="flex min-w-0 items-start gap-3">
          <Sparkles className={cn('mt-0.5 h-4 w-4 shrink-0', checked ? 'text-purple-500' : 'text-ink-muted')} aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">Personal rounds</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
              Lets Claude by Anthropic use your Daily Question answers, Moment titles and moods to write Samakan rounds for you two.
            </span>
          </span>
        </span>
        <span className={cn('flex h-7 w-12 shrink-0 items-center rounded-full px-0.5 transition-colors', checked ? 'bg-rose' : 'bg-border')}>
          <span className={cn('h-6 w-6 rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-5' : 'translate-x-0')} />
        </span>
      </button>
      {error && <p role="alert" className="mt-1.5 px-1 text-xs text-danger">{error}</p>}
    </div>
  )
}
