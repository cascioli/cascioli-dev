// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: {
        '/api/osint': 'http://localhost:8787',
        '/api/contact': 'http://localhost:8788',
      }
    }
  }
});