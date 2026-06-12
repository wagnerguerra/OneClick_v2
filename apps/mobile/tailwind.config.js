/** @type {import('tailwindcss').Config} */
// NativeWind v4 usa Tailwind v3. Tokens semânticos do Design System (CSS vars em
// global.css). `content` ancorado por __dirname (resolve contra o config, não o
// cwd) — senão o build de release purga as classes.
const path = require('path')
const tok = (name) => `rgb(var(--${name}) / <alpha-value>)`

module.exports = {
  content: [path.join(__dirname, 'src/**/*.{js,jsx,ts,tsx}')],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: tok('background'),
        foreground: tok('foreground'),
        card: tok('card'),
        'card-foreground': tok('card-foreground'),
        elevated: tok('elevated'),
        muted: tok('muted'),
        'muted-foreground': tok('muted-foreground'),
        border: tok('border'),
        input: tok('input'),
        ring: tok('ring'),
        primary: tok('primary'),
        'primary-foreground': tok('primary-foreground'),
        secondary: tok('secondary'),
        'secondary-foreground': tok('secondary-foreground'),
        accent: tok('accent'),
        'accent-foreground': tok('accent-foreground'),
        success: tok('success'),
        'success-foreground': tok('success-foreground'),
        warning: tok('warning'),
        'warning-foreground': tok('warning-foreground'),
        destructive: tok('destructive'),
        'destructive-foreground': tok('destructive-foreground'),
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px',
      },
    },
  },
  plugins: [],
}
