export interface DateIdea {
  title: string
  category: 'gratis' | 'murah' | 'spesial'
  description: string
  estimatedBudget: string
}

// `category` is a code key (gratis = free, murah = cheap, spesial = special),
// never shown as text, so it stays as is.
export const DATE_IDEAS: DateIdea[] = [
  // Free
  {
    title: 'Picnic in the park',
    description: 'Pack some food and a mat, and spend the afternoon outside',
    estimatedBudget: 'Rp 0',
    category: 'gratis',
  },
  {
    title: 'Cook together at home',
    description: 'Pick a recipe neither of you has tried and make it together',
    estimatedBudget: 'Rp 0',
    category: 'gratis',
  },
  {
    title: 'Movie marathon',
    description: "Line up a series or films you haven't seen yet",
    estimatedBudget: 'Rp 0',
    category: 'gratis',
  },
  {
    title: 'Sunset walk',
    description: 'Stroll around the neighborhood and talk',
    estimatedBudget: 'Rp 0',
    category: 'gratis',
  },
  {
    title: 'Game night',
    description: 'UNO, a deck of cards or a mobile game together',
    estimatedBudget: 'Rp 0',
    category: 'gratis',
  },
  {
    title: 'Stargazing',
    description: 'Find a dark spot and look up at the stars',
    estimatedBudget: 'Rp 0',
    category: 'gratis',
  },
  {
    title: 'Photo date',
    description: 'A mini photoshoot on your phones at a fun spot',
    estimatedBudget: 'Rp 0',
    category: 'gratis',
  },
  {
    title: 'Learn something new',
    description: 'Follow a YouTube tutorial together, like origami or drawing',
    estimatedBudget: 'Rp 0',
    category: 'gratis',
  },

  // Cheap
  {
    title: 'Try a new cafe',
    description: "Find a coffee place you haven't been to yet",
    estimatedBudget: 'Rp 50.000–100.000',
    category: 'murah',
  },
  {
    title: 'Street food hunt',
    description: 'Wander around and snack your way through the kaki lima stalls',
    estimatedBudget: 'Rp 30.000–80.000',
    category: 'murah',
  },
  {
    title: 'Cinema date',
    description: 'A new release and a bucket of popcorn for two',
    estimatedBudget: 'Rp 100.000–150.000',
    category: 'murah',
  },
  {
    title: 'Karaoke',
    description: 'Book a room for 1–2 hours and sing your hearts out',
    estimatedBudget: 'Rp 80.000–150.000',
    category: 'murah',
  },
  {
    title: 'Angkot or KRL adventure',
    description: 'Get off at a random stop and explore',
    estimatedBudget: 'Rp 20.000–50.000',
    category: 'murah',
  },
  {
    title: 'Bookstore or library date',
    description: 'Read side by side and pick a book for each other',
    estimatedBudget: 'Rp 0–100.000',
    category: 'murah',
  },
  {
    title: 'Ice cream date',
    description: 'Work through the flavors at your favorite ice cream place',
    estimatedBudget: 'Rp 30.000–60.000',
    category: 'murah',
  },
  {
    title: 'Night market',
    description: 'Play the games, share some snacks and ride the Ferris wheel',
    estimatedBudget: 'Rp 50.000–100.000',
    category: 'murah',
  },

  // Special
  {
    title: 'Hotel staycation',
    description: 'Stay the night somewhere nice and have breakfast together',
    estimatedBudget: 'Rp 300.000–800.000',
    category: 'spesial',
  },
  {
    title: 'Fine dining',
    description: 'A romantic dinner at a good restaurant',
    estimatedBudget: 'Rp 300.000–600.000',
    category: 'spesial',
  },
  {
    title: 'Day trip out of town',
    description: 'Take the train or drive to a nearby city',
    estimatedBudget: 'Rp 200.000–500.000',
    category: 'spesial',
  },
  {
    title: 'Take a class together',
    description: 'A pottery, cooking or painting class',
    estimatedBudget: 'Rp 200.000–400.000',
    category: 'spesial',
  },
  {
    title: 'Couples spa',
    description: 'Unwind together with a couples massage',
    estimatedBudget: 'Rp 300.000–600.000',
    category: 'spesial',
  },
  {
    title: 'Adventure date',
    description: 'Go hiking, snorkeling or try a flying fox',
    estimatedBudget: 'Rp 100.000–400.000',
    category: 'spesial',
  },
]

export function getRandomDateIdea(): DateIdea {
  return DATE_IDEAS[Math.floor(Math.random() * DATE_IDEAS.length)]
}

export function getDateIdeasByCategory(category: DateIdea['category']): DateIdea[] {
  return DATE_IDEAS.filter(d => d.category === category)
}
