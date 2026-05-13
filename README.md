# cascioli.dev

Personal portfolio for [Simone Cascioli](https://cascioli.dev) — Software Architect, AI & Cybersecurity.

## Stack

- **Astro 6** + **Tailwind CSS 4** + **TypeScript**
- **Go** serverless functions on Vercel (contact form, OSINT domain scan)
- Dark-mode only · Zinc/Emerald palette · Geist fonts

## Dev

```sh
npm install
npm run dev        # frontend → localhost:4321
```

Go APIs (optional, for contact page):

```sh
cd api/osint  && go run ./cmd   # → localhost:8787
cd api/contact && go run ./cmd  # → localhost:8788
```

`RESEND_API_KEY` env var required for the contact form to send emails.

## Routes

| Route | Description |
|-------|-------------|
| `/` | Hero + project cards |
| `/work` | VS Code IDE shell |
| `/about` | Editor/README layout |
| `/notes` | Editorial feed |
| `/contact` | Contact form with OSINT terminal |

## Deploy

Deployed on Vercel. Go functions are auto-detected from `api/*/` directories.
