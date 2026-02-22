# YOMOO Mailing List Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add email newsletter capability so subscribers receive the daily HTML report via email after each pipeline run.

**Architecture:** Cloudflare Worker handles subscribe/unsubscribe/list endpoints with KV storage. Pipeline Stage 6 fetches subscriber list from Worker, then sends branded email HTML via Resend API. Subscribe page deployed to GitHub Pages.

**Tech Stack:** Cloudflare Workers + KV, Resend API, HMAC-SHA256, Electron IPC

---

### Task 1: Create Cloudflare Worker

**Files:**

- Create: `apps/simple-reader/cloudflare-worker/worker.js`
- Create: `apps/simple-reader/cloudflare-worker/wrangler.toml`

**Step 1: Create wrangler.toml**

```toml
name = "yomoo-subscribe-worker"
main = "worker.js"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "SUBSCRIBERS"
id = "<replace-after-wrangler-kv-create>"
```

**Step 2: Create worker.js with three routes**

```javascript
// POST /subscribe - public, adds email to KV
// GET /unsubscribe?email=xxx&token=xxx - HMAC-verified, removes from KV
// GET /subscribers - X-API-Secret header required, returns email list

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const corsHeaders = getCorsHeaders(request)

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    try {
      if (url.pathname === "/subscribe" && request.method === "POST") {
        return handleSubscribe(request, env, corsHeaders)
      }
      if (url.pathname === "/unsubscribe" && request.method === "GET") {
        return handleUnsubscribe(url, env)
      }
      if (url.pathname === "/subscribers" && request.method === "GET") {
        return handleListSubscribers(request, env)
      }
      return new Response("Not found", { status: 404 })
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
  },
}

async function handleSubscribe(request, env, corsHeaders) {
  const { email } = await request.json()
  if (!email || !email.includes("@")) {
    return new Response(JSON.stringify({ error: "Invalid email" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const normalized = email.trim().toLowerCase()
  await env.SUBSCRIBERS.put(
    `sub:${normalized}`,
    JSON.stringify({
      email: normalized,
      subscribed_at: new Date().toISOString().slice(0, 10),
    }),
  )

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

async function handleUnsubscribe(url, env) {
  const email = url.searchParams.get("email")
  const token = url.searchParams.get("token")
  if (!email || !token) {
    return htmlResponse("Missing parameters", 400)
  }

  const normalized = email.trim().toLowerCase()
  const expected = await hmacToken(normalized, env.API_SECRET)
  if (token !== expected) {
    return htmlResponse("Invalid unsubscribe link", 403)
  }

  await env.SUBSCRIBERS.delete(`sub:${normalized}`)
  return htmlResponse(
    `
    <h2>Unsubscribed</h2>
    <p>${escapeHtml(normalized)} has been removed from YOMOO mailing list.</p>
  `,
    200,
  )
}

async function handleListSubscribers(request, env) {
  const secret = request.headers.get("X-API-Secret")
  if (!secret || secret !== env.API_SECRET) {
    return new Response("Unauthorized", { status: 401 })
  }

  const list = []
  let cursor = undefined
  do {
    const result = await env.SUBSCRIBERS.list({ prefix: "sub:", cursor })
    for (const key of result.keys) {
      const val = await env.SUBSCRIBERS.get(key.name)
      if (val) list.push(JSON.parse(val))
    }
    cursor = result.list_complete ? undefined : result.cursor
  } while (cursor)

  return new Response(JSON.stringify(list), {
    headers: { "Content-Type": "application/json" },
  })
}

async function hmacToken(email, secret) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(email))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || ""
  const allowed =
    origin.endsWith(".github.io") ||
    origin === "http://localhost:5173" ||
    origin === "http://localhost:5174"
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function htmlResponse(body, status) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YOMOO</title><style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#1a1410;color:#f5efe6;text-align:center;}</style></head><body><div>${body}</div></body></html>`,
    {
      status,
      headers: { "Content-Type": "text/html;charset=UTF-8" },
    },
  )
}
```

**Step 3: Commit**

```bash
git add apps/simple-reader/cloudflare-worker/
git commit -m "feat: add Cloudflare Worker for subscriber management"
```

---

### Task 2: Add preferences fields

**Files:**

- Modify: `apps/simple-reader/main/preferences.ts` (lines 6-26)
- Modify: `apps/simple-reader/renderer/components/ReportView.tsx` (lines 843-853, 1064-1085)

**Step 1: Add 4 new fields to UserPreferences interface and defaults**

In `main/preferences.ts`, add after `githubToken: string` (line 14):

```typescript
resendApiKey: string
resendFrom: string
workerUrl: string
workerSecret: string
```

In `DEFAULT_PREFERENCES` (after line 25 `githubToken: ""`):

```typescript
  resendApiKey: "",
  resendFrom: "daily@yomoo.com",
  workerUrl: "",
  workerSecret: "",
