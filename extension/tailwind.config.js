/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.tsx",
    "./src/**/*.tsx"
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme: warm neutrals (Claude.ai-style)
        dark: {
          bg: '#1f1e1d',
          surface: '#262624',
          elevated: '#30302e',
          border: '#3e3e38',
          text: '#c2c0b6',        // secondary text (timestamps, labels)
          body: '#f5f4ef',        // message body text
          placeholder: '#9c9a92',
          bubble: '#141413',      // user message bubble
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
        blue: {
          600: 'rgb(0, 145, 255)',
          700: 'rgb(0, 130, 230)',
        }
      }
    }
  },
  plugins: []
}
