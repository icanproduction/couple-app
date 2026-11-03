'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock } from 'lucide-react'
import { adoptPet } from '@/lib/pet'
import type { PetType } from '@/types/pet'

interface Props {
  coupleId: string
  userId: string
  partnerId: string | null
}

const PET_OPTIONS = [
  {
    type: 'cat' as PetType,
    name: 'Cat',
    desc: 'Moody, but sweet when you both look after it',
    emoji: '🐱',
    difficulty: 2,
    diffLabel: 'Medium',
    badge: { text: 'Popular', className: 'bg-[#FFE8E8] text-[#C04050]' },
    locked: false,
  },
  {
    type: 'dog' as PetType,
    name: 'Dog',
    desc: 'Full of energy, needs attention every day',
    emoji: '🐶',
    difficulty: 3,
    diffLabel: 'Challenging',
    badge: { text: 'Free', className: 'bg-[#E8F5EE] text-[#3D9E6A]' },
    locked: false,
  },
  {
    type: 'cat' as PetType,
    name: 'Parrot',
    desc: 'Picks up words from the two of you',
    emoji: '🦜',
    difficulty: 1,
    diffLabel: 'Easy',
    badge: { text: 'Rp 29.000', className: 'bg-[#FFF6DC] text-[#906010]' },
    locked: true,
  },
  {
    type: 'cat' as PetType,
    name: 'Fish',
    desc: 'Calm and low pressure, with a tank you can decorate',
    emoji: '🐟',
    difficulty: 0,
    diffLabel: 'Chill',
    badge: { text: 'Rp 19.000', className: 'bg-[#FFF6DC] text-[#906010]' },
    locked: true,
  },
]

export default function PetAdoptScreen({ coupleId, userId, partnerId }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<number>(0)
  const [petName, setPetName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'choose' | 'name'>('choose')

  const selectedPet = PET_OPTIONS[selected]

  const handleAdopt = async () => {
    if (!petName.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      // If the partner adopted at the same moment, adoptPet returns their pet
      // (unique couple_id) and we simply go see it.
      await adoptPet(coupleId, selectedPet.type, petName.trim(), userId, partnerId)
      router.replace('/app/pet')
      router.refresh()
    } catch {
      setError("Couldn't adopt the pet. Try again.")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-cream animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden px-5 pt-6 pb-7 text-center" style={{ background: 'linear-gradient(160deg, #FFE4D0 0%, #FFF2E8 100%)' }}>
        <div className="absolute w-[200px] h-[200px] rounded-full bg-white/25 top-[-80px] left-1/2 -translate-x-1/2" />
        <button onClick={() => router.back()} aria-label="Back" className="absolute top-5 left-4 z-10 p-1.5 rounded-full bg-white/60 backdrop-blur">
          <ArrowLeft className="w-5 h-5 text-ink" />
        </button>
        <div className="text-[56px] relative z-[1] mb-2.5 drop-shadow-md">🐾</div>
        <h1 className="text-2xl font-light text-ink mb-1 relative z-[1]" style={{ fontFamily: 'serif' }}>
          {step === 'choose' ? 'Adopt a pet' : `Name your ${selectedPet.name.toLowerCase()}`}
        </h1>
        <p className="text-xs text-ink-muted relative z-[1]">
          {step === 'choose' ? 'Pick a pet for the two of you' : 'Give it a cute name'}
        </p>
      </div>

      {step === 'choose' ? (
        <>
          {/* Pet cards */}
          <div className="flex-1 p-4 flex flex-col gap-2.5">
            {PET_OPTIONS.map((pet, i) => (
              <button
                key={i}
                onClick={() => !pet.locked && setSelected(i)}
                disabled={pet.locked}
                className={`relative flex items-center gap-3.5 bg-white rounded-[20px] p-3.5 border-2 text-left transition-all ${
                  selected === i ? 'border-rose bg-[#FFF3F3]' : 'border-transparent'
                } ${pet.locked ? 'opacity-60' : 'hover:translate-x-0.5'}`}
              >
                {/* Badge */}
                {/* The lock lives inside the badge so the two never stack on each other */}
                <div className={`absolute top-2.5 right-3 flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-xl uppercase tracking-wider ${pet.badge.className}`}>
                  {pet.locked && <Lock className="h-2.5 w-2.5" aria-hidden />}
                  {pet.badge.text}
                </div>

                {/* Emoji */}
                <div className={`w-[54px] h-[54px] rounded-2xl flex items-center justify-center text-[30px] flex-shrink-0 ${
                  selected === i ? 'bg-[#FFE0E0]' : 'bg-[#FFF0E8]'
                }`}>
                  {pet.emoji}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1 pr-14">
                  <div className="text-sm font-bold text-ink mb-0.5">{pet.name}</div>
                  <div className="text-[11px] text-ink-muted mb-1.5 leading-snug">{pet.desc}</div>
                  <div className="flex items-center gap-0.5">
                    {[0, 1, 2].map(j => (
                      <div key={j} className={`w-[22px] h-1 rounded-sm ${j < pet.difficulty ? 'bg-gold' : 'bg-[#EDE5DC]'}`} />
                    ))}
                    <span className="text-[9px] text-ink-muted ml-1.5 font-medium">{pet.diffLabel}</span>
                  </div>
                </div>

                {/* Selected check */}
                {selected === i && !pet.locked && (
                  <div className="absolute bottom-2.5 right-3 w-[22px] h-[22px] bg-rose rounded-full flex items-center justify-center text-[11px] text-white font-bold">
                    ✓
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* CTA */}
          <div className="px-4 pb-6 pt-3">
            <button
              onClick={() => setStep('name')}
              disabled={PET_OPTIONS[selected].locked}
              className="w-full py-4 rounded-[18px] text-[15px] font-bold text-white shadow-[0_8px_24px_rgba(240,107,107,0.35)] transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #F06B6B 0%, #F08060 100%)' }}
            >
              Pick the {selectedPet.name.toLowerCase()}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Name input step */}
          <div className="flex-1 px-6 pt-8 flex flex-col items-center">
            <div className="text-[80px] mb-6">{selectedPet.emoji}</div>
            <input
              type="text"
              value={petName}
              onChange={e => setPetName(e.target.value)}
              placeholder="Your pet's name..."
              maxLength={20}
              autoFocus
              className="w-full text-center text-2xl font-bold text-ink bg-transparent border-b-2 border-[#F0E4D8] focus:border-rose outline-none pb-3 placeholder:text-ink-muted/40 transition-colors"
            />
            <p className="text-[11px] text-ink-muted mt-3">Up to 20 characters</p>
            {error && <p className="text-xs text-red-500 mt-3 font-medium">{error}</p>}
          </div>

          {/* CTA */}
          <div className="px-4 pb-6 pt-3 space-y-2">
            <button
              onClick={handleAdopt}
              disabled={!petName.trim() || loading}
              className="w-full py-4 rounded-[18px] text-[15px] font-bold text-white shadow-[0_8px_24px_rgba(240,107,107,0.35)] transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #F06B6B 0%, #F08060 100%)' }}
            >
              {loading ? 'Adopting...' : `Adopt ${petName || selectedPet.name}`}
            </button>
            <button
              onClick={() => setStep('choose')}
              className="w-full py-3 text-sm text-ink-muted font-medium"
            >
              ← Pick a different pet
            </button>
          </div>
        </>
      )}
    </div>
  )
}
