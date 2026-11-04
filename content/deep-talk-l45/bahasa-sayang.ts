import type { DeepTalkL45Pack } from './types'

// "How We Show Love", levels 4 and 5. Targets stay null like levels 1-3, so the
// game alternates turns between the two partners on its own.
export const pack: DeepTalkL45Pack = {
  slug: 'bahasa-sayang',
  levels: [
    {
      level: 4,
      title: 'Harder to Say',
      description: 'The things we usually keep to ourselves.',
      questions: [
        { text: "When I keep asking where you are or whether you've eaten, does it feel like care or like being watched?", target: null },
        { text: 'How did your parents, or whoever raised you, show love to each other? Which part of it shows up in how you love me?', target: null },
        { text: "Is there something you've wanted from me for a long time but felt too shy or too proud to ask for?", target: null },
        { text: 'When did you last feel jealous, and what do you wish I had done right then?', target: null },
        { text: "When we're with our families, we tend to hold back with each other. Which bit of affection do you miss most then?", target: null },
        { text: "What's something I used to do when we first got together that I've stopped doing? Do you miss it?", target: null },
      ],
    },
    {
      level: 5,
      title: 'Still Choosing You',
      description: 'Love on the hard days, and for the long run.',
      questions: [
        { text: "After a fight, what's the smallest thing I could do that would help you come back to me?", target: null },
        { text: 'Is there something I said once, maybe as a joke, that stayed with you longer than I know?', target: null },
        { text: 'If you were stuck in bed for months one day, what would you want me to do for you, and what would you still want to do yourself?', target: null },
        { text: "Twenty years from now, what are you most afraid we'll stop doing for each other?", target: null },
        { text: 'Kids learn about love by watching the grown-ups around them. What do you hope the children in our lives pick up from us?', target: null },
        { text: 'If a day comes when I doubt that you love me, what do you want me to remember?', target: null },
      ],
    },
  ],
}
