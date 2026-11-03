// Love Languages quiz: question bank, descriptions, tips and scoring.
// Pure data and functions with no runtime imports, so
// scripts/verify/game-love-languages.mjs loads this file straight from Node.
//
// 20 forced-choice pairs. Each option maps to one key; every key appears
// exactly 8 times across the 40 options and never twice in one pair, so a
// score runs 0..8 and the five scores add up to 20. The key order of the
// options is mirrored in love_language_result_valid() in
// supabase/migrations/20261103131000_love_languages.sql, which recomputes the
// scores from the answers. Reordering pairs here means changing it there too;
// the verify script fails if they drift apart.

export const LOVE_KEYS = ['words', 'time', 'gifts', 'acts', 'touch'] as const
export type LoveKey = (typeof LOVE_KEYS)[number]
export type LoveScores = Record<LoveKey, number>

export const QUESTION_COUNT = 20
export const KEY_MAX = 8

export interface LoveOption {
  key: LoveKey
  text: string
}

export const LOVE_LANGUAGES: Record<LoveKey, { name: string; short: string; description: string; color: string; soft: string }> = {
  words: {
    name: 'Kind words',
    short: 'Hearing it said',
    description: "You feel loved when it's put into words. A sincere compliment, or a thank-you that names the exact thing, stays with you for days.",
    color: '#E0667F',
    soft: '#FDE8EC',
  },
  time: {
    name: 'Quality time',
    short: 'Having them fully there',
    description: 'You feel loved when someone is fully present. Phones down, no rushing. A long talk or an aimless drive counts for more than any big plan.',
    color: '#2F9C8C',
    soft: '#E1F3F0',
  },
  gifts: {
    name: 'Thoughtful gifts',
    short: 'Proof they thought of you',
    description: "You feel loved by small proof that someone had you in mind. Price doesn't matter. The snack they knew you'd want means more than anything expensive.",
    color: '#D08A2A',
    soft: '#FBF0DD',
  },
  acts: {
    name: 'Helping hands',
    short: 'Help before you ask',
    description: "You feel loved when someone takes something off your plate. Sorting the bill you've been avoiding, or picking you up in the rain, tells you they're on your side.",
    color: '#4A78D0',
    soft: '#E5EDFA',
  },
  touch: {
    name: 'Physical touch',
    short: 'Being close',
    description: 'You feel loved through closeness. A hand to hold in a crowded mall or a long hug at the door settles you faster than words can.',
    color: '#9257BF',
    soft: '#F1E8F8',
  },
}

const o = (key: LoveKey, text: string): LoveOption => ({ key, text })

/** Option 0 and option 1 of each pair. answers[n] stores which one was picked. */
export const LOVE_PAIRS: ReadonlyArray<readonly [LoveOption, LoveOption]> = [
  [o('words', "They send you a long message about why they're proud of you"), o('time', 'They put their phone away for a whole evening with you')],
  [o('gifts', 'They bring home your favorite martabak without being asked'), o('acts', "They sort out the bill you've been putting off for weeks")],
  [o('touch', 'A long hug the moment you walk through the door'), o('words', `Hearing them say "I'm lucky to have you" and mean it`)],
  [o('time', 'A slow Sunday morning together with nowhere to be'), o('gifts', 'A small souvenir they picked up for you on a work trip')],
  [o('acts', "They take your motorbike in for a service so you don't have to"), o('touch', 'They hold your hand the whole way through the mall')],
  [o('words', 'A handwritten note tucked into your bag before a big day'), o('gifts', 'A box of your favorite snacks waiting on your desk')],
  [o('time', 'A long video call about nothing in particular'), o('acts', 'They wait in line at the bank for you on their lunch break')],
  [o('touch', 'Resting your head on their shoulder during a movie'), o('gifts', 'They remember the shoes you liked months ago and surprise you with them')],
  [o('words', 'They tell your parents how much you mean to them'), o('acts', "They cook dinner after you've had a long day")],
  [o('time', 'An evening walk around the kompleks, just the two of you'), o('touch', 'A back rub after a day stuck in traffic')],
  [o('acts', 'They fix the leaking sink before you even mention it again'), o('gifts', 'They surprise you with a plant for your desk')],
  [o('words', 'A voice note in the middle of the day saying they miss you'), o('touch', 'Falling asleep holding hands')],
  [o('gifts', 'A playlist they made only for you'), o('time', 'They turn off the TV to hear about your day properly')],
  [o('touch', 'A kiss on the forehead before you leave for work'), o('acts', "They iron your clothes for tomorrow's big meeting")],
  [o('time', 'They come along to the market to keep you company'), o('words', 'Out of nowhere, they tell you what they admire about you')],
  [o('gifts', 'A framed photo from your first trip together'), o('touch', 'Their arm around you while you wait in a long line')],
  [o('acts', "They take care of everything when you're sick in bed"), o('words', "They brag about you to their friends while you're right there")],
  [o('touch', 'Cuddling on the sofa after a long week'), o('time', 'Trying a new recipe together on a free evening')],
  [o('gifts', "Your favorite kopi susu delivered when you're working late"), o('words', 'A message that says "You handled that really well today"')],
  [o('acts', "They pick you up from the station when it's raining"), o('time', 'A whole day out together with both phones on silent')],
]

