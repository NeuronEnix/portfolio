# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static personal portfolio site (`kaushikrb.com`) deployed to Cloudflare Workers. The Worker is a pass-through shim that serves `./src` as static assets via the `ASSETS` binding.

## Common commands

```bash
npm run dev      # Local dev (wrangler dev)
npm run deploy   # Deploy to kaushikrb.com
```

There is no build step, no bundler, no test suite, and no linter. HTML/CSS/JS in `src/` are shipped as-is.

## Architecture

### Workers setup (`wrangler.toml`)
- Worker `portfolio` on apex + `www.kaushikrb.com`.
- `./src` is served via the `ASSETS` binding with `run_worker_first = true`, so every request hits `worker/index.js` before the static asset handler.
- `not_found_handling = "single-page-application"` — unmatched paths fall back to `index.html`.

### Worker (`worker/index.js`)
A one-line pass-through to `env.ASSETS.fetch(request)`. The Worker exists only because `run_worker_first = true` requires one; it adds no runtime logic.

### Deployment (Cloudflare Workers Builds)
Pushes to `main` are built and deployed automatically by Cloudflare Workers Builds (the `cloudflare-workers-and-pages` GitHub App connected to this repo) — there is no GitHub Actions workflow. Each push gets a "Workers Builds: portfolio" check run on the commit. `npm run deploy` still works for manual deploys from a machine with a wrangler OAuth session.

## Things to know when editing

- `src/sitemap.xml`, the `<link rel="canonical">` in `src/index.html`, and the Open Graph / Twitter / JSON-LD URLs are all hardcoded to `https://kaushikrb.com/`. Keep them in sync if the domain ever changes.
- The site has no JS framework. `src/script.js` is plain DOM-manipulation JS loaded directly from `index.html`.
- Fonts are loaded from Google Fonts via `<link>` — no self-hosting.
