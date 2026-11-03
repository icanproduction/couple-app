// Built-in Truth or Dare deck. Pure data with no runtime imports, so
// scripts/verify/game-truth-or-dare.mjs can load it straight from Node.
//
// Rules (checked by the verify script): at least 25 truths and 25 dares per
// heat, each card at most 160 characters, no duplicates. Brave is bolder and
// more vulnerable but never sexual, no alcohol, nothing dangerous, no public
// humiliation, and nothing that costs more than Rp 50.000. Most dares work on
// a video call too; the few that need you in the same room (a hug, a shoulder
// rub) can be swapped.

export type TodKind = 'truth' | 'dare'
export type TodHeat = 'sweet' | 'playful' | 'brave'

export interface TodCard {
  id: string
  kind: TodKind
  heat: TodHeat
  body: string
}

export const TOD_HEATS: readonly TodHeat[] = ['sweet', 'playful', 'brave']
export const TOD_KINDS: readonly TodKind[] = ['truth', 'dare']
export const TOD_BODY_MAX = 160

export const TOD_HEAT_INFO: Record<TodHeat, { name: string; line: string; color: string; soft: string }> = {
  sweet: {
    name: 'Sweet',
    line: 'Soft questions and easy dares. Good for any night.',
    color: '#E0667F',
    soft: '#FDE8EC',
  },
  playful: {
    name: 'Playful',
    line: 'Silly dares and questions that tease a little.',
    color: '#D9902F',
    soft: '#FDF1DE',
  },
  brave: {
    name: 'Brave',
    line: 'Bolder dares and honest questions. Still kind, never crude.',
    color: '#7A4FB5',
    soft: '#EFE8F8',
  },
}

const SWEET_TRUTHS = [
  'What did you think of me the very first time we met?',
  'Which of my little habits do you secretly like?',
  'What song makes you think of me, and why that one?',
  'When did you first realize you wanted to keep seeing me?',
  "What's your favorite photo of us, and what happened right before it was taken?",
  "Which meal we've shared do you still think about?",
  'What do I do that makes a bad day better?',
  'If we had a whole Sunday with zero plans, how would you spend it with me?',
  "What's the sweetest message I've ever sent you?",
  'What did you tell your closest friend about me after our first date?',
  "What's something small I did once that I've probably forgotten but you haven't?",
  'Which warung or street stall feels like our place to you?',
  "What do you miss most about me when we're apart?",
  'If you had to give me a new nickname today, what would it be?',
  'What surprised you about me, in a good way, once we got close?',
  'When do you feel most at home with me?',
  'Which day out with me would you happily repeat, start to finish?',
  'What dish do you want to learn to cook for me?',
  'When did you last feel really proud of me?',
  "What's your favorite memory of us waiting out the rain under some shop roof?",
  'Which of my outfits do you like most?',
  'What am I better at than I give myself credit for?',
  'What tiny ritual of ours would you never want to lose?',
  'What part of my hometown do you want to see with me on the next mudik?',
  "What's the story of us you love telling other people?",
  'What was the first thing you noticed about me?',
] as const

const SWEET_DARES = [
  'Describe our first date like a radio announcer, in under a minute.',
  'Give them three honest compliments without using the word "nice".',
  'Hum a song that reminds you of them until they guess it.',
  'Find the oldest photo of the two of you on your phone and tell the story behind it.',
  'Make up a four-line pantun about them on the spot.',
  'Do your best impression of how they say good morning.',
  "Plan our next date out loud in 60 seconds, including where we'll eat.",
  'Send them a voice note they can replay on a bad day.',
  'Draw their portrait in 30 seconds and give it a title.',
  'Tell them five things you like about them, fast, without stopping.',
  'Make them a cup of tea or kopi exactly the way they like it.',
  'Set a photo of the two of you as your lock screen until tomorrow.',
  "Teach them one word from your regional language or your family's slang.",
  'Recreate your first selfie together, same pose and all.',
  'Give them a 30-second shoulder rub.',
  'Play them the song that was on repeat when you started falling for them.',
  'Thank them for two specific things they did for you this month.',
  'Find the first chat message you ever sent them and read it out loud.',
  'Draw a small heart on your hand and keep it there for the rest of the game.',
  'Order their favorite gorengan or snack to their door, under Rp 25.000.',
  "Hug them for a full 20 seconds, and don't be the first to let go.",
  'Raise your glass of water or teh manis and make a short toast to them.',
  'Finish this sentence three different ways: "I feel safe with you when..."',
  "Pick a date you'd like to repeat and put it on the calendar right now.",
  'Write their name in your best handwriting and present it to them like an award.',
  "Describe the face they make when they're concentrating, then do it.",
] as const

