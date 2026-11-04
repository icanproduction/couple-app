import type { DeepTalkL45Pack } from './types'

// Faith & Values, levels 4 and 5. Written for couples who share a faith,
// practice it differently, or hold different beliefs or none.
export const pack: DeepTalkL45Pack = {
  slug: 'iman-dan-nilai', // copy-ok: stored value
  levels: [
    {
      level: 4,
      title: 'Doubts & Differences',
      description: "The parts we're still unsure about, said out loud.",
      questions: [
        { text: "What's a question about faith or life you still don't have an answer to, and does not knowing bother you?", target: null },
        { text: "Is there something you were raised to believe that you've quietly let go of, or now see differently?", target: null },
        { text: 'Do you ever feel pressure to look more religious, or less, than you really are? Where does that pressure come from?', target: null },
        { text: "Has the way I practice my beliefs, or don't, ever made you feel left out or unsure? I'd like to know.", target: null },
        { text: 'When your family gets together for Lebaran, Natal, Nyepi or any other holiday, which tradition do you love, and which do you go along with to keep the peace?', target: null },
        { text: 'If we have kids one day, what would you want them to learn about faith from us, and what would you let them decide for themselves?', target: null },
      ],
    },
    {
      level: 5,
      title: 'What We Stand For',
      description: 'Forgiveness, and what we hope our life will say.',
      questions: [
        { text: "Do you feel you're here for a reason? If you do, what is it, and where do I fit in? If you don't, tell me that too.", target: null },
        { text: 'What do you believe happens when we die, if anything? Does it change how you want to live now?', target: null },
        { text: "Is there someone you're still trying to forgive, maybe even yourself? What would help you let it go?", target: null },
        { text: "When I've hurt you, what actually helps you forgive me, and what only makes things look fine on the surface?", target: null },
        { text: 'If one of us changes what we believe someday, what do you hope never changes between us?', target: null },
        { text: 'If the people closest to us judged what we stand for only by how we treat them, what would you want them to see?', target: null },
      ],
    },
  ],
}
