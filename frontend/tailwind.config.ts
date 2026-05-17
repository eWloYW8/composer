import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(214 18% 84% / <alpha-value>)",
        input: "hsl(214 18% 84% / <alpha-value>)",
        ring: "hsl(195 85% 33% / <alpha-value>)",
        background: "hsl(45 20% 98% / <alpha-value>)",
        foreground: "hsl(220 18% 14% / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(195 85% 28% / <alpha-value>)",
          foreground: "hsl(0 0% 100% / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(155 22% 90% / <alpha-value>)",
          foreground: "hsl(160 35% 17% / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(215 18% 94% / <alpha-value>)",
          foreground: "hsl(218 12% 42% / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(29 88% 94% / <alpha-value>)",
          foreground: "hsl(22 70% 24% / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(0 70% 45% / <alpha-value>)",
          foreground: "hsl(0 0% 100% / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "8px",
        md: "6px",
        sm: "4px",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
