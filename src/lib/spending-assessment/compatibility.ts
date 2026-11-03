import type { SpendingType } from './types'

export interface CompatibilityInfo {
  headline: string
  insight: string
  tips: string[]
}

function key(a: SpendingType, b: SpendingType): string {
  return [a, b].sort().join('+')
}

const COMPAT: Record<string, CompatibilityInfo> = {
  'explorer+explorer': {
    headline: 'Double Fun, Double Chaos',
    insight: 'Your relationship is full of fun and spontaneous moments. Money planning could be your biggest weak spot, though, since neither of you is likely to keep the savings goals on track.',
    tips: ['Pick one day a month for a money date', 'Make saving a game: who can spend less this month?', 'Set savings to move automatically at the start of the month, before you can spend it'],
  },
  'explorer+guardian': {
    headline: 'Classic Tension, Perfect Balance',
    insight: 'This is the most common pairing and the one that argues about money most. The Explorer feels held back and the Guardian feels the Explorer is careless. If you can meet in the middle, this becomes the most balanced pair of all.',
    tips: ['Set up a fun fund the Explorer can spend with no questions asked', 'Let the Guardian handle long-term savings', 'Agree on an amount either of you can spend without checking first'],
  },
  'explorer+giver': {
    headline: 'Big Hearts, Thin Plans',
    insight: 'You\'re both generous and happy to spend on time together. Your money chemistry is good, but savings goals take extra effort because you both live in the moment.',
    tips: ['Automate savings before the month starts', 'Set a spending limit for gifts', 'One of you needs to be the money captain'],
  },
  'explorer+architect': {
    headline: 'It Works With Good Talks',
    insight: 'The Architect will get frustrated with the Explorer\'s impulses, but the Explorer brings the spontaneity the Architect needs. The trick: the Architect doesn\'t micromanage, and the Explorer respects the system you built together.',
    tips: ['Create a yes fund the Explorer can spend without explaining', 'Let the Architect build a simple savings system', 'Don\'t talk about money every time you meet'],
  },
  'explorer+drifter': {
    headline: 'Fun, But Needs an Anchor',
    insight: 'You both go with the flow. Time together is fun, but with no one keeping an eye on money, long-term goals can slip away.',
    tips: ['One of you has to step up as money captain', 'Use this app to track a savings goal', 'Set an automatic transfer to savings at the start of the month'],
  },
  'guardian+guardian': {
    headline: 'Rock Steady, Remember to Live',
    insight: 'Your finances are almost certainly safe. The risk is getting so rigid that you forget to enjoy yourselves.',
    tips: ['Budget an experience fund you have to spend every month', 'Take turns being the one who decides on a whim', 'Don\'t pick apart every small expense'],
  },
  'giver+guardian': {
    headline: 'Guardian Protects, Giver Warms',
    insight: 'The Guardian brings the stability the Giver needs, and the Giver reminds the Guardian that money is also for enjoying and sharing. You complement each other well.',
    tips: ['Guardian: give the Giver a love budget with no receipts needed', 'Giver: trust the Guardian with the money planning', 'Don\'t go around the system you set up together'],
  },
  'architect+guardian': {
    headline: 'The Money Dream Team',
    insight: 'You both plan ahead and know where your money goes. The main risk: getting so analytical that you forget spontaneity and romance.',
    tips: ['Schedule a no-budget date once a month', 'Make a spending category just for experiences', 'Celebrate your money milestones together'],
  },
  'drifter+guardian': {
    headline: 'The Guardian Gets Frustrated',
    insight: 'You\'ll need to talk more than most. The Guardian gets frustrated when the Drifter loses track, and the Drifter feels controlled. With effort, the Guardian\'s structure can help the Drifter a lot.',
    tips: ['Guardian: don\'t take over all the money, bring the Drifter in', 'Drifter: commit to checking your finances at least once a week', 'Start small with one simple goal you can reach'],
  },
  'giver+giver': {
    headline: 'All Heart, Save Some for You',
    insight: 'You\'re both generous and always put each other first. That\'s lovely, but make sure you\'re also saving for your future together.',
    tips: ['Set up a future fund that gift money can\'t touch', 'Practice saying "we can\'t afford that right now"', 'Love doesn\'t always have to cost money'],
  },
  'architect+giver': {
    headline: 'Heart + Head = Balance',
    insight: 'The Architect gives the Giver structure, and the Giver reminds the Architect that money is also for enjoying. This pairing can be really strong.',
    tips: ['Architect: set a generosity budget just for the Giver', 'Giver: trust the Architect with long-term planning', 'Celebrate when giving fits the plan'],
  },
  'drifter+giver': {
    headline: 'The Giver Covers for the Drifter',
    insight: 'Watch the balance here. The Giver keeps giving while the Drifter doesn\'t quite notice, and over time that can build resentment.',
    tips: ['Drifter: make a concrete promise to keep track of money', 'Giver: love doesn\'t always have to cost money', 'Hold a 15-minute money check-in every week'],
  },
  'architect+architect': {
    headline: 'Too Analytical? That\'s Fine',
    insight: 'Your finances are almost certainly well organized and goal driven. The risk: optimizing so much that the relationship starts to feel like project management.',
    tips: ['Leave room for things you didn\'t plan', 'Don\'t talk about money every time you meet', 'Celebrate the progress along the way'],
  },
  'architect+drifter': {
    headline: 'The Architect Needs Patience',
    insight: 'Like the Guardian and Drifter pair, you\'ll need to talk more than most. The Architect has to be patient and never condescending, and the Drifter has to be willing to learn and get involved.',
    tips: ['Build a simple system for the Drifter', 'Celebrate the Drifter\'s small wins', 'Don\'t bury them in spreadsheets'],
  },
  'drifter+drifter': {
    headline: 'Time to Drop an Anchor',
    insight: 'This pairing needs outside structure the most. Neither of you naturally keeps track of money, so long-term goals will be very hard without a clear system.',
    tips: ['Start a savings goal in this app today', 'Set an automatic transfer to savings at the start of the month', 'Consider talking to a financial counselor'],
  },
}

export function getCompatibility(typeA: SpendingType, typeB: SpendingType): CompatibilityInfo {
  return COMPAT[key(typeA, typeB)] ?? {
    headline: 'One of a Kind',
    insight: 'Every pairing has its own strengths and challenges.',
    tips: ['Talk openly about money', 'Set money goals together', 'Review your finances together once a month'],
  }
}
