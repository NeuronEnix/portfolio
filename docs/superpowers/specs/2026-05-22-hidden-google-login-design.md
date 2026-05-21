# Hidden Google Login — Design

**Date:** 2026-05-22
**Status:** Approved, ready for implementation plan

## Purpose

Add a hidden Google sign-in to the portfolio site, triggered by an easter-egg interaction. The owner (`kaushikrb909@gmail.com`) is the only privileged identity; any other Google account can sign in but receives no special access. No gated content exists yet — this change establishes the auth plumbing so future protected routes can be added with minimal extra work.

## User-visible behavior

1. **Trigger:** Tap or click the hero name (`h1.hero-name`) **10 times within 3 seconds**. Each event is added to a rolling buffer; entries older than 3s are dropped on each event. When the buffer reaches 10, the popup opens and the buffer clears.
2. **Popup (signed out):** A small floating card (~280px wide, centered, with a soft shadow) containing a Google-branded "Sign in with Google" button and a close (×) button. Dismissable via × button, Esc key, or click on the backdrop.
3. **Popup (signed in):** Same card, showing "Signed in as `<email>`" + a "Sign out" button + close (×).
4. **Top badge:** When `auth.currentUser` is non-null, render a small green "Logged In" pill in the nav bar. Hidden entirely when signed out. Clicking the badge reopens the popup so the user can sign out without re-triggering the easter egg.
5. **Persistence:** Sign-in state survives page reloads (Firebase Auth's default IndexedDB persistence). The easter egg must still be re-triggered to reopen the popup after dismissal — the badge is the only persistent indicator.

## Architecture

```
[Browser]                                 [Cloudflare Worker]              [Firebase]
  ├─ tap .hero-name × 10 in 3s
  ├─ popup → signInWithPopup(google)  ───────────────────────────────────►  Auth
  ◄────────── ID token (JWT) ─────────────────────────────────────────────
  ├─ store auth state (Firebase persists in IndexedDB)
  ├─ render "Logged In" badge if signed in
  └─ fetch /api/whoami with Bearer token ─►  validate JWT vs JWKS  ───────►  JWKS (public)
                                          ◄─ {email, isOwner}
```

- Firebase Auth (client-side) handles the OAuth dance with Google.
- The Cloudflare Worker verifies Firebase ID tokens against Firebase's public JWKS endpoint. **No service account key or Admin SDK is required** — JWKS verification is unauthenticated.
- All non-`/api/*` paths continue to pass through to `env.ASSETS.fetch` as today.

## Components

### 1. Easter-egg trigger (`src/script.js`)
- Attach a single `click` listener to `.hero-name`. Touch events synthesize clicks on iOS/Android, so a separate `touchstart` listener is unnecessary.
- Maintain a module-scoped array of timestamps. On each click: push `Date.now()`, drop entries older than 3000ms, and if `length >= 10`, open the popup and clear the array.
- Window: 3000ms. Threshold: 10 events.

### 2. Login popup (HTML + CSS + JS)
- Markup added to `src/index.html` at the end of `<body>`, initially `hidden`.
- Structure: a fixed-position backdrop containing a card. Card has two regions rendered conditionally via JS based on auth state.
- Dismiss handlers: × button, `Escape` keydown, click on backdrop (but not on the card itself).
- Styling lives in `src/styles.css`. Card uses the site's existing palette (cream background, dark text) with a subtle shadow.

### 3. Top "Logged In" badge
- An element added to the nav bar in `src/index.html` (near `.brand`), `hidden` by default.
- JS toggles visibility on `onAuthStateChanged`. When visible: small green pill (background `#1f9d55` or similar), white text, rounded corners.
- Click handler on the badge reopens the popup.

### 4. Firebase Auth integration
- Load the Firebase modular SDK as an ES module from `gstatic.com` (Firebase's official CDN). No bundler, no npm install required.
- New file `src/firebase-config.js` exports the web config (`apiKey`, `authDomain`, `projectId`, `appId`). These values are public and safe to ship — they are not credentials, they only identify the project.
- `src/script.js` (or a new `src/auth.js`) imports the SDK, calls `initializeApp`, sets up a `GoogleAuthProvider`, and wires `signInWithPopup` / `signOut` to the popup buttons.
- `onAuthStateChanged` is the single source of truth for UI state — both the popup contents and the top badge react to it.

### 5. Worker `/api/whoami` (`worker/index.js`)
- Worker matches `request.url` pathname `=== "/api/whoami"`.
- Reads `Authorization: Bearer <idToken>` header. Returns 401 if missing.
- Verifies the JWT:
  - Signature: against Firebase's JWKS at `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`. Cached in module scope across requests on the same isolate.
  - `iss`: must equal `https://securetoken.google.com/<projectId>`.
  - `aud`: must equal `<projectId>`.
  - `exp`: must be in the future.
- On success, returns JSON: `{ email, isOwner: email === "kaushikrb909@gmail.com" }`.
- All other paths fall through to `env.ASSETS.fetch(request)` unchanged.
- The project ID is hardcoded in the Worker (it is not a secret).

## Files touched / created

| Path | Change |
|---|---|
| `src/index.html` | Add popup markup, top badge markup, script tag for module entry |
| `src/styles.css` | Styles for popup, backdrop, badge |
| `src/script.js` | Easter-egg trigger, popup show/hide, sign-in/out wiring |
| `src/firebase-config.js` | **NEW** — public Firebase web config |
| `src/auth.js` | **NEW** (optional split) — Firebase init + auth state observer. May be inlined into `script.js` if it stays small. |
| `worker/index.js` | Add `/api/whoami` handler with JWT verification |

## Firebase setup (owner action, parallel to implementation)

1. **Authentication → Sign-in method:** enable the **Google** provider. Set public-facing name and support email.
2. **Authentication → Settings → Authorized domains:** add `kaushikrb.com` and `www.kaushikrb.com`. `localhost` is included by default.
3. **Project settings → General → Your apps:** add a Web app if none exists. Copy and provide:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `appId`

No service account key, no Admin SDK, no Firestore needed.

## Non-goals (explicitly out of scope)

- No gated content/pages — `/api/whoami` is the only auth-aware endpoint for now.
- No session cookie or server-set state. The ID token is held client-side by Firebase; the Worker is stateless.
- No tracking, analytics, or persistence of who signs in.
- No allowlist beyond the single owner email. Other sign-ins succeed but get `isOwner: false`.
- No "remember the easter egg was discovered" UX — the puzzle is the same every visit. The top badge is the only persistent affordance.

## Open questions

None. Awaiting Firebase web config values from the owner.
