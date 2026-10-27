import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the site from /HouseholdApp/ — the deploy workflow sets
// BASE_PATH for that; local dev and Bolt keep using the root '/'
const base = process.env.BASE_PATH ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
      },
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'Huishouden',
        short_name: 'Huishouden',
        description: 'Taken, boodschappen en een kat voor ons tweeën',
        lang: 'nl',
        // Must match base, otherwise the installed app opens a 404 on Pages
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f6f2ec',
        theme_color: '#b94e5c',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})