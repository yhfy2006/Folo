import type { Config } from "tailwindcss"

export default {
  content: ["./renderer/**/*.{ts,tsx,html}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        accent: "#FF5C00",
        sidebar: {
          DEFAULT: "hsl(0 0% 97%)",
          dark: "hsl(0 0% 10%)",
        },
      },
    },
  },
  plugins: [],
} satisfies Config
