# Hidden Google Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an easter-egg-triggered Google sign-in to the portfolio site, with a top-bar "Logged In" badge and a Worker endpoint (`/api/whoami`) that verifies Firebase ID tokens against Firebase's public JWKS.

**Architecture:** Static site + Firebase Auth (browser, via `gstatic` ES-module CDN) + Cloudflare Worker that validates Firebase ID tokens with the `jose` library against Firebase's JWKS. No service account, no Admin SDK, no Firestore. Worker remains stateless; the ID token lives client-side in Firebase's IndexedDB persistence.

**Tech Stack:** Vanilla HTML/CSS/JS, Firebase JS SDK v10 modular (CDN), `jose` (npm, for Worker JWT verify), Cloudflare Workers, wrangler.

**Spec:** `docs/superpowers/specs/2026-05-22-hidden-google-login-design.md`

---

## Prerequisites (owner action)

Before Task 1 can be **fully** verified end-to-end, the owner must complete the Firebase setup steps in the spec and provide:
- `apiKey`
- `authDomain`
- `projectId`
- `appId`

Tasks 1–3 can be coded with placeholder config values; Task 4 onward requires real values.

---

## File structure

| Path | Responsibility |
|---|---|
| `src/firebase-config.js` | **NEW.** Single source of truth for Firebase web config. Exports the config object. Public values, safe to commit. |
| `src/auth.js` | **NEW.** ES module. Owns: Firebase init, Google sign-in/out, easter-egg trigger, popup show/hide, top badge toggle, post-sign-in `/api/whoami` smoke ping. |
| `src/index.html` | Add module script tag, popup markup at end of `<body>`, "Logged In" badge in nav. |
| `src/styles.css` | Styles for popup (backdrop, card, buttons) and badge. |
| `src/script.js` | **Untouched.** Existing logic stays as a non-module classic script. |
| `worker/index.js` | Add `/api/whoami` route in front of the pass-through. |
| `package.json` | Add `jose` to `dependencies`. |

`auth.js` is intentionally a single file. It is small (<200 lines) and all its pieces operate on the same auth state, so splitting it would create more cross-file noise than it removes.

---

## Task 1: Firebase config + SDK loads

**Files:**
- Create: `src/firebase-config.js`
- Create: `src/auth.js`
- Modify: `src/index.html` (add module script tag right after the existing `<script src="script.js?v=17" defer></script>`)

- [ ] **Step 1: Write `src/firebase-config.js`**

If real values are available, use them. Otherwise use the placeholders below — they make the page load without throwing; auth calls will fail with a clear Firebase error until real values are dropped in.

```js
// Public web config — safe to commit. Identifies the Firebase project,
// is not a secret. Replace placeholders with values from
// Firebase console → Project settings → General → Your apps → Web app.
export const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

// Used by the Worker's whoami endpoint check (client side only displays
// behavior; Worker has its own copy of OWNER_EMAIL).
export const OWNER_EMAIL = "kaushikrb909@gmail.com";
```

- [ ] **Step 2: Write `src/auth.js` (minimal init only)**

```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
console.log("[auth] Firebase initialized", { projectId: firebaseConfig.projectId });
```

- [ ] **Step 3: Add the module script to `src/index.html`**

Find this line near the end of `<body>` (around line 580):

```html
<script src="script.js?v=17" defer></script>
```

Add directly below it:

```html
<script type="module" src="auth.js?v=1"></script>
```

- [ ] **Step 4: Run the dev server and verify**

Run: `npm run dev`

In Chrome, open `http://localhost:8787`, open DevTools console. Expected: a single log line `[auth] Firebase initialized { projectId: "..." }`. No red errors related to Firebase. (Placeholder `apiKey` is fine here — `initializeApp` does not network on init.)

If you see `Failed to resolve module specifier`, the script tag is missing `type="module"`.

- [ ] **Step 5: Commit**

```bash
git add src/firebase-config.js src/auth.js src/index.html
git commit -m "Wire up Firebase Auth SDK with placeholder config"
```

---

## Task 2: Easter-egg trigger detects 10 clicks in 3 seconds

**Files:**
- Modify: `src/auth.js`

- [ ] **Step 1: Add the trigger logic to `src/auth.js`**

