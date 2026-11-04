import { getRelationshipLevel, relationshipLevelLabel } from '@/lib/dates'

interface CoupleProfileHeroProps {
  myName: string | null
  partnerName: string | null
  myAvatarUrl?: string | null
  partnerAvatarUrl?: string | null
  daysTogether: number
  relationshipStartDate: string | null
  children?: React.ReactNode  // slot: the Pet Kita row, then the Kangen button
}

const LEVEL_STYLES: Record<string, { bg: string; text: string }> = {
  Benih: { bg: 'bg-gold/20', text: 'text-yellow-700' },
  Tumbuh: { bg: 'bg-sage/20', text: 'text-sage-dark' },
  Mekar: { bg: 'bg-rose/15', text: 'text-rose' },
  Abadi: { bg: 'bg-gradient-to-r from-rose/20 to-purple-100', text: 'text-rose-dark' },
}

function Avatar({ url, name, color }: { url?: string | null; name: string | null; color: string }) {
  const initial = name?.[0]?.toUpperCase() ?? '?'
  if (url) {
    return (
      <div className="h-16 w-16 overflow-hidden rounded-full ring-4 ring-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- avatar from Supabase public storage (host differs per environment), next/image would need every host whitelisted */}
        <img src={url} alt={name ?? ''} className="h-full w-full object-cover" />
      </div>
    )
  }
  return (
    <div className={`flex h-16 w-16 items-center justify-center rounded-full ring-4 ring-white ${color}`}>
      <span className="text-2xl font-bold">{initial}</span>
    </div>
  )
}

export default function CoupleProfileHero({
  myName, partnerName, myAvatarUrl, partnerAvatarUrl,
  daysTogether, relationshipStartDate, children,
}: CoupleProfileHeroProps) {
  const level = relationshipStartDate ? getRelationshipLevel(daysTogether) : null
  const levelStyle = level ? LEVEL_STYLES[level] ?? LEVEL_STYLES.Benih : null

  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-rose/5 via-white to-cream px-6 pb-5 pt-8">
      <div className="absolute -left-12 -top-12 h-36 w-36 rounded-full bg-rose/5" />
      <div className="absolute -right-8 top-4 h-24 w-24 rounded-full bg-gold/5" />

      <div className="relative flex flex-col items-center">
        {/* Avatar pair */}
        <div className="mb-4 flex items-center -space-x-4">
          <Avatar url={myAvatarUrl} name={myName} color="bg-rose/10 text-rose" />
          <div className="z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md">
            <svg className="h-4 w-4 text-rose" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </div>
          <Avatar url={partnerAvatarUrl} name={partnerName} color="bg-sage/15 text-sage-dark" />
        </div>

        {/* Names */}
        <h1 className="max-w-full break-words text-center text-lg font-extrabold text-ink">
          {myName ?? 'You'} <span className="font-normal text-ink-muted">&amp;</span> {partnerName ?? 'Your partner'}
        </h1>

        {/* Stats row */}
        <div className="mt-1.5 flex items-center gap-3">
          {relationshipStartDate && (
            <span className="text-xs text-ink-muted">
              {daysTogether.toLocaleString('en-GB')} {daysTogether === 1 ? 'day' : 'days'} together
            </span>
          )}
          {level && levelStyle && (
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${levelStyle.bg} ${levelStyle.text}`}>
              {relationshipLevelLabel(level)}
            </span>
          )}
        </div>

        {/* Slot: Pet Kita row (PetPeek) and the Kangen button */}
        {children && <div className="mt-3 w-full min-w-0 space-y-2.5">{children}</div>}
      </div>
    </div>
  )
}
