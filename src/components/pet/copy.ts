// Pet Kita copy and display rules (docs/superpowers/specs/2026-11-04-pet-remake.md
// §5.2, §5.7). Pure functions so the wording rules can be unit tested:
// the pet thanks and never asks, it credits the couple, presence is shown only
// when it is there, and nothing here ever counts who did less.
import {
  PET_RULES, itemsForLevel, nextItem,
  type Gesture, type GameKind, type PetHi, type PetItemKey, type PetStage, type PetState, type PetStatus,
  type PetType, type PetWarmthEvent,
} from '@/types/pet'
import type { RoomData } from './api'

/** What the figure is doing. The DB states plus the arrival box and night. */
export type PetPose =
  | 'glowing' | 'cozy' | 'dozy' | 'comfort' | 'night' | 'box' | 'peek' | 'celebrate'

export const JAKARTA_TZ = 'Asia/Jakarta'

export const STAGE_LABEL: Record<PetStage, string> = {
  little: 'Little',
  growing: 'Growing',
  grown: 'Grown',
  wise: 'Wise',
}

/** "dozy" is shown as "napping" (spec §5.3). */
export const STATE_LABEL: Record<PetState, string> = {
  glowing: 'glowing',
  cozy: 'cozy',
  dozy: 'napping',
}

export const TYPE_LABEL: Record<PetType, string> = { cat: 'cat', dog: 'dog' }

export const GESTURE_LABEL: Record<Gesture, string> = { pat: 'Pat', snack: 'Snack', play: 'Play' }

/** First word of a profile name, for short lines ("Kezia", not "Kezia Natalia"). */
export function firstName(name: string | null | undefined, fallback = 'Your partner'): string {
  const first = (name ?? '').trim().split(/\s+/)[0]
  return first || fallback
}

/** "E" for Eric; "?" when there is no name. */
export function initialOf(name: string | null | undefined): string {
  const ch = (name ?? '').trim().charAt(0)
  return ch ? ch.toUpperCase() : '?'
}

/** her / him / them, from profiles.gender ('female' | 'male'). */
export function objectPronoun(gender: string | null | undefined): string {
  if (gender === 'female') return 'her'
  if (gender === 'male') return 'him'
  return 'them'
}

export function gesturePhrase(gesture: Gesture | null | undefined, pet: string): string {
  switch (gesture) {
    case 'pat': return `patted ${pet}`
    case 'snack': return `gave ${pet} a snack`
    case 'play': return `played with ${pet}`
    default: return `said hi to ${pet}`
  }
}

const CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: JAKARTA_TZ, hour: '2-digit', minute: '2-digit', hour12: false })
const HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: JAKARTA_TZ, hour: 'numeric', hour12: false })

/** "08:12", Jakarta time (the same on the server and in the browser). */
export function jakartaClock(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '' : CLOCK.format(t)
}

/** Jakarta hour 0-23 of a timestamp, or of now. */
export function jakartaHour(at: number | string = Date.now()): number {
  const t = typeof at === 'string' ? Date.parse(at) : at
  const h = Number(HOUR.format(Number.isNaN(t) ? Date.now() : t))
  return h === 24 ? 0 : h
}

/** "this morning" for a hi at 08:12 Jakarta time. */
export function partOfDay(iso: string): string {
  const h = jakartaHour(iso)
  if (h < 5) return 'early this morning'
  if (h < 12) return 'this morning'
  if (h < 18) return 'this afternoon'
  return 'this evening'
}

/**
 * One presence line per hi today. Mine reads "You said hi this morning", the
 * partner's names the gesture and the time ("Kezia gave Mochi a snack, 08:12").
 */
export function presenceLine(hi: PetHi, me: string, names: Record<string, string>, pet: string): string {
  if (hi.profile_id === me) return `You said hi ${partOfDay(hi.at)}`
  const who = firstName(names[hi.profile_id])
  const clock = jakartaClock(hi.at)
  return clock ? `${who} ${gesturePhrase(hi.gesture, pet)}, ${clock}` : `${who} ${gesturePhrase(hi.gesture, pet)}`
}

/** Presence, mine first, then in the order the hi happened. Nobody gets an empty slot. */
export function presenceLines(status: Pick<PetStatus, 'said_hi_today' | 'name'>, me: string, names: Record<string, string>): string[] {
  const seen = new Set<string>()
  const his = [...status.said_hi_today]
    .filter((h) => (seen.has(h.profile_id) ? false : (seen.add(h.profile_id), true)))
    .sort((a, b) => (a.profile_id === me ? -1 : b.profile_id === me ? 1 : a.at.localeCompare(b.at)))
  return his.map((h) => presenceLine(h, me, names, status.name))
}

