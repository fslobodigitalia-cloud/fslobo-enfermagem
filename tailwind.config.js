/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1.375rem", sm: "1.5rem", lg: "2rem" },
      screens: { "2xl": "1280px" },
    },
    extend: {
      colors: {
        ink: {
          DEFAULT: "#07040D",
          soft: "#0C0712",
        },
        plum: {
          DEFAULT: "#180A2A",
          deep: "#120520",
        },
        violet: {
          DEFAULT: "#8B5CF6",
          deep: "#6D28D9",
        },
        gold: {
          DEFAULT: "#D9AC5B",
          light: "#F3D79A",
          dim: "rgba(217, 172, 91, 0.25)",
        },
        cream: "#F7F0E5",
        dim: "#C8BCCF",
        border: "rgba(217, 172, 91, 0.25)",
        ring: "#D9AC5B",
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', "Georgia", "serif"],
        sans: ["Manrope", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: {
        xl: "1.25rem",
        "2xl": "1.5rem",
        "3xl": "1.75rem",
      },
      maxWidth: {
        shell: "1280px",
        prose: "62ch",
      },
      boxShadow: {
        gold: "0 0 0 1px rgba(217,172,91,0.25), 0 18px 60px -24px rgba(217,172,91,0.35)",
        halo: "0 0 90px -20px rgba(109,40,217,0.55), 0 0 60px -30px rgba(217,172,91,0.5)",
        card: "0 24px 70px -40px rgba(0,0,0,0.9)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "none" },
        },
        marquee: {
          from: { transform: "translate3d(0,0,0)" },
          to: { transform: "translate3d(-50%,0,0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-14px)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0) rotate(var(--tilt, 0deg))" },
          "50%": { transform: "translateY(-10px) rotate(var(--tilt, 0deg))" },
        },
        "pulse-halo": {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "0.8" },
        },
        "sheen": {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(220%)" },
        },
        twinkle: {
          "0%, 100%": { opacity: "0.15" },
          "50%": { opacity: "0.7" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both",
        marquee: "marquee 44s linear infinite",
        float: "float 7s ease-in-out infinite",
        "float-slow": "float-slow 9s ease-in-out infinite",
        "pulse-halo": "pulse-halo 6s ease-in-out infinite",
        sheen: "sheen 4.5s ease-in-out infinite",
        twinkle: "twinkle 5s ease-in-out infinite",
        "accordion-down": "accordion-down 0.28s cubic-bezier(0.22,1,0.36,1)",
        "accordion-up": "accordion-up 0.24s cubic-bezier(0.22,1,0.36,1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
