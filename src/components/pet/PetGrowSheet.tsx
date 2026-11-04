'use client'

// "How Mochi grows": the only place the sources are listed (spec §4 red team:
// the pet thanks, it never asks). Also says plainly what the daily note reads.
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { PET_RULES } from '@/types/pet'
import { GROWTH_SOURCES, STAGE_LABEL } from './copy'

export default function PetGrowSheet({ open, onClose, petName }: { open: boolean; onClose: () => void; petName: string }) {
  return (
    <Modal open={open} onClose={onClose} title={`How ${petName} grows`}>
      <p className="-mt-2 text-sm leading-relaxed text-ink-light">
        Almost everything you two do in Nanti Kita counts, and nothing ever goes down. Here is what adds warmth.
      </p>

      <h4 className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">Warmth</h4>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-white">
        {GROWTH_SOURCES.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
            <span className="min-w-0 text-ink-light">{s.label}</span>
            <span className="shrink-0 font-semibold text-sage-dark">{s.points}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">
        Each kind counts a few times a day at most, up to {PET_RULES.daily_cap} warmth a day for the two of you.
        Every {PET_RULES.xp_per_level} warmth is a new level, and every level brings something new for the room.
      </p>

      <h4 className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">Growing up</h4>
      <p className="text-sm leading-relaxed text-ink-light">
        {PET_RULES.stages.map((s, i) => {
          const next = PET_RULES.stages[i + 1]
          const range = next ? `levels ${s.from_level} to ${next.from_level - 1}` : `level ${s.from_level} and up`
          return `${STAGE_LABEL[s.key]} (${range})`
        }).join(', ')}.
        {' '}On quiet days {petName} naps, and anything you two do here wakes it up.
      </p>

      <h4 className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">The daily note</h4>
      <p className="text-sm leading-relaxed text-ink-light">
        Each morning {petName} writes one short note with Claude by Anthropic. Claude gets your first names, counts of what
        you did this week, the titles of your Moments, Bucket List items and plans, and today&apos;s mood labels. It never gets
        letters, Jar notes, answers, comments, mood notes or money amounts.
        {' '}<Link href="/privasi" className="font-semibold text-rose">Privacy &amp; Data</Link>
      </p>
    </Modal>
  )
}
