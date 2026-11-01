import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        cairo: ["var(--font-cairo)", "Cairo", "Tajawal", "sans-serif"],
        tajawal: ["var(--font-tajawal)", "Tajawal", "Cairo", "sans-serif"],
      },
      colors: {
        // Kesra brand palette — see public/branding/kesra-design-tokens.css
        base: {
          950: "#0a0a0d", // --black
          900: "#0a0a0d",
          850: "#151318", // --black-2
          800: "#151318",
          700: "#1c1224",
        },
        accent: {
          DEFAULT: "#7b2ff7", // --purple
          soft: "#b98cf0", // --purple-light
          deep: "#3b1560", // --purple-deep
          glow: "#b98cf0",
        },
        status: {
          hot: "#f5a3a3",
          gold: "#f5e29a",
          new: "#60a5fa",
          won: "#a9f5c1",
          lost: "#a89bb8",
        },
      },
      backgroundImage: {
        "glass-gradient":
          "linear-gradient(135deg, rgba(123,47,247,0.16) 0%, rgba(185,140,240,0.06) 100%)",
        "kesra-page": "linear-gradient(180deg, #0a0a0d 0%, #150f1f 40%, #0a0a0d 100%)",
        "kesra-hero":
          "radial-gradient(circle at 50% -10%, rgba(123,47,247,0.45), transparent 60%), linear-gradient(135deg, #0a0a0d 0%, #3b1560 100%)",
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(0,0,0,0.45)",
        "glass-inset": "inset 0 1px 0 0 rgba(255,255,255,0.06)",
      },
      backdropBlur: {
        glass: "20px",
      },
      borderRadius: {
        glass: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
