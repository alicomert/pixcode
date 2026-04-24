/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    // Font scale tuned for a ChatGPT/Claude feel — base is 15px, small labels
    // stay readable at 13px, display sizes grow proportionally.
    fontSize: {
      'xs': ['0.8125rem', { lineHeight: '1.15rem' }],       // 13px
      'sm': ['0.875rem', { lineHeight: '1.35rem' }],        // 14px
      'base': ['0.9375rem', { lineHeight: '1.55rem' }],     // 15px
      'md': ['1rem', { lineHeight: '1.6rem' }],             // 16px
      'lg': ['1.0625rem', { lineHeight: '1.7rem' }],        // 17px
      'xl': ['1.1875rem', { lineHeight: '1.8rem' }],        // 19px
      '2xl': ['1.375rem', { lineHeight: '2rem' }],          // 22px
      '3xl': ['1.75rem', { lineHeight: '2.25rem' }],        // 28px
      '4xl': ['2.125rem', { lineHeight: '2.5rem' }],        // 34px
      '5xl': ['2.75rem', { lineHeight: '1' }],
      '6xl': ['3.5rem', { lineHeight: '1' }],
      '7xl': ['4.5rem', { lineHeight: '1' }],
      '8xl': ['6rem', { lineHeight: '1' }],
      '9xl': ['8rem', { lineHeight: '1' }],
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      // Softer radius scale — every step is one tier more rounded so the whole
      // app inherits ChatGPT-style curves without touching every component.
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)",
        '2xl': "calc(var(--radius) + 8px)",
        '3xl': "calc(var(--radius) + 16px)",
      },
      spacing: {
        'safe-area-inset-bottom': 'env(safe-area-inset-bottom)',
        'mobile-nav': 'var(--mobile-nav-total)',
      },
      keyframes: {
        // Used by <Shimmer> primitive for the loading text effect.
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        // Dialog primitive entrance animations (portal-based modal).
        'dialog-overlay-show': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'dialog-content-show': {
          from: { opacity: '0', transform: 'translate(-50%, -48%) scale(0.96)' },
          to: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
        },
        // "..." typing indicator used by ClaudeStatus — pure CSS replaces
        // the old 500ms React interval that caused re-renders.
        'chat-dots': {
          '0%, 20%': { width: '0ch' },
          '40%': { width: '1ch' },
          '60%': { width: '2ch' },
          '80%, 100%': { width: '3ch' },
        },
      },
      animation: {
        shimmer: 'shimmer 2s linear infinite',
        'dialog-overlay-show': 'dialog-overlay-show 150ms ease-out',
        'dialog-content-show': 'dialog-content-show 150ms ease-out',
        'chat-dots': 'chat-dots 1.4s steps(1, end) infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
