# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static personal portfolio site (`kaushikrb.com`) deployed to Cloudflare Workers. The Worker exists almost entirely to serve `./src` as static assets via the `ASSETS` binding; its only runtime logic is environment-aware SEO blocking on the test deployment.

## Common commands

```bash
npm run dev          # Local dev against prod config (wrangler dev --env prod)
npm run dev:test     # Local dev against test config
npm run deploy       # Deploy to prod (kaushikrb.com)
npm run deploy:test  # Deploy to test (test.kaushikrb.com, as `portfolio-test`)
```

There is no build step, no bundler, no test suite, and no linter. HTML/CSS/JS in `src/` are shipped as-is.

## Architecture

### Two-environment Workers setup (`wrangler.toml`)
- `[env.prod]` → Worker `portfolio` on apex + `www.kaushikrb.com`, `ENVIRONMENT = "prod"`.
- `[env.test]` → Worker `portfolio-test` on `test.kaushikrb.com`, `ENVIRONMENT = "test"`.
- Both environments share the same `./src` assets directory and use `run_worker_first = true`, so every request hits `worker/index.js` before the static asset handler.
- `not_found_handling = "single-page-application"` — unmatched paths fall back to `index.html`.

### Worker responsibilities (`worker/index.js`)
The Worker is a thin shim around `env.ASSETS.fetch()`. Its only job is to make the test environment invisible to search engines:
- On test, `/robots.txt` is overridden with `Disallow: /`.
- On test, `/sitemap.xml` returns 404 (so the prod sitemap shipped in `src/` isn't served).
- On test, every response gets `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` and `Cache-Control: no-store` headers stamped on.
- On prod, the Worker is a pass-through.

When changing SEO behavior, the canonical URL in `src/index.html` always points to `https://kaushikrb.com/` even when served from test — the Worker headers are what keep test out of indexes, not the markup.

### Deployment (`.github/workflows/deploy.yml`)
Pushes to `main` → `wrangler deploy --env prod`. Pushes to `test` → `wrangler deploy --env test`. Both require `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets. `workflow_dispatch` is enabled for manual runs.

## Things to know when editing

- `src/sitemap.xml`, the `<link rel="canonical">` in `src/index.html`, and the Open Graph / Twitter / JSON-LD URLs are all hardcoded to `https://kaushikrb.com/`. Keep them in sync if the domain ever changes.
- The site has no JS framework. `src/script.js` is plain DOM-manipulation JS loaded directly from `index.html`.
- Fonts are loaded from Google Fonts via `<link>` — no self-hosting.
