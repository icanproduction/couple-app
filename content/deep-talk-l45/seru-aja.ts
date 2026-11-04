import type { DeepTalkL45Pack } from './types'

// Just for Fun, levels 4 and 5. Bolder and sillier, never heavy, never mean.
export const pack: DeepTalkL45Pack = {
  slug: 'seru-aja', // copy-ok: stored value
  levels: [
    {
      level: 4,
      title: 'Plot Twists',
      description: 'Sillier choices and a few small confessions.',
      questions: [
        { text: 'Would you rather have every ojol driver tell you their whole life story, or have every warung already know your order and judge it a little?', target: null },
        { text: "What's something you pretended to like early on, just because I liked it? Time to come clean.", target: null },
        { text: 'Which of us would be the sinetron character who overhears a secret from behind a door and gasps while the camera zooms in three times?', target: null },
        { text: 'Would you rather sit through 12 hours of mudik traffic with an uncle who loves karaoke, or with a toddler who just learned the word "why"?', target: null },
        { text: "Invent a new jajanan on the spot. What's it called, and what's the one ingredient nobody would expect?", target: null },
        { text: "Confess the most dramatic thing you've done over something tiny. Sulking over the last kerupuk counts.", target: null },
      ],
    },
    {
      level: 5,
      title: 'Full Chaos Mode',
      description: 'Absurd what-ifs and wild guesses about each other.',
      questions: [
        { text: 'We wake up tomorrow as two cats sharing a room in a kos in Jogja. Walk me through our day.', target: null },
        { text: "Let's make up a secret code word right now that means \"get me out of this kondangan\". What is it, and how do we sneak it into a sentence?", target: null },
        { text: "Predict it: when we're 70, what will I be weirdly obsessed with? Be specific, I'll hold you to it.", target: null },
        { text: 'Aliens land and ask us to explain Indonesia using only three foods. Which three do we pick, and who does the talking?', target: null },
        { text: "Design our couple mascot. What animal is it, and what's the catchphrase it yells at us when we can't decide where to eat?", target: null },
        { text: 'You come home and announce you just adopted a goat. Guess my exact first sentence, then I get to say what I really would.', target: null },
      ],
    },
  ],
}
