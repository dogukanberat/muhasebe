/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'neon-cyan': '#3B82F6',      // Kurumsal mavi
        'neon-purple': '#1E40AF',    // Koyu mavi
        'neon-pink': '#059669',      // Kurumsal yeşil
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}