const GAME_LINE: Record<GameKind, string> = {
  samakan: 'You two finished a Samakan set',
  two_truths: 'You two played Two Truths & a Lie',
  deep_talk: 'You two finished a Deep Talk level',
}

/** "Since your last visit" line for one warmth event (templates, spec §5.2). */
export function eventLine(e: Pick<PetWarmthEvent, 'actor_id' | 'source' | 'gesture' | 'detail'>, me: string, names: Record<string, string>, pet: string): string {
  const actor = e.actor_id === me ? 'You' : firstName(e.actor_id ? names[e.actor_id] : null)
  switch (e.source) {
    case 'hi': return `${actor} ${gesturePhrase(e.gesture, pet)}`
    case 'hi_both': return 'Both of you said hi'
    case 'kangen': return `${actor} sent a Kangen`
    case 'mood': return `${actor} shared a mood`
    case 'daily': return `${actor} answered the Daily Question`
    case 'moment': return `${actor} added a Moment`
    case 'moment_social': return `${actor} reacted to a Moment`
    case 'letter': return `${actor} wrote a letter`
    case 'jar': return `${actor} added a Jar note`
    case 'bucket_done': return `${actor} ticked off a Bucket List item`
    case 'plan': return `${actor} made a plan`
    case 'saving': return `${actor} added to your savings`
    case 'game': return (e.detail && GAME_LINE[e.detail]) || 'You two played a game'
    default: return `${pet} brought warmth from the old room`
  }
}

/** Where a "Since your last visit" line leads. */
export function eventHref(source: PetWarmthEvent['source'], detail: GameKind | null): string | null {
  switch (source) {
    case 'kangen': return '/app/home'
    case 'mood': return '/app/mood'
    case 'daily': return '/app/arsip-pertanyaan'
    case 'moment':
    case 'moment_social': return '/app/moments'
    case 'letter': return '/app/letters'
    case 'jar': return '/app/toples'
    case 'bucket_done': return '/app/bucket-list'
    case 'plan': return '/app/calendar'
    case 'saving': return '/app/finance'
    case 'game':
      if (detail === 'deep_talk') return '/app/games/deep-talk'
      if (detail === 'two_truths') return '/app/games/two-truths'
      return detail === 'samakan' ? '/app/games/samakan' : '/app/games'
    default: return null
  }
}

export interface HatchInfo {
  /** Members who have ever said hi (only read while the pet hasn't hatched). */
  everSaidHi: string[]
}

/** The pose the figure takes, from pet_status (the client decides nothing else). */
export function poseFor(status: Pick<PetStatus, 'hatched' | 'comfort_for' | 'night' | 'mood'>, hatch: HatchInfo | null): PetPose {
  if (!status.hatched) return hatch && hatch.everSaidHi.length > 0 ? 'peek' : 'box'
  if (status.comfort_for.length > 0) return 'comfort'
  if (status.night) return 'night'
  return status.mood
}

export interface Caption {
  text: string
  link?: { href: string; label: string }
}

export interface CaptionContext {
  me: string
  partnerId: string | null
  partnerName: string | null
  partnerGender: string | null
}

/**
 * The line under the room. Arrival and comfort come first; dozy never mentions
 * absence; at night it says the pet is asleep. Null when the presence row says
 * enough.
 */
export function captionFor(status: PetStatus, hatch: HatchInfo | null, ctx: CaptionContext): Caption | null {
  const pet = status.name
  const partner = ctx.partnerId ? firstName(ctx.partnerName) : null
  const solo = !ctx.partnerId

  if (!status.hatched) {
    const ever = new Set(hatch?.everSaidHi ?? [])
    const mine = ever.has(ctx.me)
    const theirs = ctx.partnerId ? ever.has(ctx.partnerId) : false
    if (mine && partner && !theirs) return { text: `You said hi. ${pet} is peeking out for ${partner}.` }
    if (theirs && !mine) return { text: `${partner} said hi. ${pet} is peeking out for you.` }
    return {
      text: solo
        ? `${pet} just moved in. It comes all the way out when you say hi.`
        : `${pet} just moved in. It comes all the way out when you both say hi.`,
    }
  }

  const heavy = new Set(status.comfort_for)
  const meHeavy = heavy.has(ctx.me)
  const partnerHeavy = ctx.partnerId ? heavy.has(ctx.partnerId) : false
  if (meHeavy && partnerHeavy) return { text: `${pet} is sitting close to you both today.` }
  if (partnerHeavy && partner) {
    return {
      text: `${partner} had a heavy day. ${pet} is sitting close to ${objectPronoun(ctx.partnerGender)}.`,
      link: { href: '/app/home#kangen', label: `Send ${partner} a Kangen` },
    }
  }
  if (meHeavy) return { text: `${pet} is sitting close to you today.` }

  if (status.night) return { text: `Lights out. ${pet} is asleep, but taps still work.` }
  if (status.mood === 'dozy') {
    return { text: solo ? `Anything you do here wakes ${pet} up.` : `Anything you two do here wakes ${pet} up.` }
  }
  return null
}

