import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/tcmb': {
        target: 'https://www.tcmb.gov.tr',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/tcmb/, ''),
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
      },
    },
  },
})
