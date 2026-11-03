export interface MbtiTypeInfo {
  type: string
  title: string
  emoji: string
  description: string
  strengths: string[]
  loveStyle: string
}

export const MBTI_DESCRIPTIONS: Record<string, MbtiTypeInfo> = {
  INTJ: {
    type: 'INTJ', title: 'The Architect', emoji: '\u{1F9E0}',
    description: 'A strategic thinker who sees far ahead. Always has a plan for the years ahead and sets high standards.',
    strengths: ['Strategic', 'Independent', 'Determined', 'Analytical'],
    loveStyle: 'Shows love through real action and by planning a future together.',
  },
  INTP: {
    type: 'INTP', title: 'The Thinker', emoji: '\u{1F4A1}',
    description: 'Loves logic and theory. Always curious, and always taking things apart to see how they work.',
    strengths: ['Logical', 'Creative', 'Open to ideas', 'Objective'],
    loveStyle: 'Shows love by listening closely and getting to know how their partner thinks.',
  },
  ENTJ: {
    type: 'ENTJ', title: 'The Commander', emoji: '\u{1F451}',
    description: 'A natural leader, decisive and efficient. Enjoys motivating the people around them.',
    strengths: ['Confident', 'Decisive', 'Ambitious', 'Inspiring'],
    loveStyle: "Shows love by backing their partner's goals and helping them get there.",
  },
  ENTP: {
    type: 'ENTP', title: 'The Debater', emoji: '\u{26A1}',
    description: 'An inventor at heart who loves a challenge. Always full of new ideas and never afraid to disagree.',
    strengths: ['Inventive', 'Adaptable', 'Energetic', 'Quick thinker'],
    loveStyle: 'Shows love through long, deep conversations and adventures together.',
  },
  INFJ: {
    type: 'INFJ', title: 'The Counselor', emoji: '\u{1F52E}',
    description: 'An idealist with a big heart. Understands people deeply and dreams of a better world.',
    strengths: ['Empathetic', 'Visionary', 'Attentive', 'Purposeful'],
    loveStyle: 'Shows love through emotional depth and a spiritual connection.',
  },
  INFP: {
    type: 'INFP', title: 'The Mediator', emoji: '\u{1F338}',
    description: 'An idealistic dreamer with big feelings. Looks for the meaning in everything.',
    strengths: ['Idealistic', 'Creative', 'Loyal', 'Loving'],
    loveStyle: 'Shows love through small gestures that mean a lot, and words straight from the heart.',
  },
  ENFJ: {
    type: 'ENFJ', title: 'The Protagonist', emoji: '\u{1F31F}',
    description: 'A charismatic leader who truly cares. Inspires people to be their best selves.',
    strengths: ['Charismatic', 'Inspiring', 'Selfless', 'Diplomatic'],
    loveStyle: "Shows love with full support, putting their partner's happiness first.",
  },
  ENFP: {
    type: 'ENFP', title: 'The Campaigner', emoji: '\u{1F308}',
    description: 'An enthusiastic free spirit with energy to spare. Sees potential everywhere.',
    strengths: ['Enthusiastic', 'Creative', 'Sociable', 'Optimistic'],
    loveStyle: 'Shows love through little surprises, spontaneous plans and words full of excitement.',
  },
  ISTJ: {
    type: 'ISTJ', title: 'The Inspector', emoji: '\u{1F4CB}',
    description: 'Dependable and responsible. Takes commitments and traditions seriously.',
    strengths: ['Responsible', 'Thorough', 'Consistent', 'Loyal'],
    loveStyle: 'Shows love by being loyal and steady, and by pitching in with practical help.',
  },
  ISFJ: {
    type: 'ISFJ', title: 'The Protector', emoji: '\u{1F6E1}',
    description: 'A warm, thoughtful protector. Always there for the people they love.',
    strengths: ['Thoughtful', 'Patient', 'Loyal', 'Eye for detail'],
    loveStyle: 'Shows love through everyday care and by keeping their partner comfortable.',
  },
  ESTJ: {
    type: 'ESTJ', title: 'The Executive', emoji: '\u{1F4BC}',
    description: 'A firm, structured organizer. Keeps things in order and standards high.',
    strengths: ['Organized', 'Decisive', 'Loyal', 'Hard worker'],
    loveStyle: 'Shows love by bringing stability and structure to the relationship.',
  },
  ESFJ: {
    type: 'ESFJ', title: 'The Consul', emoji: '\u{1F91D}',
    description: 'Warm and well liked. Keeps the peace and looks out for everyone around them.',
    strengths: ['Warm', 'Caring', 'Sociable', 'Cooperative'],
    loveStyle: 'Shows love with full attention, small gifts and plenty of quality time.',
  },
  ISTP: {
    type: 'ISTP', title: 'The Virtuoso', emoji: '\u{1F527}',
    description: 'Practical and loves to explore. A sharp problem solver.',
    strengths: ['Practical', 'Adaptable', 'Logical', 'Spontaneous'],
    loveStyle: 'Shows love through practical help and trying new things together.',
  },
  ISFP: {
    type: 'ISFP', title: 'The Adventurer', emoji: '\u{1F3A8}',
    description: 'A sensitive, artistic soul who feels things deeply. Lives in the moment.',
    strengths: ['Artistic', 'Sensitive', 'Warm', 'Spontaneous'],
    loveStyle: 'Shows love through romantic gestures and beautiful moments spent together.',
  },
  ESTP: {
    type: 'ESTP', title: 'The Entrepreneur', emoji: '\u{1F525}',
    description: 'Energetic and bold. Loves a challenge and a life full of action.',
    strengths: ['Energetic', 'Bold', 'Adaptable', 'Pragmatic'],
    loveStyle: 'Shows love through fun adventures and moments full of joy.',
  },
  ESFP: {
    type: 'ESFP', title: 'The Entertainer', emoji: '\u{1F389}',
    description: 'The cheerful, spontaneous life of the party. Makes every moment fun.',
    strengths: ['Cheerful', 'Spontaneous', 'Practical', 'Lively'],
    loveStyle: 'Shows love through time together full of laughter and sweet surprises.',
  },
}

export function getMbtiDescription(type: string): MbtiTypeInfo | null {
  return MBTI_DESCRIPTIONS[type.toUpperCase()] ?? null
}
