// AI daily question: the prompt and the model call. Server-only — imported by
// src/app/api/ai/daily-question/route.ts, which owns auth, the claim and the
// context queries. Never import it from a client component.
import { generateText } from 'ai'
import { providerOptionsFor } from '@/lib/llm-provider/provider'
import { LlmNotConfiguredError, type Llm } from '@/lib/llm'
import { AI_STYLE_RULES, tidyAiText } from '@/lib/ai-style'

/** One short question; the whole call (retries included) must end well before the 90 s stale-claim window. */
export const DAILY_QUESTION_TIMEOUT_MS = 30_000
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
- Output ONLY the question, with no explanation, quotation marks or anything else.

${AI_STYLE_RULES}`

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

/** One model call → one question. Throws on a missing key, provider errors, or an empty answer. */
export async function generateDailyQuestion(
  llm: Llm,
  context: DailyQuestionContext,
  { timeoutMs = DAILY_QUESTION_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<string> {
  if (!llm.configured) throw new LlmNotConfiguredError()

  const result = await generateText({
    model: llm.model(),
    instructions: DAILY_QUESTION_SYSTEM_PROMPT,
    prompt: buildDailyQuestionPrompt(context),
    // Room for the (low) reasoning tokens plus one short question.
    maxOutputTokens: 2048,
    maxRetries: llm.maxRetries,
    abortSignal: AbortSignal.timeout(timeoutMs),
    // One short question: low reasoning effort is enough.
    providerOptions: providerOptionsFor('low'),
  })

  const question = tidyAiText(result.text
    .trim()
    .replace(/^["“]|["”]$/g, '')
    .trim())
  if (!question) throw new Error(`empty response (finish reason ${result.finishReason})`)
  return question.slice(0, MAX_QUESTION_CHARS)
}
