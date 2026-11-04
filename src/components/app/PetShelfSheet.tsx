'use client'

// Every item with its level. Earned ones show their live value ("Letter rack:
// 1 letter still sealed"); the rest are silhouettes with the level that brings them.
import {
  AppWindow, Bed, CalendarDays, Crown, Glasses, Image as ImageIcon, Lightbulb, Lock, Mail, MapPinned,
  Milk, Package, RectangleHorizontal, Ribbon, Sprout, Star, Tag, type LucideIcon,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { PET_RULES, type PetItemKey, type PetStatus } from '@/types/pet'
import type { RoomData } from '@/components/pet/api'
import { itemDetail, type Sky } from '@/components/pet/copy'

const ICONS: Record<PetItemKey, LucideIcon> = {
  bed: Bed,
  collar_tag: Tag,
  jar: Milk,
  photo_frame: ImageIcon,
  scarf: Ribbon,
  letter_rack: Mail,
  plant: Sprout,
  wall_calendar: CalendarDays,
  window: AppWindow,
  hat: Crown,
  rug: RectangleHorizontal,
  fairy_lights: Lightbulb,
  map_board: MapPinned,
  toy_chest: Package,
  glasses: Glasses,
}

interface Props {
  open: boolean
  onClose: () => void
  status: PetStatus
  room: RoomData
  sky: Sky
  initials: string
  solo: boolean
  /** Levels just celebrated: their items get a "New" tag. */
  fresh?: number[]
}

export default function PetShelfSheet({ open, onClose, status, room, sky, initials, solo, fresh = [] }: Props) {
  const level = status.level
  const ctx = { pet: status.name, level, glowing: status.mood === 'glowing', sky, initials, solo }
  const starFrom = PET_RULES.extras.star_from_level
  const stars = Math.max(0, level - starFrom + 1)

  return (
    <Modal open={open} onClose={onClose} title="Shelf">
      <p className="-mt-2 mb-4 text-sm text-ink-muted">One new thing every level. Nothing here ever goes away.</p>
      <ul className="space-y-2">
        {PET_RULES.items.map((item) => {
          const earned = level >= item.level
          const Icon = ICONS[item.key]
          const d = earned ? itemDetail(item.key, room, ctx) : null
          const isNew = earned && fresh.includes(item.level)
          return (
            <li
              key={item.key}
              data-item={item.key}
              data-earned={earned ? 'yes' : 'no'}
              className={cn(
                'flex items-center gap-3 rounded-2xl border p-3',
                earned ? 'border-border bg-white' : 'border-dashed border-border bg-cream/60',
                isNew && 'border-rose/40',
              )}
            >
              <span className={cn('relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', earned ? 'bg-gold/15 text-yellow-700' : 'bg-ink/5 text-ink-muted/40')}>
                <Icon className="h-5 w-5" aria-hidden />
                {!earned && <Lock className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-white p-0.5 text-ink-muted" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={cn('truncate text-sm font-semibold', earned ? 'text-ink' : 'text-ink-muted')}>
                    {earned ? item.label : 'Still wrapped'}
                  </span>
                  {isNew && <span className="shrink-0 rounded-full bg-rose px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">New</span>}
                </span>
                <span className="block break-words text-xs leading-snug text-ink-muted">
                  {d ? d.value : `Level ${item.level}`}
                </span>
              </span>
              {earned && <span className="shrink-0 text-[11px] font-medium text-ink-muted">Lv {item.level}</span>}
            </li>
          )
        })}
        <li
          data-item="star"
          data-earned={stars > 0 ? 'yes' : 'no'}
          className={cn('flex items-center gap-3 rounded-2xl border p-3', stars > 0 ? 'border-border bg-white' : 'border-dashed border-border bg-cream/60')}
        >
          <span className={cn('relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', stars > 0 ? 'bg-gold/15 text-yellow-700' : 'bg-ink/5 text-ink-muted/40')}>
            <Star className="h-5 w-5" aria-hidden />
            {stars === 0 && <Lock className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-white p-0.5 text-ink-muted" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn('block text-sm font-semibold', stars > 0 ? 'text-ink' : 'text-ink-muted')}>
              {stars > 0 ? 'Stars on the wall' : 'Still wrapped'}
            </span>
            <span className="block text-xs leading-snug text-ink-muted">
              {stars > 0 ? itemDetail('star', room, ctx).value : `Level ${starFrom}, then one more every level, and a new scarf and hat color every 5 levels`}
            </span>
          </span>
          {stars > 0 && <span className="shrink-0 text-[11px] font-medium text-ink-muted">Lv {starFrom}+</span>}
        </li>
      </ul>
    </Modal>
  )
}
