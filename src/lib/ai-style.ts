// Writing rules shared by every prompt whose output people read in the app
// (daily question, date ideas). Mirrors docs/COPY-GUIDE.md: English output,
// Indonesian context, no em dashes, no emoji, no AI tells. Server-only.

/** Words the model must never use (COPY-GUIDE hard rule 3 plus the slop gate's list). */
const BANNED_WORDS = [
  'journey', 'unlock', 'seamless', 'elevate', 'embark', 'delve', 'tapestry', 'realm', 'foster',
  'navigate', 'leverage', 'robust', 'empower', 'unleash', 'testament', 'beacon', 'vibrant',
  'curated', 'crafted', 'effortless', 'transformative', 'holistic',
]

/** Stock relationship phrases that read as machine-written. */
const BANNED_PHRASES = [
  'treasure trove', 'deepen your bond', 'strengthen your relationship', 'create lasting memories',
  'cherish every moment',
]

/** Appended to a system prompt. */
export const AI_STYLE_RULES = `WRITING STYLE:
- Write in natural, casual English, like a warm friend texting. Never write in Indonesian, even if the context below contains Indonesian words.
- Indonesian names, places, foods and local words (for example mudik, arisan, kos, ojol, warung) are welcome inside an English sentence when there is no better English word.
- Never use em dashes or en dashes inside a sentence. Use a comma, a period or a colon instead.
- No emoji, no hashtags.
- Never use these words: ${BANNED_WORDS.join(', ')}.
- Never use these phrases: ${BANNED_PHRASES.map((p) => `"${p}"`).join(', ')}.
- Avoid the "it isn't about A, it's about B" contrast, openers that address two kinds of reader, lists of three adjectives and closing summaries.`

/**
 * Backstop for the no-dash rule: the prompt asks for it, this enforces it on
 * what the model returns. Em dashes and spaced en dashes become a comma; an en
 * dash inside a number range ("Rp 50.000–100.000") stays.
 */
export function tidyAiText(text: string): string {
  return text
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s+–\s+/g, ', ')
    .replace(/,\s*([.,!?;:])/g, '$1')
    .replace(/^\s*,\s*|\s*,\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
