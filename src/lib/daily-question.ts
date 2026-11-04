// AI daily question: the prompt and the Claude call. Server-only: imported by
// src/app/api/ai/daily-question/route.ts, which owns auth, the claim and the
// context queries. Never import it from a client component.
import { claudeJson, type ClaudeFailure, type ClaudeUsage } from '@/lib/claude'
import { AI_STYLE_RULES, tidyAiText } from '@/lib/ai-style'

/** One short question; the whole call (retries included) must end well before the 90 s stale-claim window. */
export const DAILY_QUESTION_TIMEOUT_MS = 30_000
/** Room for a short think at effort "low" plus one sentence of JSON. */
export const DAILY_QUESTION_MAX_TOKENS = 1024
const MAX_QUESTION_CHARS = 500

export const DAILY_QUESTION_SYSTEM_PROMPT = `You write the daily question for a couple in Indonesia who use a couples app to get to know each other better.

RULES:
- Write exactly ONE question in casual, warm English, the way a friend would ask it across the table.
- The question should get both of them talking and thinking about it together.
- Not too heavy and not too light. Aim for the sweet spot.
- BOTH partners must be able to answer it.
- Never ask about anything too private or sensitive.
- Keep it rooted in everyday life for young couples in Indonesia, in natural English.
- NEVER repeat or rephrase a question that was already asked, including ones written in Indonesian.
- Put only the question itself in the "question" field, with no explanation or quotation marks.

${AI_STYLE_RULES}`

export const DAILY_QUESTION_SCHEMA = {
  type: 'object',
  properties: {
    question: {
      type: 'string',
      description: 'The question, in English: one or two short sentences ending with a question mark.',
      minLength: 1,
      maxLength: MAX_QUESTION_CHARS,
    },
  },
  required: ['question'],
  additionalProperties: false,
}

// Type alias (not an interface) so it is assignable to the Json column type.
export type DailyQuestionContext = {
  myName: string | null
  myGender: string | null
  myAge: number | null
  myMbti: string | null
  partnerName: string | null
  partnerGender: string | null
  partnerAge: number | null
  partnerMbti: string | null
  daysTogether: number | null
  dayOfWeek: string
  upcomingEvents: string[]
  recentQuestions: string[]
}

function genderLabel(g: string | null): string {
  return g === 'male' || g === 'female' ? g : 'gender unknown'
}

export function buildDailyQuestionPrompt(c: DailyQuestionContext): string {
  const lines = [
    'About the couple:',
    `- ${c.myName ?? 'User'} (${genderLabel(c.myGender)}${c.myAge ? `, ${c.myAge} years old` : ''}${c.myMbti ? `, MBTI: ${c.myMbti}` : ''})`,
    `- ${c.partnerName ?? 'Partner'} (${genderLabel(c.partnerGender)}${c.partnerAge ? `, ${c.partnerAge} years old` : ''}${c.partnerMbti ? `, MBTI: ${c.partnerMbti}` : ''})`,
    c.daysTogether ? `- Together for ${c.daysTogether} ${c.daysTogether === 1 ? 'day' : 'days'}` : '',
    `- Today is ${c.dayOfWeek}`,
    c.upcomingEvents.length ? `- Coming up: ${c.upcomingEvents.join(', ')}` : '',
    '',
    c.recentQuestions.length
      ? `Questions ALREADY asked (do NOT repeat them):\n${c.recentQuestions.map((q) => `- ${q}`).join('\n')}`
      : '',
    '',
    'Write one personal, interesting daily question for this couple, in English.',
  ]
  return lines.join('\n')
}

export type DailyQuestionResult = { ok: true; question: string; usage: ClaudeUsage } | ClaudeFailure

/**
 * One Sonnet call → one question, billed to `coupleId` under 'daily_question'.
 * Never throws: a missing key, the daily cap, a refusal, a timeout or an
 * unusable answer come back as a ClaudeFailure.
 */
export async function generateDailyQuestion(
  coupleId: string,
  context: DailyQuestionContext,
  { timeoutMs = DAILY_QUESTION_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<DailyQuestionResult> {
  const result = await claudeJson<{ question: string }>({
    feature: 'daily_question',
    coupleId,
    system: DAILY_QUESTION_SYSTEM_PROMPT,
    prompt: buildDailyQuestionPrompt(context),
    schema: DAILY_QUESTION_SCHEMA,
    maxTokens: DAILY_QUESTION_MAX_TOKENS,
    timeoutMs,
    // One call per couple per day: a cache write would never be read back.
    cacheSystem: false,
  })
  if (!result.ok) return result

  const question = tidyAiText(result.data.question
    .trim()
    .replace(/^["“]|["”]$/g, '')
    .trim())
  if (!question) return { ok: false, reason: 'invalid', detail: 'empty question' }
  return { ok: true, question: question.slice(0, MAX_QUESTION_CHARS), usage: result.usage }
}
