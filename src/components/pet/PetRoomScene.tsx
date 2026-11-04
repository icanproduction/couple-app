'use client'

// The pet's room. Every item the level has earned is drawn, and the living
// ones show the couple's own data (Jar marbles, latest Moment photo, sealed
// letters, plant leaves, days to the next plan, the Jakarta sky, map pins).
// Tapping an item shows its value in a strip at the bottom of the room.
import Link from 'next/link'
import { useState } from 'react'
import { ChevronRight, X } from 'lucide-react'
import type { Gesture, PetStatus } from '@/types/pet'
import { cn } from '@/lib/utils'
import PetSvgCat from '@/components/app/PetSvgCat'
import PetSvgDog from '@/components/app/PetSvgDog'
import SignedPhoto from '@/components/moments/SignedPhoto'
import type { RoomData } from './api'
import { itemDetail, type PetPose, type RoomItemKey, type Sky } from './copy'

interface Props {
  status: PetStatus
  pose: PetPose
  room: RoomData
  sky: Sky
  initials: string
  solo: boolean
  /** Which side the pet sits on while comforting someone. */
  lean: 'left' | 'right' | null
  gesture: Gesture | null
  gestureKey: number
  onPetTap: () => void
  /** Floating "+5", hearts. */
  children?: React.ReactNode
}

function ItemButton({ k, label, onTap, className, style, children }: { k: RoomItemKey; label: string; onTap: (k: RoomItemKey) => void; className: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <button
      type="button"
      data-item={k}
      aria-label={label}
      style={style}
      onClick={() => onTap(k)}
      className={cn('absolute block rounded-lg transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose', className)}
    >
      {children}
    </button>
  )
}

