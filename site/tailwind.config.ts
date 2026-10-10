import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      // Pip's palette: navy like his face screen, teal like his body, mint like his eyes
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
          300: "#7CF2D6",
          400: "#4FD6B6",
          500: "#2BB59A",
          600: "#1F9A82",
          700: "#1A7D6A",
        },
        coral: "#FF7A6B",
      },
    },
  },
  plugins: [],
}
export default config
