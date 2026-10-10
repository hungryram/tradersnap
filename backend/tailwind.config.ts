import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Pip's palette (same as the site): navy like his face screen, teal like his body, mint like his eyes
      colors: {
        ink: {
          bg: "#0B1220",
          surface: "#111B2E",
          elevated: "#19263F",
          border: "#24344F",
          muted: "#8391AD",
          text: "#B4C0D6",
          body: "#EEF3FA",
        },
        brand: {
          200: "#B3F7E6",
          300: "#7CF2D6",
          400: "#4FD6B6",
          500: "#2BB59A",
          600: "#1F9A82",
          700: "#1A7D6A",
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
export default config
