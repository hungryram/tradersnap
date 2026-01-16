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
          bg: '#171b1f',
          surface: '#0d1117',
          elevated: 'lab(5.25641% -.716366 -2.91725)',
          border: '#2d3439',
          text: 'lab(59.4% 0 0)',
          placeholder: 'lab(94.2% 0 0)',
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