Append below the `console.log("[auth] Firebase initialized", ...)` line:

```js
// Easter egg: 10 clicks/taps on the hero name within 3 seconds opens the popup.
const TRIGGER_THRESHOLD = 10;
const TRIGGER_WINDOW_MS = 3000;

const heroName = document.querySelector(".hero-name");
if (heroName) {
  const hits = [];
  heroName.addEventListener("click", () => {
    const now = Date.now();
    hits.push(now);
    while (hits.length && now - hits[0] > TRIGGER_WINDOW_MS) hits.shift();
    if (hits.length >= TRIGGER_THRESHOLD) {
      hits.length = 0;
      console.log("[auth] easter egg triggered");
    }
  });
}
```

- [ ] **Step 2: Bump the script version**

In `src/index.html`, change `auth.js?v=1` to `auth.js?v=2` so the browser fetches the new version.

- [ ] **Step 3: Verify in the browser**

With `npm run dev` running, reload the page. Click the hero name 10 times within 3 seconds. Expected console log: `[auth] easter egg triggered`. Click only 9 times in 3s → no log. Click 10 times spread over 5s → no log (the 3s window dropped the early hits).

- [ ] **Step 4: Commit**

```bash
git add src/auth.js src/index.html
git commit -m "Add easter-egg trigger: 10 hero-name clicks in 3s"
```

---

## Task 3: Popup shell (open/close, no auth yet)

**Files:**
- Modify: `src/index.html` (add popup markup before `</body>`)
- Modify: `src/styles.css` (append popup styles)
- Modify: `src/auth.js` (replace `console.log` trigger with `openPopup()`; add open/close logic)

- [ ] **Step 1: Add popup markup to `src/index.html`**

Insert directly before `</body>` (line 581):

```html
    <div id="auth-popup" class="auth-popup" hidden role="dialog" aria-modal="true" aria-labelledby="auth-popup-title">
      <div class="auth-popup-backdrop" data-auth-close></div>
      <div class="auth-popup-card">
        <button class="auth-popup-close" type="button" aria-label="Close" data-auth-close>×</button>
        <h2 id="auth-popup-title" class="auth-popup-title">Sign in</h2>
        <div class="auth-popup-body">
          <p class="auth-popup-text">Popup is wired up. Sign-in comes in the next task.</p>
        </div>
      </div>
    </div>
```

- [ ] **Step 2: Add popup styles to `src/styles.css`**

Append to the end of the file:

```css
/* ── Hidden Google login popup ──────────────────────────────────────── */
.auth-popup[hidden] { display: none; }
.auth-popup {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.auth-popup-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(20, 18, 14, 0.45);
  backdrop-filter: blur(2px);
}
.auth-popup-card {
  position: relative;
  width: min(280px, calc(100vw - 32px));
  background: #FAF8F2;
  color: #1A1916;
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
  padding: 22px 22px 20px;
  font-family: inherit;
}
.auth-popup-close {
  position: absolute;
  top: 8px;
  right: 10px;
  background: transparent;
  border: 0;
  font-size: 22px;
  line-height: 1;
  color: #6B6760;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}
.auth-popup-close:hover { background: rgba(0,0,0,0.06); color: #1A1916; }
.auth-popup-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px;
}
.auth-popup-text {
  font-size: 14px;
  line-height: 1.45;
  color: #3A3833;
  margin: 0 0 14px;
}
.auth-popup-google-btn,
.auth-popup-signout-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #D7D2C5;
  background: #FFFFFF;
  color: #1A1916;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.auth-popup-google-btn:hover,
.auth-popup-signout-btn:hover { background: #F2EEE3; }
.auth-popup-google-btn svg { width: 18px; height: 18px; }
.auth-popup-email {
  font-size: 13px;
  color: #3A3833;
  margin: 0 0 12px;
  word-break: break-all;
}
```

- [ ] **Step 3: Add popup open/close logic to `src/auth.js`**

Replace the `console.log("[auth] easter egg triggered");` line from Task 2 with `openPopup();`. Then append the helpers:

