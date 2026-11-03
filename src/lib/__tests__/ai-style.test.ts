import { describe, expect, it } from 'vitest'
import { tidyAiText } from '@/lib/ai-style'

describe('tidyAiText (no-dash backstop on model output)', () => {
  it('turns an em dash into a comma', () => {
    expect(tidyAiText('Pick a warung you both love — then order for each other')).toBe(
      'Pick a warung you both love, then order for each other',
    )
  })

  it('handles an unspaced em dash and a spaced en dash', () => {
    expect(tidyAiText('Coffee first—then a walk')).toBe('Coffee first, then a walk')
    expect(tidyAiText('Go early – it gets crowded')).toBe('Go early, it gets crowded')
  })

  it('keeps an en dash inside a number range', () => {
    expect(tidyAiText('Budget Rp 50.000–100.000 for two')).toBe('Budget Rp 50.000–100.000 for two')
  })

  it('does not leave a comma before punctuation or at the ends', () => {
    expect(tidyAiText('What made you smile today —?')).toBe('What made you smile today?')
    expect(tidyAiText('— Start with a question —')).toBe('Start with a question')
  })

  it('leaves clean text unchanged', () => {
    const clean = 'What is one small thing your partner did this week that you noticed?'
    expect(tidyAiText(clean)).toBe(clean)
  })
})
