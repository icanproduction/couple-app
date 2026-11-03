import type { DailyQuestionContext } from '@/lib/daily-question'
import type { DateIdeaInput } from '@/app/app/ide-date/options'

/** A valid structured answer: exactly 3 ideas that pass validateIdeas. */
export const IDEAS = {
  ideas: [
    {
      title: 'Piknik sore di taman kota',
      description: 'Bawa tikar dan camilan, lalu ngobrol santai sambil menunggu matahari terbenam.',
      estimated_cost_idr: 50000,
      category: 'romantis',
      tips: 'Datang sebelum jam empat biar dapat tempat yang teduh.',
    },
    {
      title: 'Masak resep baru bareng',
      description: 'Pilih satu resep yang belum pernah kalian coba dan masak berdua dari awal.',
      estimated_cost_idr: 80000,
      category: 'rumah',
      tips: 'Belanja bahannya bareng juga biar makin seru.',
    },
    {
      title: 'Jelajah kedai kopi lokal',
      description: 'Datangi dua kedai kopi lokal yang belum pernah kalian kunjungi.',
      estimated_cost_idr: 90000,
      category: 'kuliner',
      tips: 'Pesan menu andalan di tiap kedai lalu bandingkan.',
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
  dayOfWeek: 'Selasa',
  upcomingEvents: ['Ulang tahun Dita (2026-11-02)'],
  recentQuestions: ['Apa momen paling lucu minggu ini?'],
}

export const IDEA_INPUT: DateIdeaInput = { budget: 'hemat', vibe: 'santai', setting: 'bebas', city: 'Bandung' }

/** The part of a JSON Schema the tests inspect. */
export type SchemaNode = {
  type?: string
  properties?: Record<string, SchemaNode>
  items?: SchemaNode
  required?: string[]
  enum?: string[]
  minItems?: number
  maxItems?: number
  minimum?: number
  additionalProperties?: boolean
}

export type ChatRequestBody = {
  model?: string
  reasoning_effort?: string
  response_format?: { type: string; json_schema: { name: string; strict: boolean; schema: SchemaNode } }
  messages?: Array<{ role: string; content: unknown }>
}