```js
const popupEl = document.getElementById("auth-popup");

function openPopup() {
  if (!popupEl) return;
  popupEl.hidden = false;
  document.addEventListener("keydown", onEscToClose);
}
function closePopup() {
  if (!popupEl) return;
  popupEl.hidden = true;
  document.removeEventListener("keydown", onEscToClose);
}
function onEscToClose(e) {
  if (e.key === "Escape") closePopup();
}
popupEl?.addEventListener("click", (e) => {
  if (e.target instanceof HTMLElement && e.target.hasAttribute("data-auth-close")) {
    closePopup();
  }
});
```

- [ ] **Step 4: Bump script version**

In `src/index.html` change `auth.js?v=2` → `auth.js?v=3`.

- [ ] **Step 5: Verify in the browser**

Reload, click hero name 10× in 3s → popup appears centered. Click ×, press Esc, click backdrop → each dismisses the popup. Clicking *inside* the card does **not** close it.

- [ ] **Step 6: Commit**

```bash
git add src/index.html src/styles.css src/auth.js
git commit -m "Add login popup shell with open/close behavior"
```

---

## Task 4: Wire Google sign-in and sign-out

**Files:**
- Modify: `src/auth.js`

**Requires:** Real Firebase web config values from the owner.

- [ ] **Step 1: Drop in real Firebase config**

Edit `src/firebase-config.js` and replace the four placeholder values with the real values from the owner.

- [ ] **Step 2: Update imports and add sign-in/sign-out logic in `src/auth.js`**

Change the imports at the top of `auth.js`:

```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
```

After the existing `const auth = getAuth(app);` line, add:

```js
const provider = new GoogleAuthProvider();

function renderPopupBody(user) {
  const body = popupEl?.querySelector(".auth-popup-body");
  const title = popupEl?.querySelector(".auth-popup-title");
  if (!body || !title) return;

  if (user) {
    title.textContent = "Signed in";
    body.innerHTML = `
      <p class="auth-popup-email">${escapeHtml(user.email ?? "")}</p>
      <button type="button" class="auth-popup-signout-btn" id="auth-signout-btn">Sign out</button>
    `;
    body.querySelector("#auth-signout-btn")?.addEventListener("click", async () => {
      await signOut(auth);
    });
  } else {
    title.textContent = "Sign in";
    body.innerHTML = `
      <button type="button" class="auth-popup-google-btn" id="auth-google-btn">
        <svg viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#EA4335" d="M9 3.48c1.69 0 2.85.73 3.5 1.34l2.56-2.5C13.46.96 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z"/>
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.63z"/>
          <path fill="#FBBC05" d="M3.88 10.78A5.4 5.4 0 0 1 3.58 9c0-.62.11-1.22.3-1.78L.96 4.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.92-2.26z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.38 0-4.4-1.57-5.13-3.74L.96 13.04C2.44 15.98 5.48 18 9 18z"/>
        </svg>
        Sign in with Google
      </button>
    `;
    body.querySelector("#auth-google-btn")?.addEventListener("click", async () => {
      try {
        await signInWithPopup(auth, provider);
      } catch (err) {
        console.error("[auth] sign-in failed", err);
      }
    });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

onAuthStateChanged(auth, (user) => {
  renderPopupBody(user);
  console.log("[auth] state changed", user?.email ?? "(signed out)");
});
```

- [ ] **Step 3: Bump script version**

In `src/index.html` change `auth.js?v=3` → `auth.js?v=4`.

- [ ] **Step 4: Verify sign-in works**

With `npm run dev` running, reload and trigger the popup. Click "Sign in with Google". A Google OAuth popup should appear. After choosing an account:
- The popup body switches to "Signed in" + your email + "Sign out".
- Console shows `[auth] state changed your@email.com`.
- Reload the page — Firebase persists the session, so re-triggering the easter egg shows the signed-in state immediately (no Google prompt).

Click "Sign out" → body flips back to the Google button.

If sign-in fails with `auth/unauthorized-domain`, `localhost` is not in the Firebase authorized domains list — add it in the Firebase console (it is included by default but worth checking).

- [ ] **Step 5: Commit**

```bash
git add src/firebase-config.js src/auth.js src/index.html
git commit -m "Wire Google sign-in/sign-out into login popup"
```

---

## Task 5: Top "Logged In" badge

