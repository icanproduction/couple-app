'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import PetSvgCat from './PetSvgCat'
import PetSvgDog from './PetSvgDog'
import { CARE_ACTION_META, MOOD_META, type CareAction, type PetMood } from '@/types/pet'
import { performCareAction, getDecayedStats, getLastCareAction, calculateMood } from '@/lib/pet'
import { createClient } from '@/lib/supabase'
import { daysSince, todayJakarta } from '@/lib/dates'

interface Props {
  pet: { id: string; couple_id: string; name: string; pet_type: string; level: number; xp: number; created_at: string | null }
  moodState: { hunger: number; happiness: number; cleanliness: number; mood: string; updated_at: string | null } | null
  myActions: string[]
  userId: string
  coupleId: string
}

const ACTION_EMOJIS: Record<CareAction, string> = {
  feed: '🍖', play: '🎾', bath: '🛁', treat: '🍪', walk: '🏃', cuddle: '💬',
}

export default function PetRoom({ pet, moodState, myActions, userId, coupleId }: Props) {
  const router = useRouter()
  // Calendar days in Jakarta since adoption
  const daysSinceAdopt = pet.created_at ? Math.max(0, daysSince(todayJakarta(new Date(pet.created_at)))) : 0

  // No mood row yet → DB defaults (70); the first care action creates the row
  const decayed = moodState && moodState.updated_at
    ? getDecayedStats({ ...moodState, updated_at: moodState.updated_at })
    : moodState
      ? { hunger: moodState.hunger, happiness: moodState.happiness, cleanliness: moodState.cleanliness, mood: calculateMood(moodState.hunger, moodState.happiness, moodState.cleanliness) }
      : { hunger: 70, happiness: 70, cleanliness: 70, mood: 'happy' as PetMood }

  const [stats, setStats] = useState(decayed)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [cooldowns, setCooldowns] = useState<Record<string, boolean>>({})
  const [cooldownsLoaded, setCooldownsLoaded] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!actionError) return
    const t = setTimeout(() => setActionError(''), 3500)
    return () => clearTimeout(t)
  }, [actionError])

  const mood = stats.mood
  const moodMeta = MOOD_META[mood]

  // Check cooldowns on mount + set expiry timers
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    async function checkCooldowns() {
      const cd: Record<string, boolean> = {}
      for (const a of myActions) {
        const action = a as CareAction
        const meta = CARE_ACTION_META[action]
        const last = await getLastCareAction(pet.id, action)
        if (last) {
          const cooldownEnd = last.getTime() + meta.cooldownMinutes * 60000
          const remaining = cooldownEnd - Date.now()
          if (remaining > 0) {
            cd[action] = true
            // Auto-expire cooldown
            timers.push(setTimeout(() => {
              setCooldowns(prev => ({ ...prev, [action]: false }))
            }, remaining))
          }
        }
      }
      setCooldowns(cd)
      setCooldownsLoaded(true)
    }
    checkCooldowns()
    return () => timers.forEach(clearTimeout)
  }, [pet.id, myActions])

  const handleAction = useCallback(async (action: CareAction) => {
    if (cooldowns[action] || actionLoading) return
    setActionLoading(action)
    setActionError('')
    try {
      const meta = CARE_ACTION_META[action]
      // Returns the saved stats (decayed first, then restored) — same as the DB
      const next = await performCareAction(pet.id, action, userId, meta)
      setStats(next)

      // Set cooldown with auto-expiry timer
      setCooldowns(prev => ({ ...prev, [action]: true }))
      setTimeout(() => {
        setCooldowns(prev => ({ ...prev, [action]: false }))
      }, meta.cooldownMinutes * 60000)

      // Send push notification to partner
      const supabase = createClient()
      const { data: members } = await supabase
        .from('couple_members')
        .select('profile_id')
        .eq('couple_id', coupleId)
      const partnerId = members?.find(m => m.profile_id !== userId)?.profile_id
      if (partnerId) {
        fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientId: partnerId,
            title: `${pet.name} dirawat! 🐾`,
            body: `Pasanganmu baru saja ${CARE_ACTION_META[action].label.toLowerCase()} ${pet.name}`,
            url: '/app/pet',
            kind: 'activity',
          }),
        }).catch(() => {})
      }
    } catch (e) {
      const onCooldown = e instanceof Error && e.message.includes('cooldown')
      if (onCooldown) setCooldowns(prev => ({ ...prev, [action]: true }))
      setActionError(onCooldown
        ? `${CARE_ACTION_META[action].label} baru saja dilakukan, tunggu sebentar ya.`
        : 'Gagal merawat, coba lagi ya.')
    } finally {
      setActionLoading(null)
    }
  }, [cooldowns, actionLoading, pet.id, pet.name, userId, coupleId])

  // Show first 3 of user's assigned actions as quick actions
  const availableQuickActions = (myActions as CareAction[]).slice(0, 3)

  return (
    <div className="relative h-[100dvh] overflow-hidden">
      {/* Sky */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #BFE5FF 0%, #DCF0FF 35%, #F5EDE0 68%, #EDD8BC 100%)' }} />

      {/* Sun */}
      <div className="absolute top-8 right-8 w-8 h-8 rounded-full z-[2]" style={{ background: '#FFD060', boxShadow: '0 0 0 8px rgba(255,208,96,0.18)' }} />

      {/* Clouds */}
      <div className="absolute top-8 left-5 w-12 h-4 rounded-full bg-white/80 z-[2] animate-cloud-drift" />
      <div className="absolute top-6 left-8 w-8 h-5 rounded-full bg-white/80 z-[2] animate-cloud-drift" />
      <div className="absolute top-14 left-[130px] w-9 h-3.5 rounded-full bg-white/80 z-[2] animate-cloud-drift-slow" />

      {/* Header pills */}
      <div className="absolute top-10 left-0 right-0 z-20 flex justify-between items-center px-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 bg-white/90 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/90 shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 text-ink" />
        </button>

        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/90 shadow-sm">
          <div className="w-6 h-6 bg-[#FFD0A8] rounded-full flex items-center justify-center text-sm">
            {pet.pet_type === 'cat' ? '🐱' : '🐶'}
          </div>
          <div>
            <div className="text-[13px] font-semibold text-ink">{pet.name}</div>
            <div className="text-[9px] text-ink-muted font-medium">Lv.{pet.level} · {daysSinceAdopt} hari</div>
          </div>
        </div>

        <button
          onClick={() => router.push('/app/pet/mood')}
          className="flex items-center gap-1.5 bg-white/90 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/90 shadow-sm"
        >
          <div
            className="w-2 h-2 rounded-full animate-mood-pulse"
            style={{ background: moodMeta.color }}
          />
          <span className="text-[11px] font-bold" style={{ color: moodMeta.color }}>
            {moodMeta.label} {mood === 'thriving' ? '✨' : ''}
          </span>
        </button>
      </div>

      {/* Window decoration */}
      <div className="absolute top-40 left-5 w-[52px] h-12 rounded-[10px] border-2 border-white/80 z-[3] overflow-hidden" style={{ background: 'linear-gradient(135deg, #B8DEFF, #DCF0FF)' }}>
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/70 -translate-y-1/2" />
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/70 -translate-x-1/2" />
      </div>

      {/* Shelf */}
      <div className="absolute top-[210px] right-3.5 w-[54px] h-[7px] rounded z-[4]" style={{ background: '#C8966A', boxShadow: '0 2px 5px rgba(0,0,0,0.12)' }} />

      {/* Room interior fade */}
      <div className="absolute bottom-[150px] left-0 right-0 h-[220px] z-[2]" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(253,246,238,0.55) 100%)' }} />

      {/* Room floor */}
      <div className="absolute bottom-0 left-0 right-0 h-[170px] rounded-t-[28px] z-[3]" style={{ background: 'linear-gradient(180deg, #EDCFA8 0%, #E2C090 100%)' }} />

      {/* Carpet */}
      <div className="absolute bottom-[158px] left-1/2 -translate-x-1/2 w-[150px] h-[18px] rounded-[50%] opacity-45 z-[4]" style={{ background: 'linear-gradient(90deg, #E09888, #F0B0A0, #E09888)' }} />

      {/* Plant SVG */}
      <div className="absolute bottom-[158px] right-3 z-[5]">
        <svg width="36" height="54" viewBox="0 0 36 54">
          <rect x="12" y="37" width="12" height="17" rx="4" fill="#C8966A" />
          <rect x="10" y="34" width="16" height="5" rx="2" fill="#B07850" />
          <ellipse cx="18" cy="34" rx="10" ry="8" fill="#7EC4A0" />
          <ellipse cx="10" cy="27" rx="8" ry="7" fill="#5BA882" />
          <ellipse cx="26" cy="27" rx="8" ry="7" fill="#5BA882" />
          <ellipse cx="18" cy="21" rx="7" ry="7" fill="#7EC4A0" />
          <ellipse cx="18" cy="15" rx="5" ry="5" fill="#5BA882" />
        </svg>
      </div>

      {/* Food bowl */}
      <div className="absolute bottom-[162px] left-3.5 z-[5]">
        <svg width="44" height="30" viewBox="0 0 44 30">
          <ellipse cx="22" cy="26" rx="19" ry="4" fill="#C88050" opacity="0.25" />
          <ellipse cx="22" cy="22" rx="18" ry="5.5" fill="#E8A878" />
          <path d="M4 17 Q22 7 40 17 Q38 24 22 24 Q6 24 4 17Z" fill="#F5C898" />
          <ellipse cx="22" cy="16" rx="9" ry="3.5" fill="#C07840" opacity="0.35" />
        </svg>
      </div>

      {/* Sparkles (only when thriving) */}
      {mood === 'thriving' && (
        <>
          <div className="absolute top-[92px] left-14 text-sm z-[7] pointer-events-none animate-sparkle">✨</div>
          <div className="absolute top-[100px] right-[52px] text-sm z-[7] pointer-events-none animate-sparkle" style={{ animationDelay: '0.9s' }}>⭐</div>
          <div className="absolute top-[78px] left-[140px] text-sm z-[7] pointer-events-none animate-sparkle" style={{ animationDelay: '1.8s' }}>✨</div>
        </>
      )}

      {/* Cat shadow */}
      <div className="absolute bottom-[156px] left-1/2 -translate-x-1/2 w-[76px] h-[11px] rounded-[50%] z-[4] animate-cat-float" style={{ background: 'rgba(160,120,80,0.18)', filter: 'blur(3px)' }} />

      {/* Pet */}
      <div className="absolute bottom-[158px] left-1/2 -translate-x-1/2 w-[140px] h-[140px] z-[6] animate-cat-float">
        {pet.pet_type === 'cat' ? <PetSvgCat /> : <PetSvgDog />}
      </div>

      {/* Action feedback */}
      {actionError && (
        <div className="absolute bottom-[120px] left-4 right-4 z-[10] rounded-xl bg-white/95 px-3 py-2 text-center text-[11px] font-semibold text-rose shadow-sm">
          {actionError}
        </div>
      )}

      {/* Quick action buttons */}
      {/* Equal columns, emoji above the label: four buttons in a row overflowed
          both edges on 360px phones (centered flex row with no wrapping). */}
      <div className="absolute bottom-[72px] left-0 right-0 flex gap-2 px-3.5 z-[8]">
        {availableQuickActions.map((action, i) => {
          const isOnCooldown = cooldowns[action]
          const isLoading = actionLoading === action
          const disabled = isOnCooldown || isLoading || !cooldownsLoaded
          return (
            <button
              key={action}
              onClick={() => handleAction(action)}
              disabled={disabled}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[14px] px-1.5 py-2 border transition-transform ${
                i === 0 && !isOnCooldown && cooldownsLoaded
                  ? 'bg-rose border-rose text-white shadow-[0_4px_12px_rgba(240,107,107,0.3)]'
                  : isOnCooldown || !cooldownsLoaded
                    ? 'bg-gray-100 border-gray-200 opacity-50'
                    : 'bg-white border-[#F0E4D8] shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
              } ${!disabled ? 'hover:-translate-y-0.5' : ''}`}
            >
              <span className="text-[15px]">{isLoading ? '⏳' : ACTION_EMOJIS[action]}</span>
              <span className={`whitespace-nowrap text-[10px] font-bold ${i === 0 && !isOnCooldown && cooldownsLoaded ? 'text-white' : 'text-ink'}`}>
                {CARE_ACTION_META[action].label}
              </span>
            </button>
          )
        })}
        <button
          onClick={() => router.push('/app/pet/care')}
          className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[14px] px-1.5 py-2 border border-[#F0E4D8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-transform"
        >
          <span className="text-[15px]">📋</span>
          <span className="whitespace-nowrap text-[10px] font-bold text-ink">Semua</span>
        </button>
      </div>

      {/* Mood bars strip */}
      <button
        onClick={() => router.push('/app/pet/mood')}
        className="absolute bottom-0 left-0 right-0 backdrop-blur-xl z-[9] px-[18px] py-2.5 pb-4 border-t border-[rgba(232,218,208,0.7)]"
        style={{ background: 'rgba(255,252,248,0.97)' }}
      >
        <div className="flex gap-3">
          {[
            { label: 'Lapar', value: stats.hunger, gradient: 'linear-gradient(90deg, #F09060, #F06B6B)' },
            { label: 'Happy', value: stats.happiness, gradient: 'linear-gradient(90deg, #F06B6B, #F090B0)' },
            { label: 'Bersih', value: stats.cleanliness, gradient: 'linear-gradient(90deg, #7EC4A0, #5BA882)' },
          ].map(bar => (
            <div key={bar.label} className="flex-1">
              <div className="flex justify-between text-[9px] font-bold text-ink-muted uppercase tracking-wider mb-1.5">
                <span>{bar.label}</span>
                <span className="text-ink">{bar.value}%</span>
              </div>
              <div className="h-1.5 bg-[#F0E8E0] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-800"
                  style={{ width: `${bar.value}%`, background: bar.gradient }}
                />
              </div>
            </div>
          ))}
        </div>
      </button>

      {/* CSS Animations */}
      <style jsx global>{`
        @keyframes catFloat {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-7px); }
        }
        @keyframes tailSway {
          0%, 100% { transform: rotate(-18deg); }
          50% { transform: rotate(18deg); }
        }
        @keyframes eyeBlink {
          0%, 88%, 100% { transform: scaleY(1); }
          93% { transform: scaleY(0.08); }
        }
        @keyframes sparkleAnim {
          0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); }
          50% { opacity: 1; transform: scale(1) rotate(200deg); }
        }
        @keyframes moodPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
        @keyframes cloudDrift {
          0% { transform: translateX(0); }
          100% { transform: translateX(22px); }
        }
        .animate-cat-float { animation: catFloat 3.5s ease-in-out infinite; }
        .animate-tail-sway { animation: tailSway 2.6s ease-in-out infinite; }
        .animate-eye-blink { animation: eyeBlink 4.5s infinite; }
        .animate-sparkle { animation: sparkleAnim 2.5s infinite; }
        .animate-mood-pulse { animation: moodPulse 2s infinite; }
        .animate-cloud-drift { animation: cloudDrift 9s ease-in-out infinite alternate; }
        .animate-cloud-drift-slow { animation: cloudDrift 11s ease-in-out infinite alternate; animation-delay: 2s; }
      `}</style>
    </div>
  )
}
