import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
    // host: true, // descomente se quiser acessar via LAN (outro PC/celular)
    proxy: {
      '/api': {
        target: 'http://10.33.103.9:5000',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/api/, '')
      }
    }
  }
})