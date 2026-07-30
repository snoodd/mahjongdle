# Mahjong Solitaire

A daily Wordle-style Mahjong puzzle. Everyone gets the same 13-tile starting
hand and the same 36-tile draw sequence each day, generated deterministically
from the date — no server or database required.

## Local development

```bash
npm install
npm run dev
```

This starts a local dev server (usually http://localhost:5173).

## Building for production

```bash
npm run build
```

Output goes to `dist/`. You can preview the production build locally with:

```bash
npm run preview
```

## Deploying

`dist/` is a static site, so any static host works. A few easy options:

- **Vercel** — `npx vercel` from the project root, or connect the GitHub repo
  in the Vercel dashboard for automatic deploys on push.
- **Netlify** — drag-and-drop the `dist/` folder at app.netlify.com/drop, or
  connect the repo for automatic deploys (build command `npm run build`,
  publish directory `dist`).
- **GitHub Pages** — push `dist/` to a `gh-pages` branch, or use a GitHub
  Action to build and publish automatically.

## About storage

The game saves each player's daily score and streak using `window.storage`.
Inside Claude's artifact sandbox this is provided natively. When self-hosted
(as with the deploy options above), `src/storagePolyfill.js` provides the
same interface backed by the browser's `localStorage`, so no code changes
are needed — each visitor's progress is saved locally in their own browser.

Note this means saved data is per-browser, not shared across devices. If you
want scores visible across everyone in the club (a real leaderboard), you'd
need to swap the polyfill for a small real backend (Supabase, Firebase, etc.)
that all players write to.
