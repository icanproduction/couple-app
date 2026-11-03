'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { MOOD_META, type PetMood } from '@/types/pet'
import { getDecayedStats, calculateMood } from '@/lib/pet'

interface Props {
  pet: { id: string; name: string; pet_type: string }
  moodState: { hunger: number; happiness: number; cleanliness: number; mood: string; updated_at: string | null } | null
}

const MOOD_EMOJIS: Record<PetMood, string> = {
  thriving: '✨', happy: '😊', neutral: '😐', lonely: '🥺', sad: '😔',
}

const MOOD_RING_GRADIENTS: Record<PetMood, string> = {
  thriving: 'linear-gradient(135deg, #A0E4C0, #70C898)',
  happy: 'linear-gradient(135deg, #FFE898, #F8C840)',
  neutral: '#EDE5DC',
  lonely: 'linear-gradient(135deg, #FFD0A8, #F0A060)',
  sad: 'linear-gradient(135deg, #C0D0E8, #A0B0D0)',
}

const MOOD_RING_SHADOWS: Record<PetMood, string> = {
  thriving: '0 10px 30px rgba(120,200,168,0.28)',
  happy: '0 10px 30px rgba(248,200,64,0.28)',
  neutral: '0 10px 30px rgba(200,190,180,0.28)',
  lonely: '0 10px 30px rgba(240,160,96,0.28)',
  sad: '0 10px 30px rgba(160,176,208,0.28)',
}

// Matches the model in lib/pet: mood = average of the three needs, each need
// drops DECAY_PER_HOUR (1.25) points per hour without care.
const MOOD_STATES: { mood: PetMood; trigger: string }[] = [
  { mood: 'thriving', trigger: 'Semua kebutuhan hampir penuh — rajin dirawat berdua' },
  { mood: 'happy', trigger: 'Kebutuhannya terpenuhi' },
  { mood: 'neutral', trigger: 'Ada kebutuhan yang mulai menurun' },
  { mood: 'lonely', trigger: 'Sekitar 1 hari tidak dirawat' },
  { mood: 'sad', trigger: 'Sekitar 2 hari tidak dirawat — butuh kalian berdua' },
]

export default function PetMoodScreen({ pet, moodState }: Props) {
  const router = useRouter()

  const decayed = moodState && moodState.updated_at
    ? getDecayedStats({ ...moodState, updated_at: moodState.updated_at })
    : moodState
      ? { hunger: moodState.hunger, happiness: moodState.happiness, cleanliness: moodState.cleanliness, mood: calculateMood(moodState.hunger, moodState.happiness, moodState.cleanliness) }
      : { hunger: 70, happiness: 70, cleanliness: 70, mood: 'happy' as PetMood }

  const currentMood = decayed.mood
  const meta = MOOD_META[currentMood]

  return (
    <div className="min-h-[100dvh] bg-cream animate-fade-in">
      {/* Top */}
      <div className="px-5 pt-5 pb-6 text-center" style={{ background: 'linear-gradient(160deg, #E0F0FF 0%, #F4F8FF 100%)' }}>
        <div className="flex items-center mb-4">
          <button onClick={() => router.back()} className="p-1">
            <ArrowLeft className="w-5 h-5 text-ink" />
          </button>
        </div>

        <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#8AAAD0] mb-3.5">
          Status {pet.name} Hari Ini
        </div>

        {/* Big mood ring */}
        <div
          className="w-[108px] h-[108px] rounded-full mx-auto mb-3.5 flex flex-col items-center justify-center relative"
          style={{ background: MOOD_RING_GRADIENTS[currentMood], boxShadow: MOOD_RING_SHADOWS[currentMood] }}
        >
          <div className="absolute -inset-1.5 rounded-full border-2" style={{ borderColor: `${meta.color}40` }} />
          <div className="text-[40px]">{MOOD_EMOJIS[currentMood]}</div>
          <div className="text-[10px] font-extrabold text-white uppercase tracking-wider mt-0.5">
            {meta.label}
          </div>
        </div>

        <h1 className="text-[28px] font-light text-ink mb-1" style={{ fontFamily: 'serif' }}>
          {meta.label}
        </h1>
        <p className="text-xs text-ink-muted leading-relaxed max-w-[220px] mx-auto">
          {meta.description}
        </p>
      </div>

      {/* Mood timeline */}
      <div className="px-4 pt-4">
        <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-ink-muted mb-3">
          Semua Mood States
        </div>

        <div className="flex flex-col">
          {MOOD_STATES.map((state, i) => {
            const isActive = state.mood === currentMood
            const stateMeta = MOOD_META[state.mood]
            return (
              <div key={state.mood} className="flex items-center gap-3 py-2.5 relative">
                {/* Connector line */}
                {i < MOOD_STATES.length - 1 && (
                  <div className="absolute left-[17px] top-10 w-0.5 bg-[#F0E8E0] z-0" style={{ height: 'calc(100% - 6px)' }} />
                )}

                {/* Dot */}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-[17px] flex-shrink-0 z-[1] ${isActive ? 'shadow-[0_0_0_6px_rgba(120,200,168,0.18)]' : ''}`}
                  style={{ background: MOOD_RING_GRADIENTS[state.mood] }}
                >
                  {MOOD_EMOJIS[state.mood]}
                </div>

                {/* Text */}
                <div className="flex-1">
                  <div className="text-[13px] font-bold text-ink">{stateMeta.label}</div>
                  <div className="text-[10px] text-ink-muted mt-0.5 leading-snug">{state.trigger}</div>
                </div>

                {/* Current chip */}
                {isActive && (
                  <div className="text-[9px] font-extrabold bg-[#E0F5EC] text-[#3D9E6A] px-2.5 py-1 rounded-[9px] uppercase tracking-wider">
                    Sekarang
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Needs grid */}
      <div className="px-4 pt-3.5 pb-6">
        <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-ink-muted mb-3">
          Kebutuhan Saat Ini
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { emoji: '🍖', name: 'Makan', value: decayed.hunger, gradient: 'linear-gradient(90deg, #F09060, #F06B6B)' },
            { emoji: '💛', name: 'Happy', value: decayed.happiness, gradient: 'linear-gradient(90deg, #F06B6B, #F090B0)' },
            { emoji: '🫧', name: 'Bersih', value: decayed.cleanliness, gradient: 'linear-gradient(90deg, #7EC4A0, #5BA882)' },
          ].map(need => (
            <div key={need.name} className="bg-white rounded-[14px] p-2.5 text-center border border-[#F0E8E0]">
              <div className="text-xl mb-1.5">{need.emoji}</div>
              <div className="text-[9px] font-bold text-ink-muted uppercase tracking-wider mb-1.5">{need.name}</div>
              <div className="h-[5px] bg-[#F0E8E0] rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-800"
                  style={{ width: `${need.value}%`, background: need.gradient }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