/** "Growing · cozy", "Little · napping", "Grown · asleep". */
export function stateLine(status: Pick<PetStatus, 'stage' | 'mood' | 'night' | 'hatched'>): string {
  if (!status.hatched) return 'Just moved in'
  return `${STAGE_LABEL[status.stage]} · ${status.night ? 'asleep' : STATE_LABEL[status.mood]}`
}

/** What the next level brings, for the progress line ("Lv 7: plant"). */
export function nextUnlockLabel(level: number): string {
  const item = nextItem(level)
  const label = item ? item.label.toLowerCase() : PET_RULES.extras.star_label.toLowerCase()
  return `Lv ${level + 1}: ${label}`
}

/** Things earned at levels (from, to], with a star per level from 16. */
export function gainedBetween(from: number, to: number): string[] {
  const out: string[] = []
  for (let lv = from + 1; lv <= to; lv++) {
    const item = PET_RULES.items.find((i) => i.level === lv)
    if (item) out.push(item.phrase)
    else if (lv >= PET_RULES.extras.star_from_level) out.push(PET_RULES.extras.star_phrase)
  }
  return out
}

/** Everything a pet at this level owns (items plus stars). */
export function thingsAtLevel(level: number): number {
  const stars = Math.max(0, level - PET_RULES.extras.star_from_level + 1)
  return itemsForLevel(level).length + stars
}

export interface CelebrationCopy {
  title: string
  detail: string
}

/** Level-up copy; several levels at once are merged into one line. */
export function celebrationCopy(pet: string, from: number, to: number, stageFrom: PetStage, stageTo: PetStage): CelebrationCopy {
  const gained = gainedBetween(from, to)
  const many = to - from > 1
  if (stageFrom !== stageTo) {
    return {
      title: `${pet} is growing up!`,
      detail: many
        ? `Now ${STAGE_LABEL[stageTo]}, at level ${to}. ${gained.length} new things.`
        : `Now ${STAGE_LABEL[stageTo]}, at level ${to}. New: ${gained[0] ?? 'a little something'}.`,
    }
  }
  if (many) return { title: `${pet} reached level ${to}`, detail: `${gained.length} new things.` }
  return { title: `${pet} reached level ${to}`, detail: `New: ${gained[0] ?? 'a little something'}.` }
}

/** The one-time card for a pet that lived in the old care room. */
export function introCopy(pet: string, level: number): string {
  const n = thingsAtLevel(level)
  const brought = n <= 1 ? 'it brought its bed and bowl' : `it brought ${n} things from the old place`
  return `${pet} moved into a new room. Nothing to feed, nothing to clean. It grows with everything you two do here, and ${brought}.`
}

export type RoomItemKey = PetItemKey | 'star'

export type Sky = 'day' | 'sunset' | 'night'

/** Jakarta sky for the window: sunset 17:00-18:59, night from the DB's night flag or 19:00-05:59. */
export function skyFor(hour: number | null, night: boolean): Sky {
  if (night) return 'night'
  if (hour === null) return 'day'
  if (hour >= 17 && hour < 19) return 'sunset'
  if (hour >= 19 || hour < 6) return 'night'
  return 'day'
}

