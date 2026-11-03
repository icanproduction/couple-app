export type QuestionType = 'agree_disagree' | 'scale' | 'priority'

export type Dimension =
  | 'komunikasi'
  | 'nilai_visi'
  | 'keuangan'
  | 'keluarga'
  | 'komitmen'

export interface Question {
  id: number
  dimension: Dimension
  type: QuestionType
  text: string
  options?: string[]
}

export const DIMENSION_LABELS: Record<Dimension, string> = {
  komunikasi: 'Communication',
  nilai_visi: 'Values & Vision',
  keuangan: 'Money',
  keluarga: 'Family',
  komitmen: 'Commitment',
}

/**
 * Keys of the `scores` jsonb saved in assessment_results. Rows saved before the
 * English switch are keyed by these Indonesian labels, so writers should key by
 * this map (not by DIMENSION_LABELS) to keep stored keys stable.
 */
export const DIMENSION_SCORE_KEYS: Record<Dimension, string> = {
  komunikasi: 'Komunikasi',
  nilai_visi: 'Nilai & Visi',
  keuangan: 'Keuangan', // copy-ok: stored value (assessment_results.scores key)
  keluarga: 'Keluarga', // copy-ok: stored value (assessment_results.scores key)
  komitmen: 'Komitmen',
}

export const questions: Question[] = [
  // Communication (3 questions)
  {
    id: 1,
    dimension: 'komunikasi',
    type: 'agree_disagree',
    text: 'I feel comfortable telling my partner about my worries or problems.',
  },
  {
    id: 2,
    dimension: 'komunikasi',
    type: 'scale',
    text: 'How often do you and your partner talk openly about how you feel?',
  },
  {
    id: 3,
    dimension: 'komunikasi',
    type: 'agree_disagree',
    text: 'When we fight, we can work it out without giving each other the silent treatment for days.',
  },
  // Values & Vision (3 questions)
  {
    id: 4,
    dimension: 'nilai_visi',
    type: 'agree_disagree',
    text: 'We see eye to eye on how we want to live over the next 5 years.',
  },
  {
    id: 5,
    dimension: 'nilai_visi',
    type: 'priority',
    text: 'Which matters more to you in a relationship?',
    options: ['Career & personal ambition', 'Quality time together'],
  },
  {
    id: 6,
    dimension: 'nilai_visi',
    type: 'agree_disagree',
    text: "We've talked about what each of us believes and the values we live by.",
  },
  // Money (3 questions)
  {
    id: 7,
    dimension: 'keuangan',
    type: 'agree_disagree',
    text: "We're open with each other about what we earn and what we spend.",
  },
  {
    id: 8,
    dimension: 'keuangan',
    type: 'scale',
    text: 'How ready are you and your partner to manage money together?',
  },
  {
    id: 9,
    dimension: 'keuangan',
    type: 'priority',
    text: 'Which matters more for your future together?',
    options: ['Saving & investing first', 'Enjoying life now'],
  },
  // Family (3 questions)
  {
    id: 10,
    dimension: 'keluarga',
    type: 'agree_disagree',
    text: "We've talked about whether we want kids, and when.",
  },
  {
    id: 11,
    dimension: 'keluarga',
    type: 'scale',
    text: "How well do you get along with your partner's family?",
  },
  {
    id: 12,
    dimension: 'keluarga',
    type: 'agree_disagree',
    text: 'We agree on how involved our extended families will be in our life together.',
  },
  // Commitment (3 questions)
  {
    id: 13,
    dimension: 'komitmen',
    type: 'agree_disagree',
    text: "I'm sure my partner is the right person for my future.",
  },
  {
    id: 14,
    dimension: 'komitmen',
    type: 'scale',
    text: 'How ready are you to commit to your partner for the long haul?',
  },
  {
    id: 15,
    dimension: 'komitmen',
    type: 'agree_disagree',
    text: "We've talked about getting married or taking the next serious step.",
  },
]