```

**Step 2: Add UI fields to PreferencesDialog in ReportView.tsx**

After the GitHub PAT section (after line 1085), before the Actions `<div>`, add a new section:

```tsx
        {/* Divider */}
        <hr className="my-4 border-[hsl(var(--border))]" />

        <h4 className="mb-3 text-xs font-semibold" style={{ color: "#FF6B35" }}>
          Mailing List (Resend + Cloudflare)
        </h4>

        {/* Resend API Key */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            Resend API Key
          </label>
          <input
            type="password"
            value={prefs.resendApiKey || ""}
            onChange={(e) => setPrefs({ ...prefs, resendApiKey: e.target.value })}
            placeholder="re_..."
            className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
          />
          <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
            Get your API key from resend.com/api-keys
          </p>
        </div>

        {/* Sender Address */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            Sender Address
          </label>
          <input
            type="text"
            value={prefs.resendFrom || "daily@yomoo.com"}
            onChange={(e) => setPrefs({ ...prefs, resendFrom: e.target.value })}
            placeholder="daily@yomoo.com"
            className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
          />
        </div>

        {/* Worker URL */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            Cloudflare Worker URL
          </label>
          <input
            type="text"
            value={prefs.workerUrl || ""}
            onChange={(e) => setPrefs({ ...prefs, workerUrl: e.target.value })}
            placeholder="https://yomoo-subscribe-worker.yourname.workers.dev"
            className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
          />
        </div>

        {/* Worker Secret */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            Worker API Secret
          </label>
          <input
            type="password"
            value={prefs.workerSecret || ""}
            onChange={(e) => setPrefs({ ...prefs, workerSecret: e.target.value })}
            placeholder="Shared secret for /subscribers endpoint"
            className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
          />
        </div>
```

Also update the `prefs` state initializer in PreferencesDialog (line 844-853) to include the new fields:

```typescript
const [prefs, setPrefs] = React.useState({
  language: "en",
  interests: [] as string[],
  reportStyle: "detailed" as "concise" | "detailed",
  timeRange: 24,
  minimaxApiKey: "",
  ttsVoiceId: "English_Graceful_Lady",
  ttsModel: "speech-2.8-hd",
  githubToken: "",
  resendApiKey: "",
  resendFrom: "daily@yomoo.com",
  workerUrl: "",
  workerSecret: "",
})
```

**Step 3: Commit**

```bash
git add apps/simple-reader/main/preferences.ts apps/simple-reader/renderer/components/ReportView.tsx
git commit -m "feat: add Resend/Worker preferences fields"
```

---

### Task 3: Create email.ts (Resend integration)

**Files:**

- Create: `apps/simple-reader/main/email.ts`

**Step 1: Create email.ts with subscriber fetch + Resend send**

```typescript
import crypto from "node:crypto"

import { loadPreferences } from "./preferences"

interface Subscriber {
  email: string
  subscribed_at: string
}

export interface EmailResult {
  sent: number
  failed: number
  total: number
}

export async function fetchSubscribers(): Promise<Subscriber[]> {
  const prefs = loadPreferences()
  if (!prefs.workerUrl || !prefs.workerSecret) {
    throw new Error("Worker URL and secret not configured")
  }

  const resp = await fetch(`${prefs.workerUrl.replace(/\/$/, "")}/subscribers`, {
    headers: { "X-API-Secret": prefs.workerSecret },
  })

  if (!resp.ok) {
    throw new Error(`Failed to fetch subscribers: HTTP ${resp.status}`)
  }

  return resp.json() as Promise<Subscriber[]>
}

export function generateUnsubscribeUrl(
  email: string,
  workerUrl: string,
  workerSecret: string,
): string {
  const token = crypto.createHmac("sha256", workerSecret).update(email).digest("hex")
  return `${workerUrl.replace(/\/$/, "")}/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`
}

export async function sendEmails(
  emailHtml: string,
  date: string,
  onStatus: (status: string) => void,
): Promise<EmailResult> {
  const prefs = loadPreferences()

  if (!prefs.resendApiKey) {
    throw new Error("Resend API key not configured")
  }
  if (!prefs.workerUrl || !prefs.workerSecret) {
    throw new Error("Worker URL and secret not configured")
  }

  onStatus("Fetching subscriber list...")
  const subscribers = await fetchSubscribers()

  if (subscribers.length === 0) {
    onStatus("No subscribers found, skipping email")
    return { sent: 0, failed: 0, total: 0 }
  }

  onStatus(`Sending to ${subscribers.length} subscriber(s)...`)
  let sent = 0
  let failed = 0

  for (const sub of subscribers) {
    try {
      const unsubUrl = generateUnsubscribeUrl(sub.email, prefs.workerUrl, prefs.workerSecret)
      const personalizedHtml = emailHtml.replace("{{UNSUBSCRIBE_URL}}", unsubUrl)

      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${prefs.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `YOMOO 每日AI快送 <${prefs.resendFrom || "daily@yomoo.com"}>`,
          to: sub.email,
          subject: `YOMOO 每日AI快送 — ${date}`,
          html: personalizedHtml,
        }),
      })

      if (resp.ok) {
        sent++
        onStatus(`Sent ${sent}/${subscribers.length}`)
      } else {
        const err = await resp.text()
        console.error(`[email] Failed to send to ${sub.email}:`, err)
        failed++
      }

      // Rate limit: 100ms between sends (Resend free tier)
      if (subscribers.indexOf(sub) < subscribers.length - 1) {
        await new Promise((r) => setTimeout(r, 100))
      }
    } catch (err) {
      console.error(`[email] Error sending to ${sub.email}:`, err)
      failed++
    }
  }

  onStatus(`Email complete: ${sent} sent, ${failed} failed`)
  return { sent, failed, total: subscribers.length }
}
```

**Step 2: Commit**

```bash
git add apps/simple-reader/main/email.ts
git commit -m "feat: add email sending via Resend API"
```

---

### Task 4: Add generateEmailHtml to html-generator.ts

**Files:**

- Modify: `apps/simple-reader/main/html-generator.ts` (add new function after `generateHtmlPage`)

**Step 1: Add generateEmailHtml function**

After the `generateHtmlPage` function (before `escapeHtml`), add:

```typescript
/**
 * Generate email-safe HTML for the newsletter.
 * No JS, no sticky, inline-safe CSS, report only (no podcast tab).
 * Contains {{UNSUBSCRIBE_URL}} placeholder replaced per-subscriber.
 */
export function generateEmailHtml(
  reportMarkdown: string,
  audioUrl: string | null,
  date: string,
): string {
  const renderedReport = marked.parse(reportMarkdown, { async: false, breaks: true }) as string

  const audioBlock = audioUrl
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr><td style="padding:12px 16px;background:#fff8ef;border:1px solid rgba(232,114,42,0.25);border-radius:8px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#E8722A;">收听音频版</p>
        <a href="${escapeHtml(audioUrl)}" style="display:inline-block;padding:6px 14px;font-size:12px;font-weight:500;color:#E8722A;border:1px solid rgba(232,114,42,0.25);border-radius:16px;text-decoration:none;">下载 MP3</a>
      </td></tr></table>`
    : ""

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YOMOO 每日AI快送 — ${escapeHtml(date)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    body { margin:0; padding:0; background:#fffbf5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#3d3529; line-height:1.8; -webkit-text-size-adjust:100%; }
    a { color:#E8722A; }
    h1,h2,h3 { color:#1a1410; }
    h1 { font-size:22px; margin:24px 0 12px; }
    h2 { font-size:18px; margin:24px 0 8px; border-bottom:1px solid rgba(26,20,16,0.08); padding-bottom:6px; }
    h3 { font-size:16px; margin:18px 0 6px; }
    p { margin:0 0 12px; font-size:15px; }
    ul,ol { margin:8px 0 16px 20px; font-size:15px; }
    li { margin-bottom:4px; }
    blockquote { margin:16px 0; padding:10px 14px; border-left:3px solid #E8722A; background:rgba(232,114,42,0.06); font-style:italic; }
    code { font-size:13px; padding:2px 6px; background:#f5efe6; border-radius:3px; }
    pre { background:#ffffff; border:1px solid rgba(26,20,16,0.08); border-radius:6px; padding:12px; overflow-x:auto; margin:12px 0; }
    pre code { background:none; padding:0; }
    hr { border:none; height:1px; background:rgba(26,20,16,0.08); margin:24px 0; }
    img { max-width:100%; }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbf5;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;">
        <!-- Header -->
        <tr><td style="padding:0;"><div style="height:3px;background:linear-gradient(90deg,#C4561A,#E8722A,#D4A053);"></div></td></tr>
        <tr><td style="padding:28px 20px 16px;text-align:center;border-bottom:1px solid rgba(26,20,16,0.08);">
          <div style="display:inline-block;width:28px;height:28px;background:linear-gradient(135deg,#E8722A,#D4A053);border-radius:7px;line-height:28px;text-align:center;font-weight:900;font-size:15px;color:white;vertical-align:middle;">Y</div>
          <span style="font-weight:800;font-size:16px;color:#1a1410;vertical-align:middle;margin-left:6px;">YOMOO</span>
          <h1 style="font-size:24px;font-weight:900;color:#1a1410;margin:12px 0 6px;line-height:1.2;">每日AI快送</h1>
          <p style="font-size:12px;color:#8a7e6e;letter-spacing:0.08em;margin:0;">${escapeHtml(date)}</p>
        </td></tr>

        <!-- Audio -->
        <tr><td style="padding:0 20px;">${audioBlock}</td></tr>

        <!-- Report Content -->
        <tr><td style="padding:20px;font-size:15px;line-height:1.8;color:#3d3529;">
          ${renderedReport}
        </td></tr>

        <!-- Unsubscribe Footer -->
        <tr><td style="padding:24px 20px;text-align:center;border-top:1px solid rgba(26,20,16,0.08);">
          <p style="font-size:11px;color:#8a7e6e;margin:0 0 4px;">YOMOO 每日AI快送 &copy; ${new Date().getFullYear()}</p>
          <p style="font-size:10px;color:#b5a898;margin:0;">Powered by YOMOO LLC</p>
          <p style="margin:12px 0 0;"><a href="{{UNSUBSCRIBE_URL}}" style="font-size:11px;color:#b5a898;">Unsubscribe</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
```

**Step 2: Commit**

```bash
git add apps/simple-reader/main/html-generator.ts
git commit -m "feat: add email-safe HTML generator for newsletter"
```

---

### Task 5: Add Stage 6 to pipeline.ts

**Files:**

- Modify: `apps/simple-reader/main/pipeline.ts` (lines 1-3, 16-20, 40, 149-183)

**Step 1: Add email import**

Add to imports at top of `pipeline.ts`:

```typescript
import { sendEmails } from "./email"
import { generateEmailHtml } from "./html-generator"
```

Update the existing import from `./html-generator`:

```typescript
import { generateHtmlPage, generateEmailHtml } from "./html-generator"
```

**Step 2: Add emailResult to PipelineResult**

```typescript
export interface PipelineResult {
  pageUrl: string
  audioUrl: string
  date: string
  emailSent?: number
  emailFailed?: number
}
```

**Step 3: Change total from 5 to 6**

Line 40: `const total = 6`

**Step 4: Add Stage 6 after publish stage (after line 177)**

After the publish stage try/catch block and before `const pageUrl = ...`:

```typescript
// Stage 6: Send email newsletter
callbacks.onStage("email")
callbacks.onProgress(6, total)
callbacks.onStatus("Sending email newsletter...")

let emailSent = 0
let emailFailed = 0

if (prefs.resendApiKey && prefs.workerUrl && prefs.workerSecret) {
  try {
    const emailHtml = generateEmailHtml(reportContent, audioUrl, date)
    const result = await sendEmails(emailHtml, date, (status) => {
      callbacks.onStatus(status)
    })
    emailSent = result.sent
    emailFailed = result.failed
  } catch (err) {
    // Email failure is non-fatal — log and continue
    callbacks.onStatus(`Email sending failed: ${err} (continuing...)`)
    console.error("[pipeline] Email stage error:", err)
  }
} else {
  callbacks.onStatus("Email not configured, skipping newsletter")
}
```

Update the final callbacks:

```typescript
const pageUrl = getGitHubPagesUrl(owner, date)

callbacks.onProgress(total, total)
callbacks.onDone({ pageUrl, audioUrl, date, emailSent, emailFailed })
```

**Step 5: Commit**

```bash
git add apps/simple-reader/main/pipeline.ts
git commit -m "feat: add Stage 6 email newsletter to pipeline"
```

---

### Task 6: Update preload.ts and report-store.ts for 6 stages

**Files:**

- Modify: `apps/simple-reader/renderer/stores/report-store.ts` (line 82)

**Step 1: Update pipelineTotal default**

In `report-store.ts`, line 82: change `pipelineTotal: 5` to `pipelineTotal: 6`

**Step 2: Update PipelineView stages array in ReportView.tsx**

In `ReportView.tsx`, line 525-532, add email stage:

```typescript
const stages = [
  { key: "verify", label: "Verify" },
  { key: "report", label: "Report" },
  { key: "podcast", label: "Podcast" },
  { key: "audio", label: "Audio" },
  { key: "upload", label: "Upload" },
  { key: "publish", label: "Publish" },
  { key: "email", label: "Email" },
]
```

**Step 3: Optionally show email result in success card**

In the success result block in `PipelineView` (around line 644), add after "Episode published successfully":

```tsx
{
  result.emailSent !== undefined && result.emailSent > 0 && (
    <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
      Newsletter sent to {result.emailSent} subscriber(s)
      {result.emailFailed ? `, ${result.emailFailed} failed` : ""}
    </p>
  )
}
```

Update the `result` type in PipelineView props to include optional email fields:

```typescript
  result: { pageUrl: string; audioUrl: string; date: string; emailSent?: number; emailFailed?: number } | null
```

Also update `pipelineResult` type in report-store.ts (line 37):

```typescript
  pipelineResult: { pageUrl: string; audioUrl: string; date: string; emailSent?: number; emailFailed?: number } | null
```

And update `onPipelineDone` type in report-store.ts (line 245) and preload.ts (line 108) similarly.

**Step 4: Commit**

```bash
git add apps/simple-reader/renderer/stores/report-store.ts apps/simple-reader/renderer/components/ReportView.tsx apps/simple-reader/main/preload.ts
git commit -m "feat: update UI for 6-stage pipeline with email"
```

---

### Task 7: Deploy subscribe page via GitHub Pages

**Files:**

- Modify: `apps/simple-reader/main/github.ts` (add to `ensureRepo`)

**Step 1: Add subscribe page HTML constant**

Add at the bottom of `github.ts`, before the `PAGES_WORKFLOW` constant:

```typescript
function generateSubscribePageHtml(workerUrl: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="theme-color" content="#1a1410">
  <title>Subscribe — YOMOO 每日AI快送</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Noto+Sans+SC:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --y-amber: #E8722A;
      --bg: #1a1410;
      --bg-card: #231e18;
      --text-primary: #f5efe6;
      --text-body: #d4cbbf;
      --text-muted: #5c5347;
      --border: rgba(245,239,230,0.06);
      --serif: 'Playfair Display', Georgia, serif;
      --sans: 'Noto Sans SC', -apple-system, sans-serif;
    }
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: var(--sans);
      background: var(--bg);
      color: var(--text-body);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1.25rem;
    }
    .card {
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    .logo {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
    }
    .logo-icon {
      width: 36px; height: 36px;
      background: linear-gradient(135deg, #E8722A, #D4A053);
      border-radius: 9px;
      display: flex; align-items: center; justify-content: center;
      font-family: var(--serif);
      font-weight: 900;
      font-size: 20px;
      color: white;
    }
    .logo-name {
      font-family: var(--serif);
      font-size: 1.3rem;
      font-weight: 800;
      color: var(--text-primary);
    }
    h1 {
      font-family: var(--serif);
      font-size: 1.8rem;
      font-weight: 900;
      color: var(--text-primary);
      margin-bottom: 0.5rem;
    }
    .subtitle {
      font-size: 0.9rem;
      color: var(--text-muted);
      margin-bottom: 2rem;
    }
    .form-group {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    input[type="email"] {
      flex: 1;
      padding: 0.75rem 1rem;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text-primary);
      font-size: 0.9rem;
      outline: none;
    }
    input[type="email"]:focus {
      border-color: rgba(232,114,42,0.4);
    }
    button {
      padding: 0.75rem 1.5rem;
      background: linear-gradient(135deg, #E8722A, #D4A053);
      color: white;
      border: none;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .message {
      font-size: 0.85rem;
      margin-top: 0.5rem;
      min-height: 1.5em;
    }
    .message.success { color: #22c55e; }
    .message.error { color: #ef4444; }
    .footer {
      margin-top: 3rem;
      font-size: 0.7rem;
      color: var(--text-muted);
    }
    .footer a { color: var(--text-muted); text-decoration: none; }
    .footer a:hover { color: var(--y-amber); }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-icon">Y</div>
      <span class="logo-name">YOMOO</span>
    </div>
    <h1>每日AI快送</h1>
    <p class="subtitle">Subscribe to receive the daily AI briefing in your inbox</p>
    <div class="form-group">
      <input type="email" id="email" placeholder="your@email.com" required>
      <button id="btn" onclick="subscribe()">Subscribe</button>
    </div>
    <p class="message" id="msg"></p>
    <div class="footer">
      <a href="index.html">Browse episodes</a> &middot; Powered by YOMOO LLC
    </div>
  </div>
  <script>
    async function subscribe() {
      const email = document.getElementById('email').value.trim();
      const msg = document.getElementById('msg');
      const btn = document.getElementById('btn');
      if (!email || !email.includes('@')) {
        msg.className = 'message error';
        msg.textContent = 'Please enter a valid email';
        return;
      }
      btn.disabled = true;
      btn.textContent = '...';
      msg.textContent = '';
      try {
        const resp = await fetch('${workerUrl.replace(/\\/'/g, "\\\\'")}/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await resp.json();
        if (data.success) {
          msg.className = 'message success';
          msg.textContent = 'Subscribed! Check your inbox tomorrow.';
          document.getElementById('email').value = '';
        } else {
          msg.className = 'message error';
          msg.textContent = data.error || 'Something went wrong';
        }
      } catch (e) {
        msg.className = 'message error';
        msg.textContent = 'Network error, please try again';
      }
      btn.disabled = false;
      btn.textContent = 'Subscribe';
    }
    document.getElementById('email').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') subscribe();
    });
  </script>
</body>
</html>`
}
```

**Step 2: Add deploySubscribePage function**

```typescript
export async function deploySubscribePage(
  token: string,
  owner: string,
  workerUrl: string,
): Promise<void> {
  if (!workerUrl) return

  const html = generateSubscribePageHtml(workerUrl)
  const base64 = Buffer.from(html).toString("base64")

  await commitFile(
    token,
    owner,
    "yomoo-daily",
    "subscribe/index.html",
    base64,
    "feat: add/update subscribe page",
  )
  console.info("[github] Subscribe page deployed")
}
```

**Step 3: Call deploySubscribePage in ensureRepo**

In `ensureRepo`, after the Pages workflow commit (around line 111), add:

```typescript
// Deploy subscribe page if worker URL is configured
const { loadPreferences: loadPrefs } = await import("./preferences")
const prefs = loadPrefs()
if (prefs.workerUrl) {
  try {
    await deploySubscribePage(token, owner, prefs.workerUrl)
  } catch (err) {
    console.warn("[github] Failed to deploy subscribe page:", err)
  }
}
```

**Step 4: Commit**

```bash
git add apps/simple-reader/main/github.ts
git commit -m "feat: deploy subscribe page to GitHub Pages"
```

---

### Task 8: Verify and test

**Step 1: Run the dev server**

```bash
cd apps/simple-reader && pnpm run dev
```

**Step 2: Verify TypeScript compiles without errors**

Check the Electron-Vite build output for any TS errors. All new imports should resolve.

**Step 3: Manual test checklist**

- [ ] Open Preferences, verify 4 new fields appear (Resend API Key, Sender Address, Worker URL, Worker Secret)
- [ ] Pipeline stage indicator shows 7 dots (Verify, Report, Podcast, Audio, Upload, Publish, Email)
- [ ] Pipeline runs; Stage 6 skips gracefully when email not configured ("Email not configured, skipping newsletter")
- [ ] With valid Cloudflare Worker + Resend config, Stage 6 sends emails

**Step 4: Deploy Cloudflare Worker (one-time manual)**

```bash
cd apps/simple-reader/cloudflare-worker
wrangler kv namespace create SUBSCRIBERS
# Copy the KV namespace ID into wrangler.toml
wrangler secret put API_SECRET
wrangler deploy
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: YOMOO mailing list system complete"
```
