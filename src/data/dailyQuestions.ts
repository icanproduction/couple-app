import { todayJakarta } from '@/lib/dates'

export const DAILY_QUESTIONS: string[] = [
  "What's your favorite moment with your partner from the past month?",
  "What's one small thing your partner did today that made you smile?",
  'Which shared dream do you most want to make happen this year?',
  "Name three of your partner's best qualities.",
  'How do you most naturally show love?',
  "What's the sweetest memory the two of you have made together?",
  'How do you show support when your partner is worn out?',
  "What's something new you'd like to learn or try together?",
  'What little tradition do you love most as a couple?',
  'Which song reminds you of your partner the most?',
  'How do you two settle a disagreement?',
  'Where do you most want to travel together?',
  'What are you most grateful for about having your partner in your life?',
  'How do you balance time together with time on your own?',
  'What dish would you most like to cook or eat together?',
  "What's the biggest thing you've achieved as a couple?",
  'How does your partner show you they care?',
  'What topic gets you both excited every time it comes up?',
  "What's one small change you could make for your partner this week?",
  'What hobby or activity would you like to start together?',
  'How do you each make sure the other feels appreciated?',
  'What movie or series do you want to watch together next?',
  "What do you miss most about your partner when you're apart?",
  "What's one thing that sets the two of you apart from other couples?",
  "What's the best way your partner cheers you up when you're sad?",
  'Which plan for the years ahead excites you both the most?',
  'What value matters most to you both as a couple?',
  "How do you support each other's personal goals?",
  'What small everyday thing do you enjoy most together?',
  "What have you been meaning to tell your partner but haven't yet?",
  'How do you celebrate small wins together?',
  "What's one good habit you'd like to build together?",
  'What first caught your eye about your partner?',
  'How does your partner bring out the best in you?',
  'What outdoor activity would you most like to do together?',
  "What makes you happiest when you're with your partner?",
  'How do you keep the spark alive day to day?',
  'What book would you read together, or recommend to each other?',
  "What's one hard thing you got through together that makes you proud?",
  'How do you talk things through when one of you needs some space?',
  'What funny memory still makes you both laugh?',
  "What's the wildest dream you've ever talked about together?",
  'How do you keep trust and honesty strong between you?',
  'What would you like to work on in yourself to be a better partner?',
  "What's your favorite way to spend a day off together?",
  'How does your partner inspire you in everyday life?',
  "What's the decision you made together that you're proudest of?",
  'What makes you feel most safe and at ease with your partner?',
  'How do you look after each other on a rough day?',
  "What's one thing about this time with your partner that you'll always want to remember?",
]

/**
 * Question of the day, rotating by day-of-year of the JAKARTA date (Jan 1 = 1).
 * The home page renders on the server (UTC on Vercel), so the server clock's
 * local date would roll at 07:00 WIB instead of midnight.
 */
export function getTodayQuestion(dateKey: string = todayJakarta()): { question: string; index: number } {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dayOfYear = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000)
  const index = dayOfYear % DAILY_QUESTIONS.length
  return { question: DAILY_QUESTIONS[index], index }
}
