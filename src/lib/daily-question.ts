// AI daily question: the prompt and the model call. Server-only — imported by
// src/app/api/ai/daily-question/route.ts, which owns auth, the claim and the
// context queries. Never import it from a client component.
import { generateText } from 'ai'
import { providerOptionsFor } from '@/lib/llm-provider/provider'
import { LlmNotConfiguredError, type Llm } from '@/lib/llm'

/** One short question; the whole call (retries included) must end well before the 90 s stale-claim window. */
export const DAILY_QUESTION_TIMEOUT_MS = 30_000
const MAX_QUESTION_CHARS = 500

export const DAILY_QUESTION_SYSTEM_PROMPT = `Kamu adalah AI yang membantu pasangan Indonesia untuk saling mengenal lebih dalam melalui pertanyaan harian.

ATURAN:
- Generate SATU pertanyaan dalam Bahasa Indonesia yang casual dan hangat
- Pertanyaan harus mendorong diskusi dan refleksi bersama
- Jangan terlalu berat atau terlalu ringan — cari sweet spot
- Pertanyaan harus bisa dijawab oleh KEDUA pasangan
- Jangan pernah menanyakan hal yang terlalu pribadi/sensitif
- Gunakan bahasa anak muda Indonesia yang natural
- JANGAN ulangi pertanyaan yang sudah pernah ditanyakan
- Output HANYA pertanyaan saja, tanpa penjelasan atau embel-embel lain`

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
  return g === 'male' ? 'cowok' : g === 'female' ? 'cewek' : 'unknown'
}

export function buildDailyQuestionPrompt(c: DailyQuestionContext): string {
  const lines = [
    'Konteks pasangan:',
    `- ${c.myName ?? 'User'} (${genderLabel(c.myGender)}${c.myAge ? `, ${c.myAge} tahun` : ''}${c.myMbti ? `, MBTI: ${c.myMbti}` : ''})`,
    `- ${c.partnerName ?? 'Pasangan'} (${genderLabel(c.partnerGender)}${c.partnerAge ? `, ${c.partnerAge} tahun` : ''}${c.partnerMbti ? `, MBTI: ${c.partnerMbti}` : ''})`,
    c.daysTogether ? `- Sudah bersama ${c.daysTogether} hari` : '',
    `- Hari ini: ${c.dayOfWeek}`,
    c.upcomingEvents.length ? `- Event mendatang: ${c.upcomingEvents.join(', ')}` : '',
    '',
    c.recentQuestions.length
      ? `Pertanyaan yang SUDAH ditanyakan (JANGAN ulangi):\n${c.recentQuestions.map((q) => `- ${q}`).join('\n')}`
      : '',
    '',
    'Generate satu pertanyaan harian yang personal dan menarik untuk pasangan ini.',
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

  const question = result.text
    .trim()
    .replace(/^["“]|["”]$/g, '')
    .trim()
  if (!question) throw new Error(`empty response (finish reason ${result.finishReason})`)
  return question.slice(0, MAX_QUESTION_CHARS)
}