**Files:**
- Modify: `src/index.html` (add badge inside `.topbar-nav`)
- Modify: `src/styles.css` (badge styles)
- Modify: `src/auth.js` (toggle visibility in `onAuthStateChanged`, click reopens popup)

- [ ] **Step 1: Add the badge to `src/index.html`**

Find the `<nav class="topbar-nav" aria-label="Primary">` block (around line 135). Inside `<nav>`, **after** the existing `<a class="topbar-cta" href="#contact">Contact me</a>` link, add:

```html
          <button type="button" id="auth-badge" class="auth-badge" hidden aria-label="Open login popup">Logged In</button>
```

- [ ] **Step 2: Style the badge in `src/styles.css`**

Append:

```css
.auth-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  margin-left: 12px;
  border-radius: 999px;
  border: 0;
  background: #1F9D55;
  color: #FFFFFF;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.2px;
  cursor: pointer;
  line-height: 1.4;
}
.auth-badge:hover { background: #197A43; }
.auth-badge[hidden] { display: none; }
.auth-badge::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #C8FACC;
}
```

- [ ] **Step 3: Hook the badge into `src/auth.js`**

Below the `popupEl` declaration, add:

```js
const badgeEl = document.getElementById("auth-badge");
badgeEl?.addEventListener("click", openPopup);
```

In the existing `onAuthStateChanged` callback, **before** the existing `renderPopupBody(user)` line, add:

```js
  if (badgeEl) badgeEl.hidden = !user;
```

Final callback looks like:

```js
onAuthStateChanged(auth, (user) => {
  if (badgeEl) badgeEl.hidden = !user;
  renderPopupBody(user);
  console.log("[auth] state changed", user?.email ?? "(signed out)");
});
```

- [ ] **Step 4: Bump script version**

In `src/index.html` change `auth.js?v=4` → `auth.js?v=5`.

- [ ] **Step 5: Verify**

With `npm run dev` running, reload while signed out → no badge visible. Trigger easter egg, sign in → green "Logged In" badge appears in the nav. Click the badge → popup opens directly (no easter egg required). Sign out → badge disappears. Reload while signed in → badge appears immediately (no popup needed).

- [ ] **Step 6: Commit**

```bash
git add src/index.html src/styles.css src/auth.js
git commit -m "Show 'Logged In' badge in nav when signed in"
```

---

## Task 6: Worker `/api/whoami` endpoint with JWT verification

**Files:**
- Modify: `package.json` (add `jose` dependency)
- Modify: `worker/index.js`

- [ ] **Step 1: Install `jose`**

Run: `npm install jose`

This adds `jose` to `dependencies` in `package.json` and updates `package-lock.json`. Wrangler will bundle it into the Worker automatically.

- [ ] **Step 2: Rewrite `worker/index.js`**

Replace the entire file contents with:

```js
import { jwtVerify, createRemoteJWKSet } from "jose";

const FIREBASE_PROJECT_ID = "REPLACE_WITH_PROJECT_ID";
const OWNER_EMAIL = "kaushikrb909@gmail.com";

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

async function verifyFirebaseToken(token) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  });
  return payload;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/whoami") {
      const authHeader = request.headers.get("authorization") ?? "";
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!match) return json({ error: "missing_bearer" }, 401);

      try {
        const claims = await verifyFirebaseToken(match[1]);
        const email = claims.email ?? null;
        return json({ email, isOwner: email === OWNER_EMAIL });
      } catch (err) {
        return json({ error: "invalid_token", reason: err.code ?? err.message }, 401);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
```

**Important:** Replace `REPLACE_WITH_PROJECT_ID` with the actual Firebase `projectId` value before testing.

- [ ] **Step 3: Smoke-test rejection of missing/invalid tokens**

With `npm run dev` running, in a separate terminal:

```bash
curl -i http://localhost:8787/api/whoami
```

Expected: HTTP 401, body `{"error":"missing_bearer"}`.

```bash
curl -i -H "Authorization: Bearer not.a.real.token" http://localhost:8787/api/whoami
```

Expected: HTTP 401, body `{"error":"invalid_token","reason":"..."}` — the reason will mention JWT parsing or signature failure.

- [ ] **Step 4: Smoke-test accepting a real token**

In the browser at `http://localhost:8787`, after signing in via the popup, paste this into the DevTools console:

