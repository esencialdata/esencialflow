import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const resolveDevApiProxyTarget = () => process.env.VITE_DEV_API_PROXY ?? 'http://localhost:3001'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: mode === 'development'
    ? {
        proxy: {
          '/api': {
            target: resolveDevApiProxyTarget(),
            changeOrigin: true,
          },
        },
      }
    : undefined,
}))
