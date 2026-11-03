import type { SpendingAnswer } from './types'

export interface SpendingQuestion {
  id: number
  question: string
  options: {
    key: SpendingAnswer
    text: string
    scores: Partial<Record<'IP_impulse' | 'IP_planning' | 'SO_other' | 'PF_present' | 'PF_future' | 'AW_high' | 'AW_low' | 'AW_medium', number>>
  }[]
}

export const SPENDING_QUESTIONS: SpendingQuestion[] = [
  {
    id: 1,
    question: 'It\'s payday. What\'s the first thing you do?',
    options: [
      { key: 'A', text: 'Move money into savings right away, following the monthly budget I already set', scores: { IP_planning: 2, PF_future: 2, AW_high: 1 } },
      { key: 'B', text: 'Pay all the bills first and figure out the rest later', scores: { IP_planning: 1, AW_high: 1 } },
      { key: 'C', text: 'Treat myself to something I\'ve wanted for a while', scores: { IP_impulse: 1, PF_present: 2 } },
      { key: 'D', text: 'I don\'t really notice. The money in my account just gets spent', scores: { AW_low: 3 } },
    ],
  },
  {
    id: 2,
    question: 'You\'re at the mall with your partner and spot a great jacket at a fair price. What are you most likely to do?',
    options: [
      { key: 'A', text: 'Buy it now before it sells out', scores: { IP_impulse: 2, PF_present: 2 } },
      { key: 'B', text: 'Ask my partner what they think before buying', scores: { SO_other: 1, IP_planning: 1 } },
      { key: 'C', text: 'Snap a photo and compare prices at other shops when I get home', scores: { IP_planning: 2, AW_high: 1 } },
      { key: 'D', text: 'Leave it. Maybe another time', scores: { IP_planning: 1, PF_future: 1 } },
    ],
  },
  {
    id: 3,
    question: 'Your partner\'s birthday is a month away. How do you handle the gift?',
    options: [
      { key: 'A', text: 'I\'ve been thinking about it for ages and already saved up for it', scores: { SO_other: 2, IP_planning: 2 } },
      { key: 'B', text: 'Buy the most expensive thing I can afford, whatever it is', scores: { SO_other: 3, IP_impulse: 1 } },
      { key: 'C', text: 'Set a budget range first, then find something that fits', scores: { IP_planning: 2, AW_high: 1 } },
      { key: 'D', text: 'It only crosses my mind when the date is close', scores: { AW_low: 2, IP_impulse: 1 } },
    ],
  },
  {
    id: 4,
    question: 'It\'s the 28th and you\'re not sure what\'s in your account. What do you do?',
    options: [
      { key: 'A', text: 'I always know my balance down to the last rupiah', scores: { AW_high: 3 } },
      { key: 'B', text: 'Check it right now, a bit worried', scores: { AW_high: 1, PF_future: 1 } },
      { key: 'C', text: 'I have a rough idea, just not the exact number', scores: { AW_medium: 1 } },
      { key: 'D', text: 'No idea. I usually wait for the low balance alert', scores: { AW_low: 3 } },
    ],
  },
  {
    id: 5,
    question: 'A friend invites you out tonight to a pricey place, and your budget is tight. What do you do?',
    options: [
      { key: 'A', text: 'Go anyway. Nights out with friends are priceless', scores: { IP_impulse: 2, PF_present: 2 } },
      { key: 'B', text: 'Go, but order the cheapest thing on the menu', scores: { IP_planning: 1, AW_high: 1 } },
      { key: 'C', text: 'Suggest moving it to a cheaper place', scores: { IP_planning: 2, PF_future: 1 } },
      { key: 'D', text: 'Skip it. I don\'t want to break the budget', scores: { PF_future: 2, AW_high: 1 } },
    ],
  },
  {
    id: 6,
    question: 'Your partner says they really want something, and it\'s pricey. Your move?',
    options: [
      { key: 'A', text: 'Find a way to make it happen, whatever it takes', scores: { SO_other: 3, IP_impulse: 1 } },
      { key: 'B', text: 'Love hearing it and start saving for it together now', scores: { SO_other: 2, IP_planning: 2 } },
      { key: 'C', text: 'Talk it through first. Is this on our priority list?', scores: { IP_planning: 2, AW_high: 1 } },
      { key: 'D', text: 'Just listen. They\'ll forget about it soon', scores: { AW_low: 2 } },
    ],
  },
  {
    id: 7,
    question: 'Something you\'ve wanted for ages is 60% off in a flash sale, and you have to pay today. What do you do?',
    options: [
      { key: 'A', text: 'Buy it. A discount like that won\'t come again', scores: { IP_impulse: 3, PF_present: 2 } },
      { key: 'B', text: 'Check the budget first and buy it if there\'s room', scores: { AW_high: 2, IP_planning: 1 } },
      { key: 'C', text: 'Ask my partner first', scores: { SO_other: 1, IP_planning: 1 } },
      { key: 'D', text: 'Skip it. I don\'t want to mess up this month\'s money', scores: { PF_future: 2, AW_high: 1 } },
    ],
  },
  {
    id: 8,
    question: 'You and your partner want to start saving together. How do you go about it?',
    options: [
      { key: 'A', text: 'Make a spreadsheet with a monthly target and a clear deadline', scores: { IP_planning: 3, AW_high: 2 } },
      { key: 'B', text: 'Transfer whatever feels like enough each month', scores: { AW_medium: 1 } },
      { key: 'C', text: 'I like the idea but have no clue where to start', scores: { AW_low: 1, IP_impulse: 1 } },
      { key: 'D', text: 'Let my partner decide the numbers', scores: { SO_other: 1, AW_low: 2 } },
    ],
  },
  {
    id: 9,
    question: 'There\'s a decent amount left at the end of the month. What do you most likely do with it?',
    options: [
      { key: 'A', text: 'Put it straight into savings', scores: { PF_future: 3, IP_planning: 2 } },
      { key: 'B', text: 'Take my partner out for dinner or a little date as a treat', scores: { SO_other: 2, PF_present: 1 } },
      { key: 'C', text: 'Buy something I\'ve wanted for a while', scores: { IP_impulse: 2, PF_present: 2 } },
      { key: 'D', text: 'Leave it in the account. It\'ll get spent somehow', scores: { AW_low: 2 } },
    ],
  },
  {
    id: 10,
    question: 'Your partner feels you spend too much, or too little. How do you respond?',
    options: [
      { key: 'A', text: 'Listen, then ask that we sit down and make a plan together', scores: { IP_planning: 2, SO_other: 1 } },
      { key: 'B', text: 'Defend myself. I think my spending is reasonable', scores: { IP_impulse: 1, AW_medium: 1 } },
      { key: 'C', text: 'Agree and say sorry. I want to change right away', scores: { SO_other: 2 } },
      { key: 'D', text: 'Feel confused, because I don\'t really track my spending', scores: { AW_low: 3 } },
    ],
  },
  {
    id: 11,
    question: 'When there\'s extra money, where does it go first?',
    options: [
      { key: 'A', text: 'Savings or investments', scores: { PF_future: 3, IP_planning: 2 } },
      { key: 'B', text: 'Experiences with my partner (trips, dates and so on)', scores: { SO_other: 1, PF_present: 2, IP_impulse: 1 } },
      { key: 'C', text: 'Gifts or surprises for the people I love', scores: { SO_other: 3 } },
      { key: 'D', text: 'An upgrade for myself', scores: { PF_present: 2, IP_impulse: 1 } },
    ],
  },
  {
    id: 12,
    question: 'There\'s something expensive you want, and you can pay it off at 0% over 12 months. Your move?',
    options: [
      { key: 'A', text: 'Take it. Small installments, and I get to enjoy it now', scores: { IP_impulse: 2, PF_present: 2 } },
      { key: 'B', text: 'Work out the installments against my savings before deciding', scores: { AW_high: 2, IP_planning: 2 } },
      { key: 'C', text: 'Ask my partner first. It\'s a big decision', scores: { SO_other: 1, IP_planning: 1 } },
      { key: 'D', text: 'Avoid installments whenever I can', scores: { PF_future: 2, AW_high: 1 } },
    ],
  },
  {
    id: 13,
    question: 'Your partner asks for a romantic dinner. How do you handle the budget?',
    options: [
      { key: 'A', text: 'Look up the best place within a reasonable budget', scores: { IP_planning: 2, AW_high: 1 } },
      { key: 'B', text: 'Go somewhere really special, whatever it costs', scores: { SO_other: 2, IP_impulse: 1 } },
      { key: 'C', text: 'Wherever my partner wants. I\'ll just go along', scores: { AW_low: 1, SO_other: 1 } },
      { key: 'D', text: 'Suggest eating at home or cooking together to save money', scores: { PF_future: 1, IP_planning: 1 } },
    ],
  },
  {
    id: 14,
    question: 'How open are you with your partner about your finances?',
    options: [
      { key: 'A', text: 'Very open. My partner knows almost everything about my money', scores: { SO_other: 2, AW_high: 1 } },
      { key: 'B', text: 'Open, but I keep a few things private', scores: { AW_high: 1 } },
      { key: 'C', text: 'We rarely talk about it. I\'m not hiding anything, it just doesn\'t come up', scores: { AW_low: 2 } },
      { key: 'D', text: 'I don\'t really know the details of my own finances', scores: { AW_low: 3 } },
    ],
  },
  {
    id: 15,
    question: 'Thinking 5 years ahead, what excites you most?',
    options: [
      { key: 'A', text: 'Owning a home and being financially stable with my partner', scores: { PF_future: 3, SO_other: 1 } },
      { key: 'B', text: 'Having lots of great experiences and memories together', scores: { PF_present: 2, SO_other: 1 } },
      { key: 'C', text: 'My partner and family being happy and well looked after', scores: { SO_other: 3 } },
      { key: 'D', text: 'No idea. I\'ll take it as it comes', scores: { AW_low: 2 } },
    ],
  },
]