```js
const token = await firebase_auth_test_user_token();
```

Wait — that helper doesn't exist. Use this instead:

```js
// Pull the current user's ID token. `auth` from auth.js is module-scoped,
// so import via the same CDN URL to get the same Auth instance.
const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js");
const token = await getAuth().currentUser.getIdToken();
const res = await fetch("/api/whoami", { headers: { authorization: `Bearer ${token}` } });
console.log(res.status, await res.json());
```

Expected: `200 { email: "your@email.com", isOwner: true|false }` (`isOwner` is `true` only for `kaushikrb909@gmail.com`).

If you see `iss claim check failed` or `aud claim check failed`, the `FIREBASE_PROJECT_ID` constant doesn't match the project the token was issued for.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json worker/index.js
git commit -m "Add /api/whoami endpoint with Firebase JWT verification"
```

---

## Task 7: End-to-end smoke ping after sign-in

Wire the client to call `/api/whoami` once after sign-in so the full chain runs automatically — surfaces any future regressions in the JWKS verify path.

**Files:**
- Modify: `src/auth.js`

- [ ] **Step 1: Add a one-shot `/api/whoami` call after sign-in**

In `src/auth.js`, replace the existing `onAuthStateChanged` callback with:

```js
onAuthStateChanged(auth, async (user) => {
  if (badgeEl) badgeEl.hidden = !user;
  renderPopupBody(user);
  console.log("[auth] state changed", user?.email ?? "(signed out)");

  if (user) {
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/whoami", { headers: { authorization: `Bearer ${token}` } });
      const data = await res.json();
      console.log("[auth] whoami", res.status, data);
    } catch (err) {
      console.warn("[auth] whoami failed", err);
    }
  }
});
```

- [ ] **Step 2: Bump script version**

In `src/index.html` change `auth.js?v=5` → `auth.js?v=6`.

- [ ] **Step 3: Verify end-to-end**

Reload `http://localhost:8787`, trigger the popup, sign in. Console should log, in order:
1. `[auth] state changed your@email.com`
2. `[auth] whoami 200 { email: "your@email.com", isOwner: true }` (or `isOwner: false` for non-owners)

- [ ] **Step 4: Commit**

```bash
git add src/auth.js src/index.html
git commit -m "Ping /api/whoami after sign-in for end-to-end smoke check"
```

---

## Task 8: Production deploy

- [ ] **Step 1: Final pre-deploy check on localhost**

With everything committed, run `npm run dev` once more and complete one full pass: trigger easter egg → sign in → see badge + whoami `200 isOwner:true` → sign out → badge disappears. Reload while signed in → badge appears. Sign out from the popup → badge disappears.

- [ ] **Step 2: Deploy**

```bash
npm run deploy
```

- [ ] **Step 3: Verify in production**

Visit `https://kaushikrb.com`. Repeat the same smoke flow as Step 1. Also verify `curl -i https://kaushikrb.com/api/whoami` returns 401 with `{"error":"missing_bearer"}`.

If sign-in fails on production with `auth/unauthorized-domain`, add `kaushikrb.com` and `www.kaushikrb.com` to Firebase → Authentication → Settings → Authorized domains.

- [ ] **Step 4: No new commit needed.** Deploy is the final step.

---

## Self-review notes

- Spec coverage:
  - Easter egg trigger → Task 2.
  - Popup (signed-out + signed-in states, dismissal) → Tasks 3 & 4.
  - Top "Logged In" badge → Task 5.
  - Firebase Auth integration → Tasks 1, 4.
  - Worker `/api/whoami` with JWKS verification → Task 6.
  - End-to-end chain proven → Task 7.
  - Production deploy → Task 8.
- Type/name consistency: `popupEl`, `badgeEl`, `openPopup`/`closePopup`, `renderPopupBody`, `escapeHtml`, `firebaseConfig`, `OWNER_EMAIL`, `FIREBASE_PROJECT_ID`, `verifyFirebaseToken`, `JWKS` are used consistently across tasks.
- No placeholders in the work itself — only two REPLACE markers (Firebase web config in Task 1 / Task 4, and `FIREBASE_PROJECT_ID` in Task 6), both clearly flagged as owner-supplied values.
