import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:  ['react', 'react-dom', 'react-router-dom'],
          query:   ['@tanstack/react-query'],
          charts:  ['recharts'],
          ui:      ['@radix-ui/react-dialog', '@radix-ui/react-tooltip', 'cmdk', 'sonner'],
        },
      },
    },
  },
})
