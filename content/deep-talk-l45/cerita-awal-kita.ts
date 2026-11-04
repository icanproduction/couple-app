import type { DeepTalkL45Pack } from './types'

export const pack: DeepTalkL45Pack = {
  slug: 'cerita-awal-kita',
  levels: [
    {
      level: 4,
      title: "What We Didn't Say",
      description: 'The bits of our start we rarely bring up.',
      questions: [
        { text: 'What did you pretend to like back then just to impress me? You can admit it now.', target: null },
        { text: 'What was going on in your own life when we met that I never really knew about?', target: null },
        { text: 'Was there anyone you kept us a secret from at the start? What was that about?', target: null },
        { text: 'Did your parents or friends have doubts about me at first? What did they say, and what did you say back?', target: null },
        { text: 'When did you first get jealous over me? Did you ever tell me?', target: null },
        { text: "What part of yourself did you hide in the beginning because you weren't sure I'd like it?", target: null },
      ],
    },
    {
      level: 5,
      title: 'The Rest of Our Story',
      description: 'What we want to protect from here on.',
      questions: [
        { text: 'What scares you most about the years ahead of us? Tell me one way I can make it lighter.', target: null },
        { text: "Is there something about who I was in our early days that you miss? I'd like to know.", target: null },
        { text: 'If something I did back then still stings a little, what could I do about it now?', target: null },
        { text: 'What do you need from me when life gets hard that you were too shy to ask for when we first met?', target: null },
        { text: 'If we ever hit a season where we forget why we started, which memory should we go back to first?', target: null },
        { text: "When we're old, what's one little thing from our first year that you hope we're still doing?", target: null },
      ],
    },
  ],
}
