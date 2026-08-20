# Zapply

A job application autofill tool: a Chrome/Edge/Firefox extension that fills application forms in one click, remembers the answers you write, and logs every application to a tracker — backed by a Next.js + MongoDB app that deploys to Vercel.

Built as a functional equivalent of SpeedyApply, with an independent UI and its own implementation.

---

## What's in here

```
zapply/
├── src/
│   ├── app/                    Next.js App Router — pages + 22 API routes
│   ├── components/             Marketing and dashboard UI
│   ├── models/                 Mongoose schemas (User, Profile, Application, SavedResponse)
│   └── lib/                    db, auth, plan gating, AI, helpers
├── extension/                  Manifest V3 browser extension
│   ├── manifest.json           Chrome / Edge (MV3 service worker)
│   ├── manifest.firefox.json   Firefox (MV3 event page)
│   ├── lib/field-map.js        The label → profile-value rule table
│   ├── lib/matcher.js          Label derivation, scoring, framework-safe fills
│   ├── lib/ats.js              25 ATS adapters + detection
│   ├── content/autofill.js     The engine that runs on job pages
│   ├── background.js           Service worker: token, session cache, sync
│   └── popup/                  Pairing + one-click fill UI
└── scripts/
    ├── seed.mjs                Demo account with 46 applications
    ├── build-extension.mjs     Packages dist/chrome and dist/firefox
    └── test-autofill.mjs       Runs the engine against a mock ATS form
```

---

## Setup

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Configure

Only two variables are required:

| Variable | Required | Without it |
|---|---|---|
| `MONGODB_URI` | **yes** | — |
| `JWT_SECRET` | **yes** | — (`openssl rand -base64 48`) |
| `NEXT_PUBLIC_APP_URL` | **in production** | OAuth redirects, reset links and Stripe returns point at localhost |
| `GROQ_API_KEY` | no | Scoring falls back to keyword overlap; drafting and resume parsing return a clear "not configured" message |
| `AI_BASE_URL` / `AI_MODEL` / `AI_API_KEY` | no | Defaults to Groq. Set these to use any other OpenAI-compatible provider |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PREMIUM_PRICE_ID` | no | Upgrading marks the account Premium directly, so the flow stays testable |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | The Google button returns a clear error |
| `RESEND_API_KEY`, `EMAIL_FROM` | no | Reset emails are logged server-side; in dev the link is returned to the browser |

For MongoDB Atlas: create a free M0 cluster, add a database user, and allow access from `0.0.0.0/0` so Vercel's functions can connect.

### 3. Run

```bash
npm run seed     # optional — demo@zapply.dev / demo1234
npm run dev
```

Open http://localhost:3000.

### 4. Load the extension

```bash
npm run ext:build     # produces dist/chrome and dist/firefox
```

**Chrome / Edge** — `chrome://extensions` → **Developer mode** → **Load unpacked** → `dist/chrome`
**Firefox** — `about:debugging` → **Load Temporary Add-on** → `dist/firefox/manifest.json`

Then: dashboard → **Overview → Connect the extension** → **Generate pairing code**, click the Zapply icon, enter the 6 characters, press **Connect**.

Now open any job application. It fills.

> The two builds exist because Firefox doesn't support `background.service_worker`. Shipping one manifest to both silently breaks the Firefox add-on, so `manifest.firefox.json` swaps in an event page instead.

---

## Deploying

Two artifacts, two destinations. **The extension does not deploy to Vercel** — Vercel serves the web app; the extension is distributed through the browser stores (or loaded unpacked).

### The web app → Vercel

```bash
npm i -g vercel
vercel
```

Then add `MONGODB_URI`, `JWT_SECRET` and `NEXT_PUBLIC_APP_URL` under **Project → Settings → Environment Variables** and redeploy. `vercel.json` already sets a 30s function timeout for the AI routes.

After deploying, point the extension at your domain: open the popup, expand **Server URL**, and enter `https://your-app.vercel.app`.

For Stripe, add a webhook to `https://your-app.vercel.app/api/billing/webhook` for `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed` and `customer.subscription.deleted`.

For Google sign-in, the authorised redirect URI must be exactly `https://your-app.vercel.app/api/auth/google/callback`.

### The extension → browser stores