/** At least five per key; three are shown at a time. */
export const LOVE_TIPS: Record<LoveKey, readonly string[]> = {
  words: [
    'Text them one specific thing they did well today, instead of a general "you\'re great".',
    'Say thank you out loud for small things, like making coffee or topping up the e-money card.',
    'Leave a note in their bag or on the bathroom mirror before a big day.',
    'Praise them to your family while they can hear it.',
    "Send a voice note when you're apart. Your voice lands harder than a text.",
    "When they're having a rough week, tell them what you admire about how they're handling it.",
  ],
  time: [
    'Put your phones in another room for one evening a week and talk properly.',
    "Make the drive home your catch-up time, even if it's over a call.",
    'Do the boring errands together, like the weekly market run.',
    'Plan a slow Sunday with nothing on it but the two of you.',
    'When they tell you a story, ask a second question instead of moving on.',
    'Keep a standing date, even a cheap one, like martabak every Friday night.',
  ],
  gifts: [
    'Keep a note on your phone of things they mention wanting, then surprise them later.',
    'Bring back something small from every trip, even a snack from the rest area.',
    'Send their favorite drink to their office on a stressful day.',
    "Print a photo of the two of you and put it where they'll see it every day.",
    'Bring home flowers or a small plant on a random weekday, for no reason.',
    'Wrap even the small things. For them, the effort is what counts.',
  ],
  acts: [
    "Handle one errand they've been dreading, like the motorbike service or the PLN bill.",
    'Cook or pick up dinner on the nights they get home late.',
    'Ask "What can I take off your plate this week?" and then actually do it.',
    "Fix the thing that's been broken for ages, like the wobbly chair.",
    "Pick them up from the station when it rains so they don't have to wait for an ojol.",
    'Get their things ready the night before an early start.',
  ],
  touch: [
    'Hug them at the door when they come home, and hold it a little longer.',
    'Hold their hand when you walk through a crowded place.',
    'Sit close on the sofa instead of at opposite ends.',
    'Give them a quick shoulder rub after a long day in traffic.',
    'Touch their arm or back when you pass them in the kitchen.',
    "Fall asleep holding hands, even if it's only for the first few minutes.",
  ],
}

/** Scores for a full set of answers (each 0 or 1), or null when the set is incomplete. */
export function scoreAnswers(answers: readonly number[]): LoveScores | null {
  if (answers.length !== QUESTION_COUNT) return null
  const scores: LoveScores = { words: 0, time: 0, gifts: 0, acts: 0, touch: 0 }
  for (let i = 0; i < QUESTION_COUNT; i++) {
    const pick = answers[i]
    if (pick !== 0 && pick !== 1) return null
    scores[LOVE_PAIRS[i][pick].key] += 1
  }
  return scores
}

/** True for a stored scores object: exactly the five keys, whole numbers 0..8, total 20. */
export function isLoveScores(value: unknown): value is LoveScores {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  if (keys.length !== LOVE_KEYS.length || !LOVE_KEYS.every((k) => keys.includes(k))) return false
  let total = 0
  for (const k of LOVE_KEYS) {
    const n = (value as Record<string, unknown>)[k]
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > KEY_MAX) return false
    total += n
  }
  return total === QUESTION_COUNT
}

/** Keys from highest to lowest score; ties keep the LOVE_KEYS order. */
export function rankKeys(scores: LoveScores): LoveKey[] {
  return [...LOVE_KEYS].sort((a, b) => scores[b] - scores[a] || LOVE_KEYS.indexOf(a) - LOVE_KEYS.indexOf(b))
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Three tips for a key. The order is shuffled once per seed (the partner's
 * result), so the tips stay put between visits and change after a retake;
 * `page` steps through the rest of the list.
 */
export function pickTips(key: LoveKey, seed: string, page = 0, count = 3): string[] {
  const tips = LOVE_TIPS[key]
  const order = tips.map((_, i) => i).sort((a, b) => hash(`${seed}:${key}:${a}`) - hash(`${seed}:${key}:${b}`))
  const start = (page * count) % tips.length
  return Array.from({ length: Math.min(count, tips.length) }, (_, i) => tips[order[(start + i) % tips.length]])
}

/** One line on where the two of you differ most. */
export function differenceLine(mine: LoveScores, theirs: LoveScores, partnerName: string): string {
  const gaps = LOVE_KEYS.map((key) => ({ key, diff: theirs[key] - mine[key] }))
  const widest = Math.max(...gaps.map((g) => Math.abs(g.diff)))
  if (widest === 0) return 'You two match on all five, point for point.'
  const theirOrder = rankKeys(theirs)
  const gap = gaps
    .filter((g) => Math.abs(g.diff) === widest)
    .sort((a, b) => theirOrder.indexOf(a.key) - theirOrder.indexOf(b.key))[0]
  const name = LOVE_LANGUAGES[gap.key].name
  if (widest <= 2) {
    return `You two are close on all five. The biggest gap is ${name}, and it's only ${widest === 1 ? '1 point' : `${widest} points`}.`
  }
  if (gap.diff > 0) {
    return `${name} matters a lot more to ${partnerName} (${theirs[gap.key]} of 8) than to you (${mine[gap.key]} of 8), so it's the one you're most likely to forget.`
  }
  return `${name} matters a lot more to you (${mine[gap.key]} of 8) than to ${partnerName} (${theirs[gap.key]} of 8). Tell them what it means to you, because they might not guess.`
}
