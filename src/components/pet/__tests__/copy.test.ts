import { describe, expect, it } from 'vitest'
import type { PetStatus, PetWarmthEvent } from '@/types/pet'
import { EMPTY_ROOM_FOR_TESTS } from './fixtures'
import {
  captionFor, celebrationCopy, eventLine, firstName, gainedBetween, introCopy, itemDetail, poseFor,
  presenceLines, skyFor, stateLine, thingsAtLevel,
} from '../copy'
import { parseHi, parseNote, parseStatus, parseVisit } from '../parse'

const ME = '11111111-1111-1111-1111-111111111111'
const KEZIA = '22222222-2222-2222-2222-222222222222'
const NAMES = { [ME]: 'Eric Saputra', [KEZIA]: 'Kezia Natalia' }

function status(over: Partial<PetStatus> = {}): PetStatus {
  return {
    pet_id: 'p1', couple_id: 'c1', name: 'Mochi', pet_type: 'cat', created_at: '2026-10-01T00:00:00Z',
    level: 6, xp: 562, into_level: 62, xp_per_level: 100, stage: 'growing', mood: 'cozy', warmth_72h: 30,
    comfort_for: [], said_hi_today: [], both_today: false, hatched: true, hatched_at: '2026-10-01T00:00:00Z',
    migrated: false, night: false, day: '2026-11-04', ...over,
  }
}