const PLAYFUL_TRUTHS = [
  "What's the most ridiculous thing you've googled because of me?",
  'Which of my habits would you ban for a week if you could?',
  'Have you ever pretended to like something I cooked? Which one?',
  "What's the silliest argument we've ever had?",
  'If I were a sinetron character, who would I be?',
  "Who in your family likes me the most, and who's still deciding?",
  'Which of my phrases do you catch yourself copying?',
  "What's the worst gift I've ever given you? Be honest.",
  'How far back have you scrolled through my old photos?',
  "What's my most annoying habit when we're stuck in traffic?",
  'If we entered a cooking contest together, which of us gets us eliminated first?',
  "What's the weirdest dream you've had about me?",
  'Which of my snacks have you eaten and then blamed on someone else?',
  'Be honest: what would you rate my singing out of ten?',
  'If we swapped lives for a day, what would you do first as me?',
  "What's the most embarrassing thing you did to impress me early on?",
  "Who's the bigger drama queen or king here, and what's your evidence?",
  'Which of my chat habits drives you up the wall?',
  'What small lie did you tell on one of our first dates?',
  'Which family group chat scares you the most?',
  "What's the funniest thing you've overheard me say on the phone?",
  'If we got a cat, what ridiculous name would you insist on?',
  'What do I always order that you secretly think is a strange choice?',
  "What's your survival plan for when I'm hungry and grumpy?",
  "If you couldn't use my real name, what would my contact name in your phone be?",
  'Which of my friends would you trust least with a secret?',
] as const

const PLAYFUL_DARES = [
  'Act out a sinetron shocked face, dramatic zoom sound effect included.',
  "Talk like a TV news anchor until it's your turn again.",
  "Pretend to be an ojol driver who can't find their house, and call them about it.",
  'Sing the chorus of a dangdut song with full feeling.',
  'Sell them the nearest object like a live shopping host, for one minute.',
  'Let them pick your phone wallpaper until tomorrow.',
  'Do 10 squats while singing Balonku Ada Lima.',
  'Show them the last five photos in your gallery, no skipping.',
  'Read your last sent message out loud in your most dramatic voice.',
  'Do a runway walk across the room and finish with a pose.',
  'Make up a jingle for their favorite snack, at least four lines long.',
  "Whisper everything you say until it's your turn again.",
  'Let them style your hair however they want for the rest of the game.',
  'Describe your day so far like the trailer for a horror film.',
  "Narrate what they're doing like a nature documentary, for one minute.",
  'Give a dramatic reading of the ingredients on the nearest snack packet.',
  'Send your closest friend a message made only of stickers and show them the reply.',
  'Act out your reaction when your favorite warung runs out of your usual order.',
  'Teach them a dance move from a song you love, then do it together.',
  'Do a 30-second stand-up routine about our relationship.',
  'Introduce them like a boxer walking into the ring.',
  'Let them choose a word you have to sneak into every sentence until your next turn.',
  'Recreate a famous meme face and let them guess which one it is.',
  'Call them by a royal title until the game ends.',
  'Be the MC at a kondangan for 30 seconds and announce our arrival.',
  "Speak only in rhymes until it's your turn again.",
] as const

