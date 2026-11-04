'use client'

// Adopt Pet Kita: two real options, a name, one button (spec §5.2). No prices,
// no difficulty, no badges. The partner gets one push when it moves in, and if
// they adopt first while this screen is open, it follows them to the pet.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useCoupleRealtime } from '@/lib/realtime'
import { cn } from '@/lib/utils'
import { PET_RULES, type PetType } from '@/types/pet'
import PetStyles from '@/components/pet/PetStyles'
import { PetError, adopt, fetchStatus } from '@/components/pet/api'
import { firstName } from '@/components/pet/copy'
import PetSvgCat from './PetSvgCat'
import PetSvgDog from './PetSvgDog'

interface Props {
  coupleId: string
  partnerId: string | null
  partnerName: string | null
}

const OPTIONS: { type: PetType; label: string; desc: string }[] = [
  { type: 'cat', label: 'Cat', desc: "Curls up by whoever's home." },
  { type: 'dog', label: 'Dog', desc: 'Greets you both at the door.' },
]

const SUGGESTIONS = ['Mochi', 'Kopi', 'Boba', 'Tahu']
const MAX = PET_RULES.limits.name_max

export default function PetAdoptScreen({ coupleId, partnerId, partnerName }: Props) {
  const router = useRouter()
  const [type, setType] = useState<PetType | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // Set synchronously: a double tap must not reach /api/pet/adopt twice (it
  // sends the partner the adoption push).
  const sending = useRef(false)

  const trimmed = name.trim()
  const valid = !!type && trimmed.length >= 1 && trimmed.length <= MAX
  const partner = partnerId ? firstName(partnerName) : null

  // The partner adopted on their phone while this screen was open.
  const checkPartner = useCallback(async () => {
    if (saving || sending.current) return
    try {
      const status = await fetchStatus()
      if (status) {
        setNotice(`${partner ?? 'Your partner'} just adopted ${status.name}. Taking you there now.`)
        setTimeout(() => router.replace('/app/pet'), 1400)
      }
    } catch { /* stay on this screen */ }
  }, [saving, partner, router])
  useCoupleRealtime(coupleId, ['couple_pets'], () => { void checkPartner() })

  async function submit() {
    if (!valid || !type || saving || sending.current) return
    sending.current = true
    setSaving(true)
    setError('')
    try {
      const { pet, partnerWasFaster } = await adopt(type, trimmed)
      if (partnerWasFaster) {
        setNotice(`${partner ?? 'Your partner'} already adopted ${pet.name}. Taking you there now.`)
        setTimeout(() => router.replace('/app/pet'), 1400)
        return
      }
      router.replace('/app/pet')
      router.refresh()
    } catch (e) {
      setError(e instanceof PetError ? e.message : "Couldn't adopt just now. Try again.")
      setSaving(false)
      sending.current = false
    }
  }

  return (
    <div className="pet-anim animate-fade-in pb-6">
      <PetStyles />
      <div className="border-b border-border bg-white px-4 pb-4 pt-4">
        <div className="flex items-center gap-2">
          <Link href="/app/home" aria-label="Back to Home" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-muted active:bg-rose-50">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-extrabold text-ink">Adopt Pet Kita</h1>
        </div>
        <p className="mt-1 pl-11 text-sm leading-relaxed text-ink-muted">
          {partner ? 'Pick one together. Either of you can rename it later.' : 'Pick one. You can rename it later.'}
        </p>
      </div>

      <form className="space-y-5 px-4 pt-5" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <fieldset>
          <legend className="sr-only">Cat or dog</legend>
          <div className="grid grid-cols-2 gap-3" data-testid="adopt-options">
            {OPTIONS.map((o) => {
              const picked = type === o.type
              const Pet = o.type === 'dog' ? PetSvgDog : PetSvgCat
              return (
                <button
                  key={o.type}
                  type="button"
                  data-pet-type={o.type}
                  aria-pressed={picked}
                  onClick={() => setType(o.type)}
                  className={cn(
                    'relative flex flex-col items-center rounded-3xl border-2 bg-white px-3 pb-4 pt-3 text-center shadow-card transition-all active:scale-[0.98]',
                    picked ? 'border-rose bg-rose-50/40' : 'border-border',
                  )}
                >
                  {picked && (
                    <span className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-rose text-white">
                      <Check className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                  <span className="block h-28 w-28">
                    <Pet pose={picked ? 'glowing' : 'cozy'} stage="little" level={1} className="h-full w-full" />
                  </span>
                  <span className="mt-1 text-base font-bold text-ink">{o.label}</span>
                  <span className="mt-0.5 text-xs leading-snug text-ink-muted">{o.desc}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor="pet-name" className="mb-1.5 block text-sm font-semibold text-ink">What should we call it?</label>
          <div className="relative">
            <input
              id="pet-name"
              value={name}
              maxLength={MAX}
              placeholder="Mochi"
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 pr-14 text-sm text-ink outline-none focus:border-rose"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-ink-muted">{trimmed.length}/{MAX}</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setName(s)}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95',
                  trimmed === s ? 'border-rose bg-rose text-white' : 'border-border bg-white text-ink-light',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-ink-light" role="alert">{error}</p>}
        {notice && <p className="rounded-xl bg-sage/15 px-3 py-2 text-sm text-sage-dark" role="status">{notice}</p>}

        <Button type="submit" size="lg" loading={saving} disabled={!valid || !!notice}>
          <span className="truncate">{trimmed ? `Adopt ${trimmed}` : 'Adopt'}</span>
        </Button>
        {!type && <p className="-mt-2 text-center text-xs text-ink-muted">Pick a cat or a dog first.</p>}
      </form>
    </div>
  )
}
