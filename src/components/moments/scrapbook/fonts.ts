// Display fonts used only inside the scrapbook pages. The woff2 files (Google
// Fonts latin subset, OFL) live in ./fonts so the build never fetches them:
// next/font/google crashed on Vercel's builders with "Cannot read properties
// of null (reading '1')" for these two families.
import localFont from 'next/font/local'

export const handFont = localFont({
  src: [{ path: './fonts/caveat-latin-normal.woff2', weight: '500 700', style: 'normal' }],
  variable: '--sb-font-hand',
  display: 'swap',
  fallback: ['cursive'],
})

export const serifFont = localFont({
  src: [
    { path: './fonts/playfair-latin-normal.woff2', weight: '600 800', style: 'normal' },
    { path: './fonts/playfair-latin-italic.woff2', weight: '600 800', style: 'italic' },
  ],
  variable: '--sb-font-serif',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
})
