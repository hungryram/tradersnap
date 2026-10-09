import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Same warm dark palette as the extension
      colors: {
        ink: {
          bg: "#1f1e1d",
          surface: "#262624",
          elevated: "#30302e",
          border: "#3e3e38",
          muted: "#9c9a92",
          text: "#c2c0b6",
          body: "#f5f4ef",
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
export default config
