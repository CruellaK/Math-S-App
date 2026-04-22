/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#f5b83d', light: '#ffcd60', dark: '#d19a2e', dim: '#fef3cd' },
        surface: { DEFAULT: '#ffffff', dark: '#181611' },
        bg: { DEFAULT: '#f8f7f5', dark: '#0f0e0b' },
        card: { DEFAULT: '#ffffff', dark: '#1e1b14', hover: '#fdf8ef' },
        txt: { main: '#1f2937', sub: '#6b7280', muted: '#9ca3af' },
        accent: { green: '#22c55e', red: '#ef4444', blue: '#3b82f6', purple: '#8b5cf6' },
      },
      fontFamily: {
        display: ['"Space Grotesk"', '"Inter"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '1rem',
        lg: '1.25rem',
        xl: '1.5rem',
        '2xl': '2rem',
        '3xl': '2.5rem',
      },
      boxShadow: {
        bouncy: '0 4px 0 0 rgba(0,0,0,0.10)',
        'bouncy-lg': '0 6px 0 0 rgba(0,0,0,0.10)',
        card: '0 2px 12px rgba(100,80,40,0.06)',
        'card-hover': '0 4px 20px rgba(100,80,40,0.12)',
        gold: '0 4px 0 #d19a2e',
        'gold-lg': '0 6px 0 #d19a2e, 0 12px 24px rgba(245,184,61,0.25)',
      },
    },
  },
  plugins: [],
}