export interface ItemDetail {
  title: string
  value: string
  href?: string
  hrefLabel?: string
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** What an item shows when tapped: its live value and where it leads. */
export function itemDetail(
  key: RoomItemKey,
  room: RoomData,
  ctx: { pet: string; level: number; glowing: boolean; sky: Sky; initials: string; solo: boolean },
): ItemDetail {
  switch (key) {
    case 'bed':
      return { title: 'Bed and bowl', value: `${ctx.pet}'s spot for naps and snacks` }
    case 'collar_tag':
      return { title: 'Collar tag', value: `Both your initials: ${ctx.initials.split('').join(' and ')}` }
    case 'jar': {
      const n = room.jarNotesThisMonth
      return {
        title: 'Jar',
        value: n === null ? 'A marble for every Jar note this month' : plural(n, 'Jar note this month', 'Jar notes this month'),
        href: '/app/toples', hrefLabel: 'Open Jar',
      }
    }
    case 'photo_frame': {
      const m = room.latestMoment
      return m
        ? { title: 'Photo frame', value: `Your latest Moment: ${m.title}`, href: `/app/moments/${m.id}`, hrefLabel: 'Open Moment' }
        : { title: 'Photo frame', value: 'Your latest Moment shows up here', href: '/app/moments', hrefLabel: 'Moments' }
    }
    case 'scarf':
      return { title: 'Scarf', value: 'Worn since level 5' }
    case 'letter_rack': {
      const n = room.lettersSealed
      return {
        title: 'Letter rack',
        value: n === null
          ? "An envelope for every letter that's still sealed"
          : n === 0 ? 'No sealed letters right now' : plural(n, 'letter still sealed', 'letters still sealed'),
        href: '/app/letters', hrefLabel: 'Letters',
      }
    }
    case 'plant': {
      const n = room.bothHiDaysThisMonth
      return {
        title: 'Plant',
        value: n === null || ctx.solo
          ? 'A new leaf for every day you both say hi'
          : plural(n, 'day you both said hi this month', 'days you both said hi this month'),
      }
    }
    case 'wall_calendar': {
      const e = room.nextEvent
      let value = 'No shared plans in the next 60 days'
      if (e) value = e.days === 0 ? `${e.title} is today` : `${plural(e.days, 'day', 'days')} to ${e.title}`
      return { title: 'Wall calendar', value, href: '/app/calendar', hrefLabel: 'Calendar' }
    }
    case 'window':
      return {
        title: 'Window',
        value: ctx.sky === 'night' ? 'The Jakarta sky tonight' : ctx.sky === 'sunset' ? 'Sunset over Jakarta' : 'The Jakarta sky right now',
      }
    case 'hat':
      return { title: 'Hat', value: 'Worn since level 10' }
    case 'rug':
      return { title: 'Rug', value: 'Soft enough for long naps' }
    case 'fairy_lights':
      return { title: 'Fairy lights', value: ctx.glowing ? `On while ${ctx.pet} is glowing` : `They light up while ${ctx.pet} is glowing` }
    case 'map_board': {
      const n = room.mapPins
      return {
        title: 'Map board',
        value: n === null ? 'A pin for every place in your Moments' : plural(n, 'place from your Moments', 'places from your Moments'),
        href: '/app/moments/peta', hrefLabel: 'Moments Map',
      }
    }
    case 'toy_chest': {
      const n = room.gamesThisMonth
      return {
        title: 'Toy chest',
        value: n === null ? 'A toy for every game you two play' : plural(n, 'game played this month', 'games played this month'),
        href: '/app/games', hrefLabel: 'Games',
      }
    }
    case 'glasses':
      return { title: 'Glasses', value: 'Worn since level 15' }
    case 'star': {
      const n = Math.max(0, ctx.level - PET_RULES.extras.star_from_level + 1)
      return { title: 'Stars', value: `${plural(n, 'star', 'stars')}, one for every level from 16` }
    }
  }
}

/** The "How it grows" sheet: sources in plain words with their warmth. */
export const GROWTH_SOURCES: { label: string; points: string }[] = [
  { label: 'Saying hi, once a day each', points: `+${PET_RULES.sources.hi.points}` },
  { label: 'Both of you saying hi on the same day', points: `+${PET_RULES.sources.hi_both.points}` },
  { label: 'A Moment', points: `+${PET_RULES.sources.moment.points}` },
  { label: 'A finished Bucket List item', points: `+${PET_RULES.sources.bucket_done.points}` },
  { label: 'A letter', points: `+${PET_RULES.sources.letter.points}` },
  { label: 'Games: Samakan, Two Truths, Deep Talk', points: `+${PET_RULES.sources.game.points.two_truths} to +${PET_RULES.sources.game.points.deep_talk}` },
  { label: 'A Jar note', points: `+${PET_RULES.sources.jar.points}` },
  { label: 'Answering the Daily Question', points: `+${PET_RULES.sources.daily.points}` },
  { label: 'Adding to your savings', points: `+${PET_RULES.sources.saving.points}` },
  { label: 'A Kangen', points: `+${PET_RULES.sources.kangen.points}` },
  { label: 'Sharing your mood', points: `+${PET_RULES.sources.mood.points}` },
  { label: 'Comments, reactions and new plans', points: `+${PET_RULES.sources.plan.points}` },
]
