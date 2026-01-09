/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.tsx",
    "./src/**/*.tsx"
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#121212',
          surface: '#1e1e1e',
          elevated: '#2d2d2d',
          border: '#3d3d3d',
        }
      }
    }
  },
  plugins: []
}
