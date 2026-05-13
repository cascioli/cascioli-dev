# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev       # dev server at localhost:4321
npm run build     # production build → ./dist/
npm run preview   # preview built site locally
npm run astro ... # astro CLI (e.g. astro add, astro check)
```

No test runner configured yet.

## Stack

- **Astro 6** — file-based routing from `src/pages/`. `.astro` and `.md` files become routes.
- **Tailwind CSS 4** via `@tailwindcss/vite` plugin (no `tailwind.config.*` needed). Global styles imported in `src/styles/global.css` via `@import "tailwindcss"`.
- **TypeScript** strict mode (`astro/tsconfigs/strict`).

## Architecture

Minimal Astro project — essentially a blank slate. Key conventions as the project grows:

- Pages → `src/pages/`
- Components → `src/components/` (create when needed; Astro, React, Vue, Svelte, or Preact)
- Static assets → `public/`
- Global CSS → `src/styles/global.css`

Tailwind is configured at the Vite plugin level (`astro.config.mjs`), not via a standalone config file. Add Tailwind customizations using CSS `@theme` blocks inside `src/styles/global.css`.
