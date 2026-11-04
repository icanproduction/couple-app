import type { DailyQuestionContext } from '@/lib/daily-question'
import type { DateIdeaInput } from '@/app/app/ide-date/options'

/** A valid structured answer: exactly 3 ideas that pass validateIdeas. */
export const IDEAS = {
  ideas: [
    {
      title: 'Afternoon picnic in a city park',
      description: 'Bring a mat and some snacks, then chat while you wait for the sunset.',
      estimated_cost_idr: 50000,
      category: 'romantis',
      tips: 'Get there before four to grab a shady spot.',
    },
    {
      title: 'Cook a new recipe together',
      description: 'Pick a recipe neither of you has tried and cook it from scratch together.',
      estimated_cost_idr: 80000,
      category: 'rumah',
      tips: 'Shop for the ingredients together too, it makes it more fun.',
    },
    {
      title: 'Local coffee shop crawl',
      description: 'Visit two local coffee shops you have never been to.',
      estimated_cost_idr: 90000,
      category: 'kuliner',
      tips: 'Order the signature drink at each one and compare.',
    },
  ],
}

export const QUESTION_CONTEXT: DailyQuestionContext = {
  myName: 'Raka',
  myGender: 'male',
  myAge: 27,
  myMbti: 'INFP',
  partnerName: 'Dita',
  partnerGender: 'female',
  partnerAge: 26,
  partnerMbti: null,
  daysTogether: 420,
  dayOfWeek: 'Tuesday',
  upcomingEvents: ["Dita's birthday (2026-11-02)"],
  recentQuestions: ['What was the funniest moment of your week?'],
}

export const IDEA_INPUT: DateIdeaInput = { budget: 'hemat', vibe: 'santai', setting: 'bebas', city: 'Bandung' }

/** The part of a JSON Schema the tests inspect. */
export type SchemaNode = {
  type?: string
  description?: string
  properties?: Record<string, SchemaNode>
  items?: SchemaNode
  required?: string[]
  enum?: string[]
  minItems?: number
  maxItems?: number
  minimum?: number
  maxLength?: number
  additionalProperties?: boolean
}
