// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://simonecascioli.it',
  integrations: [
    sitemap({
      serialize(item) {
        if (item.url === 'https://simonecascioli.it/') return { ...item, changefreq: 'weekly',  priority: 1.0 };
        if (/\/notes\//.test(item.url))                return { ...item, changefreq: 'weekly',  priority: 0.8 };
        if (/\/work\//.test(item.url))                 return { ...item, changefreq: 'monthly', priority: 0.7 };
        return { ...item, changefreq: 'monthly', priority: 0.5 };
      },
    }),
  ],
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