// Display fonts used only inside the scrapbook pages (self-hosted by next/font).
import { Caveat, Playfair_Display } from 'next/font/google'

export const handFont = Caveat({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--sb-font-hand',
  display: 'swap',
})

export const serifFont = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--sb-font-serif',
  display: 'swap',
})
