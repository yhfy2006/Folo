# YOMOO Mailing List System Design

## Overview

Add email newsletter capability to YOMOO 每日AI快送. Subscribers receive the daily HTML report via email after each pipeline run.

## Architecture

```
User visits subscribe page (GitHub Pages)
  → Enters email, POST to Cloudflare Worker
  → Worker stores email in Cloudflare KV (private)
  → Returns success

Pipeline runs daily:
  → Stages 1-5 (existing: report → podcast → audio → upload → publish)
  → Stage 6: Worker GET /subscribers (with secret) → email list
  → Resend API sends HTML email to each subscriber
  → Email footer has unsubscribe link → Worker DELETE from KV
```

## Components

### 1. Cloudflare Worker (`yomoo-subscribe-worker`)

**Routes:**

| Method | Path                               | Auth                  | Description                             |
| ------ | ---------------------------------- | --------------------- | --------------------------------------- |
| POST   | `/subscribe`                       | None (public)         | Add email to KV                         |
| GET    | `/unsubscribe?email=xxx&token=xxx` | HMAC token            | Remove email from KV, show success page |
| GET    | `/subscribers`                     | `X-API-Secret` header | Return email list (pipeline use only)   |

**KV Schema:**

Key: `sub:{email}`, Value: `{"email": "...", "subscribed_at": "2026-02-20"}`

**Environment Variables:**

- `SUBSCRIBERS` — KV namespace binding
- `API_SECRET` — shared secret for `/subscribers` endpoint
- `GITHUB_TOKEN` — not needed (KV replaces GitHub storage)

**Unsubscribe token:** HMAC-SHA256 of email using API_SECRET, prevents unauthorized unsubscribe of others.

**CORS:** Allow `*.github.io` origins.

### 2. Pipeline Stage 6: Send Email (`main/email.ts`)

- Fetch subscriber list: `GET {workerUrl}/subscribers` with `X-API-Secret` header
- For each subscriber, call Resend API:
  ```
  POST https://api.resend.com/emails
  {
    "from": "YOMOO 每日AI快送 <daily@yomoo.com>",
    "to": "subscriber@example.com",
    "subject": "YOMOO 每日AI快送 — 2026-02-20",
    "html": "<full branded HTML with unsubscribe footer>"
  }
  ```
- Rate limit: small delay between sends to respect Resend free tier
- Report success/failure count in pipeline status

### 3. Email HTML variant (`html-generator.ts`)

Reuse `generateHtmlPage()` but add:

- Unsubscribe footer link: `{workerUrl}/unsubscribe?email={email}&token={hmac}`
- Email-safe CSS (inline styles, no sticky, no JS tabs — report only, no podcast tab)
- Podcast tab not included in email (email clients don't support JS)

New function: `generateEmailHtml(reportMarkdown, audioUrl, date, unsubscribeUrl)`

### 4. Subscribe Page (`subscribe/index.html` on GitHub Pages)

- Deployed automatically by `ensureRepo()` or pipeline
- Same YOMOO brand design (Playfair Display, amber palette, dark mode)
- Single email input + subscribe button
- POST to Cloudflare Worker URL
- Success/error states with animation
- Link back to latest episode

### 5. Preferences Updates

Add to `UserPreferences`:

- `resendApiKey: string` — Resend API key
- `resendFrom: string` — sender address (default: "daily@yomoo.com")
- `workerUrl: string` — Cloudflare Worker URL
- `workerSecret: string` — shared API secret for /subscribers

## File Changes

| File                                            | Change                                                |
| ----------------------------------------------- | ----------------------------------------------------- |
| **New** `main/email.ts`                         | Fetch subscribers from Worker, send via Resend        |
| **New** `cloudflare-worker/worker.js`           | Subscribe/unsubscribe/list API with KV                |
| **New** `cloudflare-worker/wrangler.toml`       | Worker config                                         |
| **Modify** `main/pipeline.ts`                   | Add Stage 6 email sending                             |
| **Modify** `main/preferences.ts`                | Add resendApiKey, resendFrom, workerUrl, workerSecret |
| **Modify** `main/html-generator.ts`             | Add `generateEmailHtml()` for email-safe version      |
| **Modify** `main/github.ts`                     | Deploy subscribe page in `ensureRepo()`               |
| **Modify** `main/ipc-handlers.ts`               | Expose new pipeline stage events                      |
| **Modify** `main/preload.ts`                    | Add email stage listener                              |
| **Modify** `renderer/stores/report-store.ts`    | Update pipeline total to 6                            |
| **Modify** `renderer/components/ReportView.tsx` | Add Resend/Worker settings in Preferences             |

## Security

- Subscriber emails never touch GitHub (stored in Cloudflare KV only)
- `/subscribers` endpoint requires `X-API-Secret` header
- Unsubscribe links use HMAC tokens to prevent abuse
- Resend API key stored locally in Electron preferences only

## Deployment Steps (one-time)

1. Create Cloudflare KV namespace: `wrangler kv namespace create SUBSCRIBERS`
2. Set Worker secrets: `wrangler secret put API_SECRET`
3. Deploy Worker: `wrangler deploy`
4. Configure Preferences in app: Worker URL + secret + Resend API key
5. Pipeline auto-deploys subscribe page to GitHub Pages
