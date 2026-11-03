export type SpendingType = 'explorer' | 'guardian' | 'giver' | 'architect' | 'drifter'

export type DimensionScores = {
  IP: number  // Impulse vs Planning (higher = more impulse)
  SO: number  // Self vs Other (higher = more other-oriented)
  PF: number  // Present vs Future (higher = more present)
  AW: number  // Awareness (higher = more aware)
}

export type SpendingAnswer = 'A' | 'B' | 'C' | 'D'

export interface SpendingTypeInfo {
  id: SpendingType
  name: string
  tagline: string
  emoji: string
  color: string
  description: string
  strengths: string[]
  blindSpots: string[]
  resonantQuote: string
}

export const SPENDING_TYPES: Record<SpendingType, SpendingTypeInfo> = {
  explorer: {
    id: 'explorer',
    name: 'The Explorer',
    tagline: 'You only live once, so why not try it?',
    emoji: '🌊',
    color: '#F08060',
    description: 'You spend on experiences and moments. You buy because you\'re excited, not because you need it. Impulsive, yes, but not materialistic: a trip beats a new gadget every time.',
    strengths: [
      'Keeps the relationship fun and never boring',
      'Never stingy about time out together',
      'Always up for trying something new as a pair',
    ],
    blindSpots: [
      'Savings often run dry before the month is over',
      'Finds it hard to commit to a long-term money goal',
      'Buys things that end up unused',
    ],
    resonantQuote: 'We can save when we\'re old. Let\'s enjoy it now.',
  },
  guardian: {
    id: 'guardian',
    name: 'The Guardian',
    tagline: 'Better safe than sorry.',
    emoji: '🏰',
    color: '#5B8EDB',
    description: 'You spend for safety and control. Every money decision gets thought through. Security drives you, and careful is not the same as stingy.',
    strengths: [
      'Gives the couple the steadiest finances',
      'A natural planner for the wedding, the house and what comes after',
      'Never overspends and always keeps a safety net',
    ],
    blindSpots: [
      'Can come across as controlling about money',
      'Hits the brakes on your partner\'s plans, sometimes to the point of frustration',
      'Too cautious, even about reasonable things',
    ],
    resonantQuote: 'We need to save up first before we buy that.',
  },
  giver: {
    id: 'giver',
    name: 'The Giver',
    tagline: 'I\'m happiest when the people I love are happy.',
    emoji: '🎁',
    color: '#F06B6B',
    description: 'You spend out of love. Money is how you show what you feel. You often overspend on other people and underspend on yourself.',
    strengths: [
      'Your partner feels truly appreciated and loved',
      'Generous when a special moment comes up',
      'Never selfish about money in the relationship',
    ],
    blindSpots: [
      'Saying no is hard, even when the budget is short',
      'Your own money needs often come last',
      'Guilt kicks in fast when you can\'t give',
    ],
    resonantQuote: 'It\'s fine, it\'s for you.',
  },
  architect: {
    id: 'architect',
    name: 'The Architect',
    tagline: 'Everything has a plan and a purpose.',
    emoji: '📊',
    color: '#7EC4A0',
    description: 'You spend by goals and systems. Every rupiah has a clear job. You\'re happy to spend, as long as there\'s a good reason.',
    strengths: [
      'The best at reaching shared money goals',
      'A natural at planning money as a couple',
      'Decides on facts, not feelings',
    ],
    blindSpots: [
      'Can feel unromantic. Does everything need a number?',
      'Overthinks small things',
      'Not very spontaneous in the relationship',
    ],
    resonantQuote: 'If we start saving now, in 2 years we could already...',
  },
  drifter: {
    id: 'drifter',
    name: 'The Drifter',
    tagline: 'It\'ll sort itself out.',
    emoji: '🌀',
    color: '#E8C078',
    description: 'Your spending has no clear pattern. Some months you save, some months you splurge, depending on your mood. You do care. You just don\'t keep a close eye on money yet.',
    strengths: [
      'No drama about money, very easygoing',
      'Adaptable and never rigid',
      'Never controlling about your partner\'s money',
    ],
    blindSpots: [
      'Has no clear money goals',
      'Can become a money burden without noticing',
      'Hard to get on board with long-term plans',
    ],
    resonantQuote: 'Wait, it\'s already the end of the month? Payday was like yesterday.',
  },
}
