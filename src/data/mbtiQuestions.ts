export type MbtiDichotomy = 'EI' | 'SN' | 'TF' | 'JP'

export interface MbtiQuestion {
  id: number
  dichotomy: MbtiDichotomy
  optionA: { text: string; pole: string }
  optionB: { text: string; pole: string }
}

// 40 questions, 10 per dichotomy, scenario-based, poles mixed between A and B
export const mbtiQuestions: MbtiQuestion[] = [

  // ─── E / I ─── (10 questions)
  { id: 1, dichotomy: 'EI',
    optionA: { text: "After a long day, I'd rather hang out with friends for a bit before heading home", pole: 'E' },
    optionB: { text: "After a long day, I'd rather go straight home and have some time to myself", pole: 'I' } },

  { id: 2, dichotomy: 'EI',
    optionA: { text: "I'm more comfortable at a small gathering with close friends than at a big event full of people", pole: 'I' },
    optionB: { text: 'I actually get more energy from big, busy events where I meet lots of new people', pole: 'E' } },

  { id: 3, dichotomy: 'EI',
    optionA: { text: "When there's a conflict, I usually want to talk it through right away", pole: 'E' },
    optionB: { text: "When there's a conflict, I need some time alone to calm down before I talk", pole: 'I' } },

  { id: 4, dichotomy: 'EI',
    optionA: { text: 'In meetings or discussions, I mostly stay quiet and listen', pole: 'I' },
    optionB: { text: 'In meetings or discussions, I tend to speak up and share my opinion', pole: 'E' } },

  { id: 5, dichotomy: 'EI',
    optionA: { text: 'I can spend a whole day without seeing anyone and still feel fine', pole: 'I' },
    optionB: { text: 'If I go a whole day without seeing or talking to anyone, something feels missing', pole: 'E' } },

  { id: 6, dichotomy: 'EI',
    optionA: { text: "I get close to people I've just met pretty quickly", pole: 'E' },
    optionB: { text: 'It takes me quite a while to feel really comfortable with someone new', pole: 'I' } },

  { id: 7, dichotomy: 'EI',
    optionA: { text: 'I usually think things over quietly before I say anything', pole: 'I' },
    optionB: { text: "I often only figure out what I think once I've said it out loud", pole: 'E' } },

  { id: 8, dichotomy: 'EI',
    optionA: { text: 'Working in a big, lively team makes me more productive', pole: 'E' },
    optionB: { text: 'I do my best work alone or in a small, quiet group', pole: 'I' } },

  { id: 9, dichotomy: 'EI',
    optionA: { text: 'I know a lot of people, but only a few of them are really close friends', pole: 'I' },
    optionB: { text: 'I have lots of friends and find it fairly easy to get close to anyone', pole: 'E' } },

  { id: 10, dichotomy: 'EI',
    optionA: { text: 'In crowded public places, I get drained fast and want to leave', pole: 'I' },
    optionB: { text: 'In crowded public places, I actually feel more alive and full of energy', pole: 'E' } },


  // ─── S / N ─── (10 questions)
  { id: 11, dichotomy: 'SN',
    optionA: { text: 'When I read new instructions, I follow the steps in order', pole: 'S' },
    optionB: { text: 'When I read new instructions, I look at the big picture first, then the details', pole: 'N' } },

  { id: 12, dichotomy: 'SN',
    optionA: { text: "I'm more interested in discussing abstract ideas and what might happen in the future", pole: 'N' },
    optionB: { text: "I'm more interested in talking about concrete things that matter right now", pole: 'S' } },

  { id: 13, dichotomy: 'SN',
    optionA: { text: 'I often notice small details that other people miss', pole: 'S' },
    optionB: { text: 'I find it easy to spot patterns and links between things that seem unrelated', pole: 'N' } },

  { id: 14, dichotomy: 'SN',
    optionA: { text: "I often think about all the things that could happen but haven't yet", pole: 'N' },
    optionB: { text: 'I focus more on what has already happened and what I can actually see', pole: 'S' } },

  { id: 15, dichotomy: 'SN',
    optionA: { text: 'The best way for me to learn something new is to jump in and do it', pole: 'S' },
    optionB: { text: 'The best way for me to learn something new is to understand the idea and the theory first', pole: 'N' } },

  { id: 16, dichotomy: 'SN',
    optionA: { text: 'I live in the present more than I think about the future', pole: 'S' },
    optionB: { text: "My mind often jumps ahead to the future, picturing things that haven't happened yet", pole: 'N' } },

  { id: 17, dichotomy: 'SN',
    optionA: { text: 'I love using my imagination and exploring unusual ideas', pole: 'N' },
    optionB: { text: "I'd rather use a solution that's proven to work than try something new", pole: 'S' } },

  { id: 18, dichotomy: 'SN',
    optionA: { text: 'I tend to remember the specific facts and numbers from what I learn', pole: 'S' },
    optionB: { text: 'I tend to remember the overall impression and meaning of what I learn, not the details', pole: 'N' } },

  { id: 19, dichotomy: 'SN',
    optionA: { text: 'I trust what can be proven directly', pole: 'S' },
    optionB: { text: "I often follow my gut, even when I can't explain why", pole: 'N' } },

  { id: 20, dichotomy: 'SN',
    optionA: { text: 'I like talking about the meaning behind things, beyond the bare facts', pole: 'N' },
    optionB: { text: 'I care more about facts and what is real than guessing at what it all means', pole: 'S' } },


  // ─── T / F ─── (10 questions)
  { id: 21, dichotomy: 'TF',
    optionA: { text: 'When a friend tells me about a problem, I usually jump straight to solutions', pole: 'T' },
    optionB: { text: 'When a friend tells me about a problem, I focus first on listening and acknowledging how they feel', pole: 'F' } },

  { id: 22, dichotomy: 'TF',
    optionA: { text: 'I can agree or disagree with someone without it affecting our relationship', pole: 'T' },
    optionB: { text: 'A sharp disagreement often leaves me wondering where things stand between us', pole: 'F' } },

  { id: 23, dichotomy: 'TF',
    optionA: { text: "When I criticize someone, I don't feel I need to soften my words much, as long as the point gets across", pole: 'T' },
    optionB: { text: "I'm very careful about how I give criticism so I don't hurt anyone's feelings", pole: 'F' } },

  { id: 24, dichotomy: 'TF',
    optionA: { text: 'The best decision is the most logical one, even if not everyone is happy with it', pole: 'T' },
    optionB: { text: 'A good decision also has to consider how it will make everyone feel', pole: 'F' } },

  { id: 25, dichotomy: 'TF',
    optionA: { text: "I'm driven more by my values and what feels right to me", pole: 'F' },
    optionB: { text: "I'm driven more by efficiency and what makes logical sense", pole: 'T' } },

  { id: 26, dichotomy: 'TF',
    optionA: { text: 'When someone is angry with me, I first check whether their anger makes logical sense', pole: 'T' },
    optionB: { text: 'When someone is angry with me, I first feel bad and want to make things right between us', pole: 'F' } },

  { id: 27, dichotomy: 'TF',
    optionA: { text: 'I empathize easily and often feel what the people around me are feeling', pole: 'F' },
    optionB: { text: "I'm pretty good at keeping my own feelings separate from what other people are going through", pole: 'T' } },

  { id: 28, dichotomy: 'TF',
    optionA: { text: 'Keeping the peace in a relationship matters more to me than winning an argument', pole: 'F' },
    optionB: { text: 'Truth and sound logic matter more to me, even if it means an argument', pole: 'T' } },

  { id: 29, dichotomy: 'TF',
    optionA: { text: 'When something painful needs to be said, I can say it quite directly', pole: 'T' },
    optionB: { text: 'Saying painful things is really difficult for me, so I always look for a gentler way', pole: 'F' } },

  { id: 30, dichotomy: 'TF',
    optionA: { text: 'Praise and appreciation from others mean a lot to me and keep me going', pole: 'F' },
    optionB: { text: "I'm more motivated by what I achieve and the standards I set for myself", pole: 'T' } },


  // ─── J / P ─── (10 questions)
  { id: 31, dichotomy: 'JP',
    optionA: { text: 'I feel calmer when, by Sunday, I already have a clear plan for the week ahead', pole: 'J' },
    optionB: { text: "I feel fresher and freer when I don't have any fixed plans", pole: 'P' } },

  { id: 32, dichotomy: 'JP',
    optionA: { text: 'I like to gather as much information as I can before making a decision', pole: 'P' },
    optionB: { text: "I'm more comfortable deciding early and sticking with it", pole: 'J' } },

  { id: 33, dichotomy: 'JP',
    optionA: { text: 'My desk or room tends to be neat and organized', pole: 'J' },
    optionB: { text: 'My workspace looks messy to others, but I know where everything is', pole: 'P' } },

  { id: 34, dichotomy: 'JP',
    optionA: { text: 'I feel more at ease when I have an itinerary before a trip', pole: 'J' },
    optionB: { text: 'My best trips are the ones decided at the last minute with hardly any plan', pole: 'P' } },

  { id: 35, dichotomy: 'JP',
    optionA: { text: 'I can juggle several different projects at once, switching between them', pole: 'P' },
    optionB: { text: "I'd rather finish one thing completely before starting the next", pole: 'J' } },

  { id: 36, dichotomy: 'JP',
    optionA: { text: 'Deadlines stress me out. I prefer steady progress without tight time pressure', pole: 'P' },
    optionB: { text: 'Without a clear deadline I lose focus. I need a target date to get things done', pole: 'J' } },

  { id: 37, dichotomy: 'JP',
    optionA: { text: 'I often put off decisions until I really have to choose', pole: 'P' },
    optionB: { text: 'Things that are undecided or left hanging make me uncomfortable', pole: 'J' } },

  { id: 38, dichotomy: 'JP',
    optionA: { text: 'Sudden changes to plans throw me off and take extra effort to adjust to', pole: 'J' },
    optionB: { text: "I adapt fairly easily and don't mind much when plans change suddenly", pole: 'P' } },

  { id: 39, dichotomy: 'JP',
    optionA: { text: 'I usually finish tasks well before the deadline', pole: 'J' },
    optionB: { text: "I'm actually most productive when the deadline is close. The pressure helps me focus", pole: 'P' } },

  { id: 40, dichotomy: 'JP',
    optionA: { text: 'I like keeping my options open, in case something better comes along', pole: 'P' },
    optionB: { text: "I prefer certainty. Knowing what's coming makes me feel more prepared", pole: 'J' } },
]

export interface MbtiScores {
  E: number; I: number
  S: number; N: number
  T: number; F: number
  J: number; P: number
}

export function calculateMbtiType(answers: Record<number, string>): { type: string; scores: MbtiScores } {
  const scores: MbtiScores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 }

  mbtiQuestions.forEach(q => {
    const answer = answers[q.id]
    if (answer === 'A') scores[q.optionA.pole as keyof MbtiScores]++
    else if (answer === 'B') scores[q.optionB.pole as keyof MbtiScores]++
  })

  const type = [
    scores.E >= scores.I ? 'E' : 'I',
    scores.S >= scores.N ? 'S' : 'N',
    scores.T >= scores.F ? 'T' : 'F',
    scores.J >= scores.P ? 'J' : 'P',
  ].join('')

  return { type, scores }
}
