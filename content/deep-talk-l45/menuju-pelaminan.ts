import type { DeepTalkL45Pack } from './types'

export const pack: DeepTalkL45Pack = {
  slug: 'menuju-pelaminan',
  levels: [
    {
      level: 4,
      title: 'Two Families, One Wedding',
      description: 'When both families have a say in the big day.',
      questions: [
        { text: 'Who do you expect to pay for the wedding, our parents or the two of us? How would you feel if it went the other way?', target: null },
        { text: "Which parts of your family's adat matter to you personally, and which would you do mostly for your parents?", target: null },
        { text: "Your parents and mine will want to invite people we've never met. How much of the guest list feels fair to give them?", target: null },
        { text: 'What does your family hope each side will bring, like seserahan or mahar? How do you feel about it?', target: null },
        { text: "Would you borrow money to have the wedding our families want? Where's your limit?", target: null },
        { text: "If one of our parents isn't ready to give their blessing, what should we do, and how long would you wait?", target: null },
      ],
    },
    {
      level: 5,
      title: 'Long After the Wedding',
      description: 'What we promise each other once the guests go home.',
      questions: [
        { text: "What part of you are you afraid I'll get tired of once we see each other every day?", target: null },
        { text: "Think of your parents' marriage. What do you want to carry into ours, and what would you rather leave behind?", target: null },
        { text: "Is there anything from your past you'd rather tell me yourself than have me hear from someone else?", target: null },
        { text: 'If you got seriously ill a few years into our marriage, what would you most need from me?', target: null },
        { text: "On the days you don't feel in love with me, what will keep you choosing me?", target: null },
        { text: "What do you want to promise me that won't be in the vows?", target: null },
      ],
    },
  ],
}
