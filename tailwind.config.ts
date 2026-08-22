import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#101828", soft: "#475467", faint: "#98A2B3" },
        canvas: "#F6F7FB",
        line: "#E4E7EC",
        brand: {
          50: "#F3EEFF",
          100: "#E5DAFF",
          200: "#CDB6FF",
          300: "#AE8AFB",
          400: "#8B5CF6",
          500: "#5B2AD6",
          600: "#4B1FB5",
          700: "#3B1790",
          800: "#2A1069",
          900: "#1A1030",
        },
        teal: { 400: "#2EE6C8", 500: "#00C2A8", 600: "#009B87" },
        amber: { 400: "#FFC44D", 500: "#FFB020", 600: "#D98A00" },
        danger: { 500: "#E5484D", 600: "#C62A2F" },
      },
      fontFamily: {
        display: ["var(--font-display)", "Bricolage Grotesque", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: { xl: "14px", "2xl": "20px", "3xl": "28px" },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.04), 0 8px 24px -12px rgba(16,24,40,.12)",
        lift: "0 18px 50px -20px rgba(43,16,105,.45)",
        ring: "0 0 0 4px rgba(91,42,214,.12)",
      },
      keyframes: {
        scanline: { "0%": { transform: "translateY(-8%)" }, "100%": { transform: "translateY(760%)" } },
        pop: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "none" } },
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".25" } },
      },
      animation: {
        scanline: "scanline 2.6s cubic-bezier(.4,0,.2,1) infinite",
        pop: "pop .45s cubic-bezier(.2,.8,.2,1) both",
        marquee: "marquee 32s linear infinite",
        pulseDot: "pulseDot 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
