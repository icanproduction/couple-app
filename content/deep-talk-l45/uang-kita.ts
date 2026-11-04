import type { DeepTalkL45Pack } from './types'

export const pack: DeepTalkL45Pack = {
  slug: 'uang-kita',
  levels: [
    {
      level: 4,
      title: "Money We Don't Talk About",
      description: 'The parts most couples keep quiet about.',
      questions: [
        { text: "Where do you feel pressure to spend so you don't look stingy, like arisan or treating everyone on your birthday?", target: null },
        { text: 'Which money arguments did you overhear at home growing up, and what do you never want us to repeat?', target: null },
        { text: 'When relatives ask at Lebaran or Christmas how much we earn, what should we say, and who should answer?', target: null },
        { text: "Would you want some money that's only yours, no questions asked, even if we share everything else? How much feels fair?", target: null },
        { text: 'Have you ever hidden a purchase from someone, or said it cost less than it did? What was going on?', target: null },
        { text: "Is there a loan or paylater bill you'd feel nervous telling me about? You don't have to say the amount.", target: null },
      ],
    },
    {
      level: 5,
      title: 'For Richer or Poorer',
      description: 'The promises we keep when money gets hard.',
      questions: [
        { text: "What would 'enough' look like for us, the point where we could stop chasing more?", target: null },
        { text: "Say I ended up earning much less than you, or nothing for a while. Would you see me differently? Be honest, I'd rather know.", target: null },
        { text: "Is there something about money you've felt ashamed of? Share only what you're ready to. You don't have to carry it alone.", target: null },
        { text: 'If one of us made a big money mistake and kept it quiet, what would help us trust each other again?', target: null },
        { text: 'Would I know where to find your accounts and insurance if something happened to you tomorrow? What should I know now?', target: null },
        { text: 'One of our parents might need full-time care someday. Who would pay for it, and what would we be willing to give up?', target: null },
      ],
    },
  ],
}
