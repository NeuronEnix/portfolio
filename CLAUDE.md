# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static personal portfolio site (`kaushikrb.com`) deployed to Cloudflare Workers. The Worker is a pass-through shim that serves `./src` as static assets via the `ASSETS` binding. Only `src/` is deployed — the resume sources and notes in the repo root never ship.

## Common commands

```bash
npm run dev      # Local dev (wrangler dev)
npm run deploy   # Manual deploy to kaushikrb.com (needs a wrangler OAuth login)
```

There is no build step, no bundler, no test suite, and no linter. HTML/CSS/JS in `src/` are shipped as-is.

## Architecture

### Workers setup (`wrangler.toml`)
- Worker `portfolio` on apex + `www.kaushikrb.com`.
- `./src` is served via the `ASSETS` binding with `run_worker_first = true`, so every request hits `worker/index.js` before the static asset handler.
- `not_found_handling = "single-page-application"` — unmatched paths fall back to `index.html`.

### Worker (`worker/index.js`)
A one-line pass-through to `env.ASSETS.fetch(request)`. Keep it logic-free.

### Deployment
Pushes to `main` are built and deployed automatically by Cloudflare Workers Builds (the `cloudflare-workers-and-pages` GitHub App); each push gets a "Workers Builds: portfolio" check run on the commit.

## Things to know when editing

- Cache busting is manual: `src/index.html` and every page under `src/blog/` load `styles.css?v=N` (and `index.html` loads `script.js?v=N`). When you edit either file, bump `N` in **all** referencing pages and keep it identical across them.
- Blog posts are standalone HTML files in `src/blog/` that share `/styles.css` (the `.post-*` rules).
- `src/sitemap.xml`, the `<link rel="canonical">` in `src/index.html`, and the Open Graph / Twitter / JSON-LD URLs are hardcoded to `https://kaushikrb.com/`. Keep them in sync if the domain ever changes.
- No JS framework — `src/script.js` is plain DOM-manipulation JS loaded from `index.html`.
- Fonts load from Google Fonts via `<link>`; nothing is self-hosted.