const BRAVE_TRUTHS = [
  'What have you wanted to tell me but kept putting off?',
  'When did you last feel lonely in this relationship?',
  'What fear about our future have you never said out loud?',
  'What do you need more of from me right now?',
  'Is there a fight we had that still bothers you?',
  'How have I hurt you without meaning to?',
  'What part of yourself do you still hide from me?',
  'What does your family expect from us that worries you?',
  'When do you feel least understood by me?',
  'What would you change about how we handle money?',
  'What dream did you give up on that you still think about?',
  "What's the hardest thing about loving me?",
  "What did your parents' relationship teach you that you don't want to repeat?",
  'When did you last cry, and did you tell me about it?',
  'What promise do you want us to keep no matter what?',
  'Whose family should we visit first at Lebaran, and does our plan feel fair to you?',
  'What have you forgiven me for without ever mentioning it?',
  'How much should we set aside for our parents each month? Have we really talked about it?',
  "Which of my habits have you been quietly hoping I'd change?",
  'What from your past do you still feel guilty about?',
  'What scares you most about growing old together?',
  "What do you wish you'd known about me before we got serious?",
  "How should I support you when you're stressed but don't want to talk?",
  'What compliment have you always wanted to hear from me?',
  "What do you think we're both avoiding talking about?",
  "Is there something about my family you find hard but haven't told me?",
] as const

const BRAVE_DARES = [
  'Look into their eyes for 60 seconds without talking or laughing.',
  "Tell them one thing you've never said out loud to anyone.",
  "Apologize for something specific you've been meaning to apologize for.",
  'Tell them about a time you felt jealous and what it was really about.',
  'Record a one-minute voice note for them to play on our next anniversary.',
  'Let them ask you one follow-up question about anything, and answer it fully.',
  'Message your mom or dad one thing you appreciate about them, then show your partner the message.',
  "Say the first lines of the vows you'd write for them, right now.",
  'Show them your screen time for this week and explain your top app.',
  'Tell them one thing they do that hurts you, and one thing they do that heals it.',
  'Name a fear you have and let them suggest one tiny step to face it.',
  'Describe the life you picture for us ten years from now, in detail.',
  `Hold their hand and finish this sentence honestly: "I'm sorry for..."`,
  'Ask them for something you need, plainly, without softening it.',
  'Show them a photo from a time in your life you rarely talk about, and tell them why.',
  'Let them pick one bad habit for you to drop for a week, starting tomorrow.',
  "Say a question you've been afraid to ask them. Then ask it properly, face to face.",
  "Tell them a secret ambition and what's stopping you from going for it.",
  'Write them a short letter on paper and give it to them before the game ends.',
  'Name two things you want to do better as a partner, and ask which matters more to them.',
  "Tell them about a moment you almost gave up on us, and why you didn't.",
  'Order something small under Rp 50.000 that proves you listen to them.',
  'Read out a note or unsent message on your phone that you never planned to share.',
  "Tell them what you think they need to hear right now, even if it's hard to say.",
  'Ask them for one thing you could do better this month, then listen. No defending yourself.',
  "Agree, while you're both calm, on how you want to handle your next big fight.",
] as const

function build(heat: TodHeat, kind: TodKind, bodies: readonly string[]): TodCard[] {
  const prefix = heat[0] + kind[0]
  return bodies.map((body, i) => ({ id: prefix + String(i + 1).padStart(2, '0'), kind, heat, body }))
}

export const TOD_DECK: readonly TodCard[] = [
  ...build('sweet', 'truth', SWEET_TRUTHS),
  ...build('sweet', 'dare', SWEET_DARES),
  ...build('playful', 'truth', PLAYFUL_TRUTHS),
  ...build('playful', 'dare', PLAYFUL_DARES),
  ...build('brave', 'truth', BRAVE_TRUTHS),
  ...build('brave', 'dare', BRAVE_DARES),
]