`npm run ext:build`, then upload `dist/zapply-chrome.zip` to the [Chrome Web Store](https://chrome.google.com/webstore/devconsole) (one-time $5 developer fee, review usually takes 1–3 days) and `dist/zapply-firefox.zip` to [addons.mozilla.org](https://addons.mozilla.org/developers/) (free). Set the extension's **Server URL** default in `extension/background.js` (`DEFAULT_API`) to your deployed domain before you package.

---

## How the autofill actually works

This is the part that makes or breaks a tool like this, so it's worth explaining.

**1. Deriving the question.** A form field rarely says what it wants in one place. `deriveLabel()` collects every signal — `<label for>`, `aria-labelledby`, `aria-label`, placeholder, the wrapping `<label>`, a `<legend>`, the nearest labelled container, and finally the `name`/`id` split into words (`firstName` → `first name`) — and concatenates them so a single regex pass covers all of them.

**2. Scoring, not first-match.** Every rule in `field-map.js` carries a weight, a set of `match` regexes and a set of `deny` regexes. `deny` is what stops "First Name" from filling "Reference First Name". Earlier regexes within a rule score higher, so precise patterns beat loose ones. Highest score wins.

**3. Setting the value so the page believes it.** Assigning `el.value = x` updates the DOM but not React's internal state, so the value disappears on submit. Instead the matcher grabs the *native* setter off `HTMLInputElement.prototype` and calls it, then dispatches `input`, `change` and `blur`. Custom comboboxes (react-select, Workday) get typed into, waited on, then have their listbox option clicked. Resume uploads try three strategies, ending with a real `drop` event for drag-and-drop zones.

**4. Anything left over becomes memory.** Unmatched fields get outlined; when the user types an answer and blurs, it's captured, normalized (lowercased, punctuation and filler words stripped, tokens lightly stemmed), and synced. Next time any site asks something similar, stemmed token overlap above 0.6 reuses it. The threshold is deliberately high — submitting a wrong answer to a real employer is much worse than leaving a box empty.

### What Premium changes in that flow

With a Premium account and a `GROQ_API_KEY` set, two extra steps run inside the same fill:

1. **Before filling** — if you keep more than one profile, the extension sends the posting to `/api/ai/score`, which ranks your profiles against it. The winner is used for the fill, and the status pill tells you which one and why (`Using "Backend roles" — 87% match`). Without an API key this falls back to keyword overlap rather than failing.
2. **After filling** — up to four open-ended questions that no rule and no saved answer covered get drafted from your own profile via `/api/ai/answer`. Drafts are outlined in violet so they read differently from filled facts, and whatever you edit before submitting is what gets saved as the reusable answer.

Both are skipped silently on the free plan, and a failure in either never blocks the fill.

### Verifying it

```bash
npm install --no-save jsdom
node scripts/test-autofill.mjs
```

Runs the real engine against a mock Greenhouse-shaped form and prints a per-field report, then checks a set of decoy fields (Reference First Name, Emergency Contact Phone, Spouse Last Name, Desired Job Title…) that must all be left alone. Current result: **27/28 filled, 0 false positives.** The single skip is "Why do you want to work at Northwind?" — a company-specific question with no close saved answer, which is correct behavior: on the free plan it's left for you, and with Premium the drafting pass writes it from your profile.

---

## API

All routes return `{ ok: true, data }` or `{ ok: false, error }`.

**Auth** — `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` · `GET /api/auth/google` → `GET /api/auth/google/callback` · `POST /api/auth/forgot-password` · `POST /api/auth/reset-password` · `GET|POST /api/auth/verify-email`

**Profiles** — `GET|POST /api/profiles` · `GET|PATCH|DELETE /api/profiles/[id]` · `POST /api/profiles/import`

**Applications** — `GET|POST /api/applications` · `PATCH|DELETE /api/applications/[id]` · `GET /api/applications/stats`

**Saved answers** — `GET|POST /api/responses` · `PATCH|DELETE /api/responses/[id]`

**Settings** — `GET|PATCH /api/settings`

**Extension** (bearer token) — `GET /api/extension/pair` issues a code · `POST /api/extension/pair` redeems it · `GET /api/extension/bootstrap` returns profile + settings + answers in one payload · `POST /api/extension/check` asks "have I applied here already?" · `POST /api/extension/sync` logs an application and any new answers

**AI** (Premium) — `POST /api/ai/score` · `POST /api/ai/answer` · `POST /api/ai/parse-resume`

**Billing** — `POST /api/billing/trial` · `POST /api/billing/checkout` (new subscribers) · `POST /api/billing/portal` (existing subscribers) · `POST /api/billing/webhook`

> Checkout and portal are deliberately separate. Sending a current subscriber to checkout creates a *second* subscription and bills them twice — the "Manage subscription" button must go to the portal.

**Files** — `POST|DELETE /api/resume/upload`

### How the extension authenticates

Cookies don't work for an extension acting across arbitrary origins, so pairing uses a short-lived code instead:

```
Dashboard  ──GET /api/extension/pair──▶  6-char code, 10 min TTL, stored on the user
Extension  ──POST /api/extension/pair──▶  code exchanged for a 180-day bearer JWT
Extension  ──Authorization: Bearer ...──▶  bootstrap / sync
```

The token lives in `chrome.storage.local` and only the background worker touches it — content scripts ask the worker to make calls, so credentials never enter a page's context.

---

## The AI provider

AI runs on [Groq](https://console.groq.com) — free tier, no credit card. Get a key, set `GROQ_API_KEY`, done.

Nothing in `src/lib/ai.ts` is Groq-specific beyond the defaults. It speaks plain OpenAI-compatible `/chat/completions`, so swapping providers is two environment variables and no code change:

| Provider | `AI_BASE_URL` | `AI_MODEL` |
|---|---|---|
| **Groq** (default) | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b` |
| xAI (Grok) | `https://api.x.ai/v1` | `grok-4` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | any routed model |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1` |

Put the key in `AI_API_KEY` when using anything other than Groq, so the variable name isn't lying about which service it belongs to.

**Three provider quirks the layer handles for you**, none of which are obvious from the docs:

1. **JSON mode needs the word "JSON" in the prompt.** Groq's `json_object` response format rejects requests whose messages never mention it. Every JSON prompt here says so explicitly.
2. **Reasoning models break JSON mode unless reasoning is hidden.** `gpt-oss` and `qwen3` emit a thinking block by default, which isn't valid JSON. The layer sets `reasoning_format: "hidden"` whenever JSON mode is on — required, not cosmetic.
3. **The free tier is 30 requests/minute.** The drafting pass can fire four calls back to back, so 429s and 5xx are retried with backoff, honouring `Retry-After` when the provider sends it.

Model IDs move. Groq deprecated its Llama chat models (`llama-3.3-70b-versatile` and friends), which is why the default is `openai/gpt-oss-120b`. If that one goes too, set `AI_MODEL` rather than editing code — check [console.groq.com/docs/models](https://console.groq.com/docs/models) for what's current.

### Resume parsing

Groq's models take text only, so resume text is extracted server-side before it reaches the model: [unpdf](https://github.com/unjs/unpdf) for PDFs (pdf.js under the hood, no native bindings, works on Vercel) and mammoth for `.docx`.

One consequence worth knowing: this is plain text extraction, so heavily designed two-column resumes can interleave columns and parse less accurately than a single-column layout. If a parse comes back scrambled, that's usually why. Image-only PDFs and scans have no text to extract at all and return a clear error rather than silent nonsense.

## Security

- **Passwords** are bcrypt-hashed; sessions are HS256 JWTs in `httpOnly`, `sameSite=lax` cookies.
- **Rate limiting is database-backed**, not in-memory. An in-process counter is useless on Vercel because each serverless instance has its own memory — an attacker just spreads requests across instances. Counters live in Mongo with a TTL index, so the limit is global and self-cleaning. Login is capped per-account *and* per-IP; the limiter fails open, since a database blip shouldn't lock everyone out of signing in.
- **Reset and verification tokens** are stored as SHA-256 hashes, so a leaked database dump can't be used to take over accounts. They're single-use and expire (1 hour / 24 hours).
- **Forgot-password never reveals whether an address has an account** — the response is identical either way.
- **Google OAuth** uses a `state` nonce in an `httpOnly` cookie, checked on callback. An existing email links to the current account rather than creating a duplicate.
- **The extension's bearer token lives only in the background worker.** Content scripts ask the worker to make API calls, so credentials never enter a page's JavaScript context where a hostile site could read them.

## Notes and limits

- **Resumes are stored as base64 on the profile document.** Fine up to ~4 MB, which covers a resume. For production, move `documents.dataUrl` to S3 or UploadThing and store a URL.
- **Auto Pilot is off by default** and stays that way. Filling is safe; submitting on someone's behalf is not something to turn on quietly.
- **Applications are unique per `(userId, url)`**, so re-submitting a posting updates the row rather than duplicating it. The extension also checks before filling and warns you instead of quietly applying twice.
- **Profile exports don't include documents.** A base64 resume would bloat the JSON; re-attach it after importing.
- **AI-drafted answers are outlined in violet on the page** so they read differently from filled facts — they're meant to be reviewed, and whatever you edit is what gets saved.
- **AI features degrade gracefully.** Profile scoring falls back to keyword overlap without a `GROQ_API_KEY`; billing falls back to a mock upgrade without Stripe keys.
- Adding a new ATS is one entry in `extension/lib/ats.js`. Most sites already work through the generic adapter, since matching is label-driven rather than selector-driven.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run seed` | Demo account with 46 applications and 8 saved answers |
| `npm run ext:build` | Package the extension into `dist/chrome` and `dist/firefox` |
| `node scripts/test-autofill.mjs` | Run the engine against a mock ATS form (needs `npm i --no-save jsdom`) |
