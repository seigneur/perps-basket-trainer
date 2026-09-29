import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // we use public/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'https://perps-basket-trainer.contact-dias.workers.dev',
    },
  },
});
