import type { DeepTalkL45Pack } from './types'

export const pack: DeepTalkL45Pack = {
  slug: 'akar-keluarga',
  levels: [
    {
      level: 4,
      title: 'Closer to Home',
      description: 'The family topics most of us tiptoe around.',
      questions: [
        { text: "When you go back to your parents' house, for mudik or just a weekend, which old version of you comes back?", target: null },
        { text: 'Which sibling or cousin did your family compare you to growing up? Does it still follow you around?', target: null },
        { text: 'Which of your parents do you hear in your own voice when we argue? How do you feel about that?', target: null },
        { text: "When you're with my family, at Lebaran or any big gathering, what do you worry they think of you but never say?", target: null },
        { text: "What part of my family's ways is still hard for you to get used to? You can be honest with me.", target: null },
        { text: 'What do you feel you owe your parents, in money or in time, and how much of that do you expect us to share?', target: null },
      ],
    },
    {
      level: 5,
      title: 'What We Hand Down',
      description: 'The family we come from, and the one we make.',
      questions: [
        { text: 'As our parents get older and need more care, what do you picture us doing? What worries you most?', target: null },
        { text: 'If my parents and I ever disagreed on something big about us, what would you need from me?', target: null },
        { text: "Is there something you've slowly forgiven your parents for over the years? What helped you get there?", target: null },
        { text: "Have you drifted away from anyone in your family that you'd like to make peace with someday?", target: null },
        { text: "Which story from your family's past do you hope is never forgotten, even if it's a hard one?", target: null },
        { text: "When we're the older generation at family gatherings one day, what do you hope the young ones say about us?", target: null },
      ],
    },
  ],
}