const ctx = { me: ME, partnerId: KEZIA, partnerName: 'Kezia Natalia', partnerGender: 'female' }
// Words the anti-guilt rules ban from anything the pet screen says (spec §5.3).
const GUILT = /\b(waiting|lonely|hungry|sad|neglect|forgot|should|haven't|miss(ed)? you|alone|days since|streak)\b/i

describe('presence', () => {
  it('shows only who said hi, mine first, never a slot for the partner', () => {
    const s = status({ said_hi_today: [{ profile_id: ME, gesture: 'pat', at: '2026-11-04T01:30:00Z' }] })
    expect(presenceLines(s, ME, NAMES)).toEqual(['You said hi this morning'])
  })
  it('names the partner, the gesture and the Jakarta time', () => {
    const s = status({
      said_hi_today: [
        { profile_id: KEZIA, gesture: 'snack', at: '2026-11-04T01:12:00Z' },
        { profile_id: ME, gesture: 'play', at: '2026-11-04T09:00:00Z' },
      ],
    })
    expect(presenceLines(s, ME, NAMES)).toEqual(['You said hi this afternoon', 'Kezia gave Mochi a snack, 08:12'])
  })
  it('lists a partner once even if the row repeats', () => {
    const hi = { profile_id: KEZIA, gesture: null, at: '2026-11-04T13:00:00Z' }
    expect(presenceLines(status({ said_hi_today: [hi, hi] }), ME, NAMES)).toEqual(['Kezia said hi to Mochi, 20:00'])
  })
})

describe('captions', () => {
  it('arrival, half hatched and solo arrival', () => {
    const box = status({ hatched: false, hatched_at: null })
    expect(captionFor(box, { everSaidHi: [] }, ctx)?.text).toBe('Mochi just moved in. It comes all the way out when you both say hi.')
    expect(captionFor(box, { everSaidHi: [ME] }, ctx)?.text).toBe('You said hi. Mochi is peeking out for Kezia.')
    expect(captionFor(box, { everSaidHi: [KEZIA] }, ctx)?.text).toBe('Kezia said hi. Mochi is peeking out for you.')
    expect(captionFor(box, null, { ...ctx, partnerId: null, partnerName: null })?.text)
      .toBe('Mochi just moved in. It comes all the way out when you say hi.')
  })
  it('comfort is per viewer and links the Kangen only for the partner', () => {
    const c = captionFor(status({ comfort_for: [KEZIA] }), null, ctx)
    expect(c?.text).toBe('Kezia had a heavy day. Mochi is sitting close to her.')
    expect(c?.link).toEqual({ href: '/app/home#kangen', label: 'Send Kezia a Kangen' })
    expect(captionFor(status({ comfort_for: [ME] }), null, ctx)).toEqual({ text: 'Mochi is sitting close to you today.' })
    expect(captionFor(status({ comfort_for: [ME, KEZIA] }), null, ctx)?.text).toBe('Mochi is sitting close to you both today.')
    expect(captionFor(status({ comfort_for: [KEZIA] }), null, { ...ctx, partnerGender: null })?.text).toContain('close to them')
  })
  it('dozy never mentions absence, cozy says nothing extra', () => {
    const dozy = captionFor(status({ mood: 'dozy' }), null, ctx)
    expect(dozy?.text).toBe('Anything you two do here wakes Mochi up.')
    expect(dozy?.text).not.toMatch(GUILT)
    expect(captionFor(status(), null, ctx)).toBeNull()
  })
  it('no caption or presence line ever uses guilt words', () => {
    const lines: string[] = []
    for (const mood of ['glowing', 'cozy', 'dozy'] as const) {
      for (const night of [false, true]) {
        for (const comfort of [[], [ME], [KEZIA]]) {
          const s = status({ mood, night, comfort_for: comfort })
          const c = captionFor(s, null, ctx)
          if (c) lines.push(c.text)
          lines.push(stateLine(s))
        }
      }
    }
    lines.push(...presenceLines(status({ said_hi_today: [{ profile_id: KEZIA, gesture: 'pat', at: '2026-11-04T00:00:00Z' }] }), ME, NAMES))
    for (const l of lines) expect(l).not.toMatch(GUILT)
  })
})

describe('pose and state', () => {
  it('maps every state to its own pose', () => {
    expect(poseFor(status({ mood: 'glowing' }), null)).toBe('glowing')
    expect(poseFor(status({ mood: 'cozy' }), null)).toBe('cozy')
    expect(poseFor(status({ mood: 'dozy' }), null)).toBe('dozy')
    expect(poseFor(status({ comfort_for: [KEZIA], night: true }), null)).toBe('comfort')
    expect(poseFor(status({ night: true }), null)).toBe('night')
    expect(poseFor(status({ hatched: false }), { everSaidHi: [] })).toBe('box')
    expect(poseFor(status({ hatched: false }), { everSaidHi: [ME] })).toBe('peek')
  })
  it('shows napping, not dozy, and asleep at night', () => {
    expect(stateLine(status({ mood: 'dozy' }))).toBe('Growing · napping')
    expect(stateLine(status({ night: true }))).toBe('Growing · asleep')
    expect(stateLine(status({ hatched: false }))).toBe('Just moved in')
  })
  it('sky follows Jakarta hours and the night flag', () => {
    expect(skyFor(null, false)).toBe('day')
    expect(skyFor(17, false)).toBe('sunset')
    expect(skyFor(20, false)).toBe('night')
    expect(skyFor(10, true)).toBe('night')
  })
})

describe('celebrations and the intro', () => {
  it('one level, a stage change, and several levels merged', () => {
    expect(celebrationCopy('Mochi', 6, 7, 'growing', 'growing')).toEqual({ title: 'Mochi reached level 7', detail: 'New: a little plant.' })
    expect(celebrationCopy('Mochi', 4, 5, 'little', 'growing').title).toBe('Mochi is growing up!')
    expect(celebrationCopy('Mochi', 6, 9, 'growing', 'growing')).toEqual({ title: 'Mochi reached level 9', detail: '3 new things.' })
  })
  it('stars from level 16', () => {
    expect(gainedBetween(15, 17)).toEqual(['a star on the wall', 'a star on the wall'])
    expect(thingsAtLevel(17)).toBe(17)
  })
  it('the migrated intro counts what came along', () => {
    expect(introCopy('Mochi', 5)).toBe('Mochi moved into a new room. Nothing to feed, nothing to clean. It grows with everything you two do here, and it brought 5 things from the old place.')
    expect(introCopy('Mochi', 1)).toContain('it brought its bed and bowl')
  })
})

describe('feed lines and items', () => {
  const e = (over: Partial<PetWarmthEvent>): PetWarmthEvent => ({
    id: 'e', pet_id: 'p1', couple_id: 'c1', actor_id: KEZIA, source: 'moment', ref_id: null, gesture: null,
    detail: null, points: 10, day: '2026-11-04', created_at: '2026-11-04T02:00:00Z', ...over,
  })
  it('credits the actor, and games to both of you', () => {
    expect(eventLine(e({}), ME, NAMES, 'Mochi')).toBe('Kezia added a Moment')
    expect(eventLine(e({ actor_id: ME, source: 'kangen' }), ME, NAMES, 'Mochi')).toBe('You sent a Kangen')
    expect(eventLine(e({ source: 'game', detail: 'samakan' }), ME, NAMES, 'Mochi')).toBe('You two finished a Samakan set')
    expect(eventLine(e({ source: 'hi', gesture: 'play' }), ME, NAMES, 'Mochi')).toBe('Kezia played with Mochi')
    expect(eventLine(e({ actor_id: null }), ME, NAMES, 'Mochi')).toBe('Your partner added a Moment')
  })
  it('living items show the couple data', () => {
    const room = { ...EMPTY_ROOM_FOR_TESTS, jarNotesThisMonth: 4, lettersSealed: 1, nextEvent: { title: 'Anniversary dinner', days: 12 } }
    const c = { pet: 'Mochi', level: 9, glowing: false, sky: 'day' as const, initials: 'EK', solo: false }
    expect(itemDetail('jar', room, c).value).toBe('4 Jar notes this month')
    expect(itemDetail('letter_rack', room, c).value).toBe('1 letter still sealed')
    expect(itemDetail('wall_calendar', room, c).value).toBe('12 days to Anniversary dinner')
    expect(itemDetail('collar_tag', room, c).value).toBe('Both your initials: E and K')
  })
  it('first names only', () => {
    expect(firstName('Kezia Natalia')).toBe('Kezia')
    expect(firstName('  ')).toBe('Your partner')
  })
})

describe('parsers', () => {
  it('reads pet_status JSON and tolerates junk', () => {
    expect(parseStatus(null)).toBeNull()
    const s = parseStatus({ pet_id: 'p1', name: 'Kopi', pet_type: 'parrot', level: '3', mood: 'weird', said_hi_today: [{ profile_id: ME, gesture: 'feed', at: 'x' }, 5] })
    expect(s?.pet_type).toBe('cat')
    expect(s?.level).toBe(3)
    expect(s?.mood).toBe('cozy')
    expect(s?.said_hi_today).toEqual([{ profile_id: ME, gesture: null, at: 'x' }])
  })
  it('reads hi, visit and note shapes', () => {
    expect(parseHi({ counted: true, points: 10, both_today: true }).points).toBe(10)
    expect(parseVisit({ first_visit: true, celebrated_level: 5, level: 5 })?.celebrated_level).toBe(5)
    expect(parseNote({ note: { note_date: '2026-11-04', kind: 'weekly', title: 'A week of small things', line: 'Hi.' } }))
      .toEqual({ date: '2026-11-04', kind: 'weekly', title: 'A week of small things', line: 'Hi.', pending: false })
    expect(parseNote({ note: null })).toBeNull()
    expect(parseNote({ line: 'x', status: 'pending' })).toBeNull()
  })
})