function WindowArt({ sky }: { sky: Sky }) {
  const grad = sky === 'night' ? ['#24305E', '#3E4F8A'] : sky === 'sunset' ? ['#F59E7A', '#FFD59A'] : ['#9ED8FF', '#E3F4FF']
  return (
    <svg viewBox="0 0 80 70" className="h-full w-full">
      <defs>
        <linearGradient id={`sky-${sky}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={grad[0]} />
          <stop offset="1" stopColor={grad[1]} />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="74" height="60" rx="4" fill={`url(#sky-${sky})`} />
      {sky === 'night' ? (
        <g fill="#FFF3C4">
          <path d="M58 14 a7 7 0 1 0 5 12 a5.5 5.5 0 1 1 -5 -12 z" />
          <circle cx="18" cy="16" r="1" /><circle cx="30" cy="26" r="0.8" /><circle cx="44" cy="12" r="1" /><circle cx="14" cy="34" r="0.7" />
        </g>
      ) : (
        <circle cx={sky === 'sunset' ? 40 : 58} cy={sky === 'sunset' ? 46 : 18} r={sky === 'sunset' ? 9 : 7} fill={sky === 'sunset' ? '#FF8A5C' : '#FFD060'} />
      )}
      {/* Jakarta skyline */}
      <g fill={sky === 'night' ? '#1A2344' : sky === 'sunset' ? '#B5654F' : '#8FB4CF'} opacity="0.9">
        <rect x="6" y="44" width="8" height="19" /><rect x="16" y="36" width="7" height="27" /><rect x="25" y="48" width="9" height="15" />
        <path d="M38 63 V40 l3 -8 l3 8 V63 z" /><rect x="48" y="42" width="8" height="21" /><rect x="58" y="50" width="12" height="13" />
      </g>
      {sky === 'night' && (
        <g fill="#FFE59A" opacity="0.8">
          <rect x="18" y="40" width="1.6" height="1.6" /><rect x="50" y="46" width="1.6" height="1.6" /><rect x="8" y="50" width="1.6" height="1.6" />
        </g>
      )}
      <rect x="3" y="3" width="74" height="60" rx="4" fill="none" stroke="#FFFFFF" strokeWidth="4" />
      <path d="M40 3 V63 M3 33 H77" stroke="#FFFFFF" strokeWidth="3" />
      <rect x="0" y="62" width="80" height="6" rx="2" fill="#E6D2B8" />
    </svg>
  )
}

function CalendarArt({ days }: { days: number | null }) {
  return (
    <svg viewBox="0 0 60 66" className="h-full w-full">
      <rect x="4" y="8" width="52" height="54" rx="6" fill="#FFFFFF" stroke="#EDE6DE" strokeWidth="2" />
      <rect x="4" y="8" width="52" height="15" rx="6" fill="#F06B6B" />
      <rect x="4" y="16" width="52" height="7" fill="#F06B6B" />
      <circle cx="18" cy="8" r="3" fill="#9B8F8F" /><circle cx="42" cy="8" r="3" fill="#9B8F8F" />
      <text x="30" y="47" textAnchor="middle" fontSize={days !== null && days > 9 ? 20 : 24} fontWeight="800" fill="#2D2424" fontFamily="system-ui, sans-serif">
        {days === null ? '' : days}
      </text>
      <text x="30" y="57" textAnchor="middle" fontSize="7" fill="#9B8F8F" fontFamily="system-ui, sans-serif">
        {days === null ? '' : days === 1 ? 'day' : 'days'}
      </text>
    </svg>
  )
}

function JarArt({ marbles }: { marbles: number }) {
  const colors = ['#F06B6B', '#E8C078', '#7EC4A0', '#8FA8E8', '#C49BE0']
  const shown = Math.min(marbles, 18)
  return (
    <svg viewBox="0 0 40 50" className="h-full w-full">
      <rect x="10" y="2" width="20" height="7" rx="2" fill="#C8955A" />
      <path d="M8 10 H32 Q36 12 36 18 V42 Q36 48 30 48 H10 Q4 48 4 42 V18 Q4 12 8 10 Z" fill="#E8F4FA" fillOpacity="0.7" stroke="#BFD9E6" strokeWidth="1.5" />
      {Array.from({ length: shown }, (_, i) => {
        const row = Math.floor(i / 4)
        const col = i % 4
        return <circle key={i} cx={10 + col * 6.5 + (row % 2) * 3} cy={43 - row * 5.5} r="2.8" fill={colors[i % colors.length]} />
      })}
    </svg>
  )
}

function LetterRackArt({ letters }: { letters: number }) {
  const shown = Math.min(letters, 3)
  return (
    <svg viewBox="0 0 50 44" className="h-full w-full">
      {Array.from({ length: shown }, (_, i) => (
        <g key={i} transform={`translate(${8 + i * 9} ${4 + i * 2}) rotate(${-8 + i * 8} 12 12)`}>
          <rect width="24" height="17" rx="2" fill="#FFF8F0" stroke="#E8C078" strokeWidth="1.2" />
          <path d="M0 1 L12 10 L24 1" stroke="#E8C078" strokeWidth="1.2" fill="none" />
          <circle cx="12" cy="11" r="2" fill="#F06B6B" />
        </g>
      ))}
      <rect x="4" y="24" width="42" height="16" rx="3" fill="#C8955A" />
      <rect x="4" y="24" width="42" height="4" fill="#B07840" />
    </svg>
  )
}

function PlantArt({ leaves }: { leaves: number }) {
  const n = Math.min(Math.max(leaves, 0), 14)
  return (
    <svg viewBox="0 0 50 90" className="h-full w-full">
      <path d="M25 68 C24 50 26 34 25 14" stroke="#5EAE85" strokeWidth="2.4" fill="none" />
      {Array.from({ length: n }, (_, i) => {
        const y = 62 - i * 3.6
        const left = i % 2 === 0
        return (
          <path key={i} d={left ? `M25 ${y} q-12 -4 -14 -12 q10 0 14 12 z` : `M25 ${y} q12 -4 14 -12 q-10 0 -14 12 z`} fill={i % 3 === 0 ? '#7EC4A0' : '#5EAE85'} />
        )
      })}
      {n === 0 && <circle cx="25" cy="14" r="2.5" fill="#7EC4A0" />}
      <path d="M11 66 H39 L35 88 H15 Z" fill="#E08A6A" />
      <rect x="9" y="64" width="32" height="6" rx="2" fill="#C9735A" />
    </svg>
  )
}

function MapArt({ pins }: { pins: number }) {
  const spots: [number, number][] = [[12, 14], [30, 10], [46, 18], [20, 26], [38, 28], [52, 30], [10, 34], [28, 36], [44, 8], [56, 12], [16, 8], [34, 20], [50, 24], [24, 18], [40, 34], [8, 22], [58, 36], [20, 38], [32, 30], [48, 36]]
  return (
    <svg viewBox="0 0 66 46" className="h-full w-full">
      <rect x="2" y="2" width="62" height="42" rx="4" fill="#D9B48A" stroke="#B98A52" strokeWidth="2.5" />
      <path d="M8 30 Q20 12 32 24 T58 16" stroke="#F0D49E" strokeWidth="3" fill="none" opacity="0.8" />
      {spots.slice(0, Math.min(pins, 20)).map(([x, y], i) => (
        <g key={i}><circle cx={x} cy={y} r="2.6" fill={i % 2 ? '#F06B6B' : '#8FA8E8'} /><circle cx={x - 0.8} cy={y - 0.8} r="0.8" fill="#fff" /></g>
      ))}
    </svg>
  )
}

function ToyChestArt({ toys }: { toys: number }) {
  return (
    <svg viewBox="0 0 60 50" className="h-full w-full">
      {toys > 0 && <circle cx="22" cy="14" r="7" fill="#7EC4A0" />}
      {toys > 1 && <rect x="32" y="8" width="11" height="11" rx="2" fill="#E8C078" transform="rotate(12 37 13)" />}
      {toys > 2 && <path d="M44 18 l4 -9 l4 9 z" fill="#F06B6B" />}
      <rect x="4" y="18" width="52" height="30" rx="4" fill="#B07840" />
      <rect x="4" y="18" width="52" height="8" rx="3" fill="#C8955A" />
      <rect x="26" y="24" width="8" height="7" rx="1.5" fill="#E8C078" />
    </svg>
  )
}

function PhotoArt({ room }: { room: RoomData }) {
  const m = room.latestMoment
  return (
    <span className="block h-full w-full rounded-md border-[3px] border-white bg-rose-50 shadow-card">
      {m?.photoUrl && m.photoPath ? (
        <SignedPhoto src={m.photoUrl} path={m.photoPath} alt="" className="h-full w-full rounded-[3px] object-cover" />
      ) : (
        <svg viewBox="0 0 40 40" className="h-full w-full p-2 text-rose/50"><path fill="currentColor" d="M20 33l-2-1.8C10.8 24.7 6 20.4 6 15.1 6 10.8 9.4 7.4 13.7 7.4c2.4 0 4.8 1.1 6.3 2.9 1.5-1.8 3.9-2.9 6.3-2.9 4.3 0 7.7 3.4 7.7 7.7 0 5.3-4.8 9.6-12 16.1L20 33z" /></svg>
      )}
    </span>
  )
}

function Lights({ on }: { on: boolean }) {
  const colors = ['#F06B6B', '#E8C078', '#7EC4A0', '#8FA8E8', '#C49BE0']
  return (
    <svg viewBox="0 0 300 26" preserveAspectRatio="none" className="h-full w-full">
      <path d="M0 4 Q75 22 150 6 T300 4" stroke="#7A6A5A" strokeWidth="1.2" fill="none" />
      {Array.from({ length: 13 }, (_, i) => {
        const x = 12 + i * 23
        const t = x / 300
        const y = 4 + Math.sin(t * Math.PI * 2) * -7 + 8
        return (
          <circle key={i} cx={x} cy={y} r="3.4" fill={on ? colors[i % colors.length] : '#D8CFC4'}
            className={on ? 'pa-lights' : undefined} style={on ? { animationDelay: `${(i % 4) * 0.3}s` } : undefined} />
        )
      })}
    </svg>
  )
}

const STAR_SPOTS: [number, number][] = [[30, 6], [70, 9], [36, 20], [64, 22], [24, 30], [76, 32], [46, 4], [56, 30], [16, 14], [84, 16]]

export default function PetRoomScene({ status, pose, room, sky, initials, solo, lean, gesture, gestureKey, onPetTap, children }: Props) {
  const [open, setOpen] = useState<RoomItemKey | null>(null)
  const level = status.level
  const has = (lv: number) => level >= lv
  const dark = sky === 'night'
  const glowing = status.mood === 'glowing' && status.hatched
  const stars = Math.max(0, level - 15)
  const ctx = { pet: status.name, level, glowing, sky, initials, solo }
  const detail = open ? itemDetail(open, room, ctx) : null
  const tap = (k: RoomItemKey) => setOpen((cur) => (cur === k ? null : k))
  const label = (k: RoomItemKey) => {
    const d = itemDetail(k, room, ctx)
    return `${d.title}: ${d.value}`
  }
  const Pet = status.pet_type === 'dog' ? PetSvgDog : PetSvgCat
  const petLeft = lean === 'right' ? '60%' : lean === 'left' ? '40%' : '50%'

  return (
    <div
      // isolate: the floats and the item strip stay inside the room's own
      // stacking context, so they never paint over the bottom nav.
      className={cn('pet-anim relative isolate h-[300px] w-full overflow-hidden rounded-3xl border border-border', dark ? 'bg-[#3B3555]' : 'bg-[#FBEFE3]')}
      data-sky={sky}
    >
      {/* Wall and floor */}
      <div className={cn('absolute inset-x-0 top-0 h-[66%]', dark ? 'bg-gradient-to-b from-[#3E3A5E] to-[#4A4468]' : 'bg-gradient-to-b from-[#FFF4E8] to-[#FBE9D6]')} />
      <div className={cn('absolute inset-x-0 bottom-0 h-[34%]', dark ? 'bg-[#5A4A5E]' : 'bg-[#EBD3B5]')} />
      <div className={cn('absolute inset-x-0 top-[66%] h-1.5', dark ? 'bg-[#6A5A6E]' : 'bg-[#DCC09C]')} />

      {has(12) && (
        <ItemButton k="fairy_lights" label={label('fairy_lights')} onTap={tap} className="left-0 right-0 top-0 h-7 rounded-none">
          <Lights on={glowing} />
        </ItemButton>
      )}

      {stars > 0 && (
        // Ambient decoration only: spread across the wall, a tap target here
        // covered the window, frame and calendar. The Shelf still lists Stars.
        <div aria-hidden="true" data-item="star" className="pointer-events-none absolute inset-x-[8%] top-[4%] h-[34%]">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full">
            {STAR_SPOTS.slice(0, Math.min(stars, STAR_SPOTS.length)).map(([x, y], i) => (
              <path key={i} className="pa-twinkle" style={{ animationDelay: `${i * 0.4}s` }} fill="#E8C078"
                d={`M${x} ${y - 3} L${x + 0.9} ${y - 0.9} L${x + 3} ${y} L${x + 0.9} ${y + 0.9} L${x} ${y + 3} L${x - 0.9} ${y + 0.9} L${x - 3} ${y} L${x - 0.9} ${y - 0.9} Z`} />
            ))}
          </svg>
        </div>
      )}

      {has(9) && (
        <ItemButton k="window" label={label('window')} onTap={tap} className="left-1/2 top-[9%] h-[30%] w-[30%] -translate-x-1/2">
          <WindowArt sky={sky} />
        </ItemButton>
      )}

      {has(4) && (
        <ItemButton k="photo_frame" label={label('photo_frame')} onTap={tap} className="left-[6%] top-[11%] h-[22%] w-[19%] -rotate-3">
          <PhotoArt room={room} />
        </ItemButton>
      )}

      {has(8) && (
        <ItemButton k="wall_calendar" label={label('wall_calendar')} onTap={tap} className="right-[6%] top-[8%] h-[24%] w-[17%]">
          <CalendarArt days={room.nextEvent?.days ?? null} />
        </ItemButton>
      )}

      {has(13) && (
        <ItemButton k="map_board" label={label('map_board')} onTap={tap} className="left-[5%] top-[38%] h-[17%] w-[22%]">
          <MapArt pins={room.mapPins ?? 0} />
        </ItemButton>
      )}

      {/* Wall shelf for the jar and the letter rack */}
      {(has(3) || has(6)) && <div className={cn('absolute right-[4%] top-[53%] h-1.5 w-[30%] rounded-full', dark ? 'bg-[#7A6A7E]' : 'bg-[#C8955A]')} />}
      {has(6) && (
        <ItemButton k="letter_rack" label={label('letter_rack')} onTap={tap} className="right-[17%] top-[40%] h-[13.5%] w-[15%]">
          <LetterRackArt letters={room.lettersSealed ?? 0} />
        </ItemButton>
      )}
      {has(3) && (
        <ItemButton k="jar" label={label('jar')} onTap={tap} className="right-[6%] top-[37%] h-[16.5%] w-[10%]">
          <JarArt marbles={room.jarNotesThisMonth ?? 0} />
        </ItemButton>
      )}

      {has(11) && (
        <ItemButton k="rug" label={label('rug')} onTap={tap} className="bottom-[3%] left-1/2 h-[16%] w-[66%] -translate-x-1/2 rounded-[50%]">
          <span className={cn('block h-full w-full rounded-[50%] border-4 border-dashed', dark ? 'border-[#8C7C9E] bg-[#6E5E80]' : 'border-[#F5C0A8] bg-[#F7D3C0]')} />
        </ItemButton>
      )}

      {has(14) && (
        <ItemButton k="toy_chest" label={label('toy_chest')} onTap={tap} className="bottom-[6%] left-[3%] h-[17%] w-[18%]">
          <ToyChestArt toys={room.gamesThisMonth ?? 0} />
        </ItemButton>
      )}

      {has(7) && (
        <ItemButton k="plant" label={label('plant')} onTap={tap} className="bottom-[6%] right-[3%] h-[34%] w-[14%]">
          <PlantArt leaves={room.bothHiDaysThisMonth ?? 0} />
        </ItemButton>
      )}

      {/* Bed and bowl (level 1): a cushion under the pet, the bowl beside it */}
      {status.hatched && (
        <ItemButton k="bed" label={label('bed')} onTap={tap} className="bottom-[3%] h-[15%] w-[52%] -translate-x-1/2 rounded-[50%] transition-[left] duration-700" style={{ left: petLeft }}>
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-full w-full">
            <ellipse cx="50" cy="17" rx="49" ry="12.5" fill={dark ? '#4E5C8A' : '#8FA8E8'} />
            <ellipse cx="50" cy="13" rx="43" ry="9" fill={dark ? '#62709E' : '#A9BCE8'} />
            <path d="M14 13 Q50 22 86 13" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.5" fill="none" />
          </svg>
        </ItemButton>
      )}
      {status.hatched && (
        <span aria-hidden className="absolute bottom-[5%] left-[13%] block h-[7%] w-[11%]">
          <svg viewBox="0 0 40 18" className="h-full w-full">
            <path d="M3 5 H37 L33 17 H7 Z" fill="#F06B6B" />
            <ellipse cx="20" cy="5" rx="17" ry="3.5" fill="#F59090" />
            <ellipse cx="20" cy="4.5" rx="12" ry="2" fill="#D4A05C" />
          </svg>
        </span>
      )}

      {/* The pet */}
      <button
        type="button"
        onClick={onPetTap}
        aria-label={`Pat ${status.name}`}
        className="absolute bottom-[5%] h-[64%] w-[46%] -translate-x-1/2 rounded-3xl transition-[left] duration-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose"
        style={{ left: petLeft }}
      >
        <Pet pose={pose} stage={status.stage} level={level} initials={initials} gesture={gesture} gestureKey={gestureKey}
          className="h-full w-full" />
      </button>

      {dark && <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#1A1530]/25" />}

      {children}

      {detail && (
        <div className="pa-pop-in absolute inset-x-3 bottom-3 z-10 flex items-center gap-2 rounded-2xl bg-white/95 px-3 py-2 shadow-elevated" role="status">
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-ink-muted">{detail.title}</span>
            <span className="block break-words text-[13px] leading-snug text-ink">{detail.value}</span>
          </span>
          {detail.href && (
            <Link href={detail.href} className="flex shrink-0 items-center gap-0.5 rounded-xl bg-rose/10 px-2.5 py-1.5 text-xs font-semibold text-rose">
              {detail.hrefLabel}<ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
          <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
