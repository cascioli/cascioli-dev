# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before Writing Code — Duplication Check

**Always run this mental checklist before creating or editing any file:**

1. **Components** — check `src/components/` and `src/layouts/`. If functionality overlaps an existing `.astro` file, extend it instead of creating a new one.
2. **CSS utilities** — check `src/styles/global.css` first. Shared animations (`headIn`, `dotPulse`, `marquee`, `blink`, `scanPulse`), layout helpers (`.bg-grid`, `.avatar-frame`), and entry animations (`.head-in-*`) are defined there. **Do not redeclare them in page `<style>` blocks.**
3. **Page-scoped styles** — only use `<style is:global>` in a page when the styles apply to JavaScript-generated HTML (which bypasses Astro's scoped attribute). Everything else uses Tailwind inline classes.
4. **API / serverless functions** — check `api/` before adding a new endpoint. Extend existing handlers if the domain overlaps.
5. **Animations** — do not define a `@keyframes` that already exists in `global.css`. Check before adding any animation.

A `PreToolUse` hook (`.claude/hooks/pre-write-check.ps1`) runs automatically before every `Write`/`Edit` call and echoes the current component list, global CSS classes, and API files as a live reminder.

## Commands

```sh
npm run dev       # dev server at localhost:4321
npm run build     # production build → ./dist/
npm run preview   # preview built site locally
npm run astro ... # astro CLI (e.g. astro add, astro check)
```

Go API local dev (each in its own terminal):

```sh
cd api/osint  && go run ./cmd   # OSINT scan on :8787  → /api/osint/scan
cd api/contact && go run ./cmd  # Contact form on :8788 → /api/contact
```

Vite dev proxy routes `/api/osint/*` → `:8787` and `/api/contact/*` → `:8788`.
Env var required for contact: `RESEND_API_KEY`.

No test runner configured yet.

## Stack

- **Astro 6** — file-based routing from `src/pages/`. `.astro` and `.md` files become routes. Astro View Transitions (`ClientRouter`) active — all client scripts must initialize inside `astro:page-load`.
- **Tailwind CSS 4** via `@tailwindcss/vite` plugin (no `tailwind.config.*` needed). Global styles imported in `src/styles/global.css` via `@import "tailwindcss"`.
- **TypeScript** strict mode (`astro/tsconfigs/strict`).
- **Go serverless functions** on Vercel (one Go module per handler in `api/`).

## Architecture

Personal portfolio site. Dark-mode-only, Zinc/Emerald palette, Geist + Geist Mono fonts.

### Routing

| Route      | File                       | Design pattern                           |
|------------|----------------------------|------------------------------------------|
| `/`        | `src/pages/index.astro`    | Hero + project cards                     |
| `/work`    | `src/pages/work.astro`     | VS Code IDE shell                        |
| `/about`   | `src/pages/about.astro`    | Editor/README layout                     |
| `/notes`   | `src/pages/notes.astro`    | Zen editorial feed                       |
| `/contact` | `src/pages/contact.astro`  | Email + socials + OSINT terminal + form  |

### Components

- `src/layouts/Layout.astro` — HTML shell, OG/Twitter meta, Google Fonts, global CSS, `ClientRouter`. Props: `title`, `description?`, `image?`, `bodyClass?`, `tickerText?`, `showFooter?`.
- `src/components/Navbar.astro` — sticky nav; reads `Astro.url.pathname` to highlight active link.
- `src/components/Ticker.astro` — top marquee status strip. Prop: `latestItem`.
- `src/components/Footer.astro` — site footer (rendered only when `showFooter` is true on Layout).
- `src/components/CommandPalette.astro` — CMD+K search modal. Props: `notes[]`, `quickActions[]`. Dispatches `palette:selectTag` custom event; exposes `window.openCommandPalette()`.

### Go API handlers

| Path | Module | Purpose |
|------|--------|---------|
| `/api/osint/scan` | `api/osint/` | Domain OSINT: MX/SPF/DMARC/SSL/CNAME scan, architect score |
| `/api/contact` | `api/contact/` | Contact form email via Resend, honeypot + CSRF hardening |

Both handlers share the same security pattern: CORS allowlist (`cascioli.dev`, `simonecascioli.it`, `localhost:*`), CSRF guard via `X-Requested-With`, `http.MaxBytesReader`. The OSINT handler also guards against SSRF (blocks private IPs and reserved domain names) and runs MX/SPF/DMARC/SSL/CNAME lookups concurrently with a shared mutex.

### Contact page features

- OSINT terminal (`#osintTerminal`) slides in when user types a valid email domain. Calls `/api/osint/scan`, renders infrastructure/security/architect-score results with staggered reveal animations.
- Disposable email domains block form submission (sets `.alert` on terminal, disables submit button).
- Public providers (Gmail, Outlook, etc.) get a soft info message — no score computed.
- Honeypot field `architect_validation_token` is visually hidden; bots fill it, handler silently accepts and discards.
- Form submits to `/api/contact` with OSINT data attached; Resend delivers HTML email to `info@simonecascioli.it`.

### CSS conventions

- Tailwind at Vite plugin level (`astro.config.mjs`). No `tailwind.config.*`.
- Font families configured via `@theme` in `src/styles/global.css`.
- Shared utilities (`.bg-grid`, `.avatar-frame`, `.dot-pulse`, `.marquee-track`, `.caret`, `.scan-pulse`) and all `@keyframes` live in `src/styles/global.css`.
- Page-specific custom CSS goes in `<style is:global>` blocks — required because JavaScript-generated HTML won't get Astro's scoped attribute.
- Per-page radial gradients (`.bg-radial-home`, `.bg-radial-work`, `.bg-radial-about`, `.contact-ambient`) defined in their respective page's `<style is:global>`.

### Assets

Profile images at `public/assets/profilo-bn.jpg` (B/W) and `public/assets/profilo-color.jpg`. Avatar swap (B/W → color on hover) is JS-driven via `data-bw` / `data-color` attributes.
