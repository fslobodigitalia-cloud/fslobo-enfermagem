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
      fontFamily: {
        sans: ["Manrope", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Marquee do hero mobile (MaterialsPage) — conteúdo duplicado no
        // JSX, translateX(-50%) percorre exatamente uma cópia da lista;
        // como as duas metades são idênticas, o "reinício" do loop em 0%
        // é visualmente idêntico ao quadro anterior (-50%), sem tranco.
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.28s cubic-bezier(0.22,1,0.36,1)",
        "accordion-up": "accordion-up 0.24s cubic-bezier(0.22,1,0.36,1)",
        marquee: "marquee 26s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
