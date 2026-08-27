import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Relativo por padrão, o que funciona ao abrir o `dist/` direto. Em produção
  // o GitHub Pages serve o app em /<repositório>/, e o service worker precisa
  // do caminho absoluto para registrar o escopo certo.
  base: process.env.VITE_BASE ?? './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Gato Virtual',
        short_name: 'Gato',
        description: 'Um gato de verdade que vive no seu bolso.',
        theme_color: '#141210',
        background_color: '#141210',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,glb}'],
        // As páginas de calibração não fazem parte do app.
        globIgnores: ['**/glbview.html', '**/analyze.html', '**/poseview.html' ],
        navigateFallbackDenylist: [/glbview|analyze|poseview/],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  build: {
    target: 'es2020',
    rollupOptions: {
      input: { main: 'index.html', glbview: 'glbview.html', analyze: 'analyze.html', poseview: 'poseview.html' },
    },
  },
})
