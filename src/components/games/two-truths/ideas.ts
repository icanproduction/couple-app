// Help for the blank compose screen: sentence starters that drop into a
// statement field, a few example rounds, and short tips.

/** Inserted into an empty statement field (with a trailing space). */
export const STARTERS: readonly string[] = [
  "I've never",
  'I once',
  'As a kid, I',
  'I can',
  'My first job was',
  "I've been to",
  "I'm secretly scared of",
  'I still have',
]

export interface ExampleRound {
  statements: readonly [string, string, string]
  /** Which one is made up. */
  lie: 0 | 1 | 2
}

export const EXAMPLE_ROUNDS: readonly ExampleRound[] = [
  {
    statements: [
      "I've never been to Bali.",
      'I once fell asleep at the gate and missed my flight.',
      'I can name every MRT station in Jakarta in order.',
    ],
    lie: 2,
  },
  {
    statements: [
      'My first job was selling phone credit to my classmates.',
      "I've never ridden an ojol on my own.",
      'I cried at the end of a cartoon last month.',
    ],
    lie: 1,
  },
  {
    statements: [
      'I once won a karaoke contest at a cousin\'s wedding.',
      "I've eaten durian for breakfast.",
      'As a kid, I wanted to be a pilot.',
    ],
    lie: 0,
  },
  {
    statements: [
      'I still have my primary school report cards.',
      "I'm secretly scared of geese.",
      'I once got lost in a mall for three hours.',
    ],
    lie: 2,
  },
]

export const TIPS: readonly string[] = [
  'Make the lie sound ordinary and the truths sound surprising.',
  'Small details make a lie believable.',
  'Pick things your partner probably hasn\'t heard yet.',
]
