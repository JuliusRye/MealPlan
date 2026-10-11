import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Generates the PWA icons in public/ from the SVG: `npm run generate-pwa-assets`.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#2f7d4f' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#2f7d4f' } },
  },
  images: ['public/favicon.svg'],
})
