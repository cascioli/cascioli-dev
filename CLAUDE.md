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

Personal portfolio site. Dark-mode-only, Zinc/Emerald palette, Geist + Geist Mono fonts.

### Routing

| Route     | File                      | Design pattern          |
|-----------|---------------------------|-------------------------|
| `/`       | `src/pages/index.astro`   | Hero + project cards    |
| `/work`   | `src/pages/work.astro`    | VS Code IDE shell       |
| `/about`  | `src/pages/about.astro`   | Editor/README layout    |
| `/notes`  | `src/pages/notes.astro`   | Zen editorial feed      |

### Components

- `src/layouts/Layout.astro` — HTML shell, Google Fonts, global CSS. Props: `title`, `bodyClass`.
- `src/components/Navbar.astro` — sticky nav; reads `Astro.url.pathname` to highlight active link.
- `src/components/Ticker.astro` — top marquee status strip. Prop: `latestItem`.
- `src/components/Footer.astro` — site footer (Home page only).
- `src/components/CommandPalette.astro` — CMD+K search modal. Props: `notes[]`, `quickActions[]`. Dispatches `palette:selectTag` custom event on selection; exposes `window.openCommandPalette()`.

### CSS conventions

- Tailwind at Vite plugin level (`astro.config.mjs`). No `tailwind.config.*`.
- Font families configured via `@theme` in `src/styles/global.css`.
- Shared utilities (`.bg-grid`, `.avatar-frame`, `.dot-pulse`, `.marquee-track`, `.caret`) live in `src/styles/global.css`.
- Page-specific custom CSS (e.g. `.proj-card`, `.badge`, `.proj-row`) goes in `<style is:global>` blocks in each page — required because JavaScript-generated HTML won't get Astro's scoped attribute.
- Per-page radial gradients (`.bg-radial-home`, `.bg-radial-work`, `.bg-radial-about`) defined in their respective page's `<style is:global>`.

### Assets

Profile images at `public/assets/profilo-bn.jpg` (B/W) and `public/assets/profilo-color.jpg`. Avatar swap (B/W → color on hover) is JS-driven via `data-bw` / `data-color` attributes.
