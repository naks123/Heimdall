/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        slate: { 850: "#172033", 950: "#0b1020" },
      },
    },
  },
  plugins: [],
};
