import type { DeepTalkL45Pack } from './types'

// "Shared Dreams", levels 4 and 5. Targets stay null like levels 1-3, so the
// game alternates turns between the two partners on its own.
export const pack: DeepTalkL45Pack = {
  slug: 'mimpi-berdua',
  levels: [
    {
      level: 4,
      title: 'What It Costs',
      description: 'The hard side of wanting something big.',
      questions: [
        { text: "Is there a dream of yours you've stopped mentioning because you think I won't like it?", target: null },
        { text: 'If a scholarship abroad meant two years of us living apart, would you take it? What would make it worth it to you?', target: null },
        { text: "Your parents probably had plans for you, like a safe civil service job. Which of their hopes are you still trying to live up to, even if it isn't your dream?", target: null },
        { text: 'Say your biggest dream came true. What are you afraid it would change about you, or about us?', target: null },
        { text: 'If one of us wanted to quit a steady job to start a small business, how much of our savings would you risk on it?', target: null },
        { text: "If my career took off faster than yours, how do you think you'd really feel?", target: null },
      ],
    },
    {
      level: 5,
      title: 'Whatever Comes',
      description: 'When plans fall apart, and what we leave behind.',
      questions: [
        { text: 'If our biggest plan fell apart, say the business failed or the house never got built, what would you want us to still have?', target: null },
        { text: 'If you ever have to let a dream go for good, how should I be with you while it hurts?', target: null },
        { text: 'People change. If one day your dreams start pulling away from mine, how would you want us to talk about it?', target: null },
        { text: "Is there something you've promised your parents, like taking them on a pilgrimage or building them a house, that you hope we'll do together?", target: null },
        { text: "Long after we're gone, what do you hope is still standing because the two of us built it?", target: null },
        { text: "Has chasing one of my plans ever cost you something you never mentioned? I'd like to hear it now.", target: null },
      ],
    },
  ],
}
