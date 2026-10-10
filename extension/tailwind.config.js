/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.tsx",
    "./src/**/*.tsx"
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme: Pip's navy (his face screen); same palette as the site and dashboard
        dark: {
          bg: '#0B1220',
          surface: '#111B2E',
          elevated: '#19263F',
          border: '#24344F',
          text: '#A9B6CF',        // secondary text (timestamps, labels)
          body: '#EEF3FA',        // message body text
          placeholder: '#8391AD',
          bubble: '#070C16',      // user message bubble
        },
        // Light theme: warm neutral scale replaces Tailwind's cool slate
        slate: {
          50: '#faf9f5',
          100: '#f5f4ee',
          200: '#e8e6dc',
          300: '#d6d3c7',
          400: '#b0aea5',
          500: '#87867f',
          600: '#6b6a64',
          700: '#4d4c48',
          800: '#3d3d3a',
          900: '#141413',
          950: '#0b0b0a',
        },
        // Accent is Pip's teal. Overrides "blue" so every existing blue-* class follows the brand.
        blue: {
          50: '#ECFBF7',
          100: '#CFF5EA',
          200: '#A1EAD7',
          300: '#6FDCC1',
          400: '#3FC8A8',
          500: '#2BB59A',
          600: '#1A8A74',
          700: '#146E5E',
          800: '#115547',
          900: '#0E4038',
          950: '#082621',
        }
      }
    }
  },
  plugins: []
}
