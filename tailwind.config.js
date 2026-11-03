/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/data/**/*.{js,ts}',
  ],
  safelist: [
    // Samakan game dynamic gradient backgrounds
    'from-rose-900', 'to-pink-900',
    'from-sky-900', 'to-blue-900',
    'from-emerald-900', 'to-green-900',
    'from-amber-900', 'to-orange-900',
    'bg-gradient-to-br',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#FFF8F0',
        rose: {
          DEFAULT: '#F06B6B',
          dark: '#E05555',
          light: '#F59090',
          50: '#FFF1F1',
          100: '#FFE0E0',
        },
        gold: {
          DEFAULT: '#E8C078',
          light: '#F0D49E',
          dark: '#D4A85C',
        },
        sage: {
          DEFAULT: '#7EC4A0',
          light: '#A8D8BF',
          dark: '#5EAE85',
        },
        ink: {
          DEFAULT: '#2D2424',
          light: '#5C4E4E',
          muted: '#9B8F8F',
        },
        surface: '#FFFFFF',
        border: '#EDE6DE',
        danger: '#D4787A',
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '16px',
        xl: '12px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(45, 36, 36, 0.06), 0 1px 2px rgba(45, 36, 36, 0.04)',
        elevated: '0 4px 12px rgba(45, 36, 36, 0.08), 0 2px 4px rgba(45, 36, 36, 0.04)',
        glow: '0 0 24px rgba(240, 107, 107, 0.25)',
        'nav': '0 -1px 0 rgba(237, 230, 222, 1)',
      },
      animation: {
        // No `forwards`: a filled opacity/transform animation keeps a stacking
        // context forever, which trapped page overlays (z-50) under the bottom
        // nav. The end frames equal the natural styles, so nothing jumps.
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'shimmer': 'shimmer 1s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
