// YOMOO Mailing List - Cloudflare Worker
// Manages subscriber list via KV storage with HMAC-verified unsubscribe links.

// ---------------------------------------------------------------------------
// Pure logic helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Validate that a string looks like an email address.
 * Intentionally minimal: just checks for exactly one "@" with non-empty parts.
 */
function isValidEmail(email) {
  if (typeof email !== "string") return false
  const trimmed = email.trim()
  // Must match: local@domain.tld (domain must have at least one dot)
  return /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(trimmed)
}

/**
 * Normalize an email: trim whitespace and lowercase.
 */
function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

/**
 * Allowed CORS origins: daily.yomoo.net, *.github.io, or localhost dev servers.
 */
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/daily\.yomoo\.net$/,
  /^https:\/\/[\w-]+\.github\.io$/,
  /^http:\/\/localhost:5173$/,
  /^http:\/\/localhost:5174$/,
]

function isAllowedOrigin(origin) {
  if (!origin) return false
  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))
}

/**
 * Build CORS headers for a given request origin.
 * Returns an empty object when the origin is not allowed.
 */
function corsHeaders(origin) {
  if (!isAllowedOrigin(origin)) return {}
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Secret",
  }
}

// ---------------------------------------------------------------------------
// HMAC helpers (Web Crypto API - available in Cloudflare Workers & Node 18+)
// ---------------------------------------------------------------------------

async function hmacSign(message, secret, cryptoImpl) {
  const enc = new TextEncoder()
  const key = await cryptoImpl.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await cryptoImpl.subtle.sign("HMAC", key, enc.encode(message))
  return bufferToHex(sig)
}

async function hmacVerify(message, token, secret, cryptoImpl) {
  const expected = await hmacSign(message, secret, cryptoImpl)
  return timingSafeEqual(expected, token)
}

function bufferToHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.codePointAt(i) ^ b.codePointAt(i)
  }
  return result === 0
}

// ---------------------------------------------------------------------------
// Svix webhook signature verification (used by Resend)
// ---------------------------------------------------------------------------

const UMAMI_WEBSITE_ID = "8864a5e3-4f85-4cb6-9565-d7a9538027df"
const UMAMI_COLLECT_URL = "https://cloud.umami.is/api/send"
const ALLOWED_SENDER = "daily@yomoo.net"

/**
 * Verify Svix webhook signature (Resend uses Svix under the hood).
 * Secret format: "whsec_<base64-key>"
 */
async function verifySvixSignature(body, headers, secret) {
  const msgId = headers.get("svix-id")
  const msgTimestamp = headers.get("svix-timestamp")
  const msgSignature = headers.get("svix-signature")

  if (!msgId || !msgTimestamp || !msgSignature) return false

  // Check timestamp is within 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000)
  const ts = Number.parseInt(msgTimestamp, 10)
  if (Math.abs(now - ts) > 300) return false

  // Decode the secret (strip "whsec_" prefix, base64-decode)
  const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret
  const keyBytes = Uint8Array.from(atob(rawSecret), (c) => c.codePointAt(0))

  // Sign: "{msg_id}.{timestamp}.{body}"
  const toSign = `${msgId}.${msgTimestamp}.${body}`
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(toSign))
  const computed = `v1,${btoa(String.fromCodePoint(...new Uint8Array(sig)))}`

  // msgSignature may contain multiple space-separated signatures
  const signatures = msgSignature.split(" ")
  return signatures.some((s) => s.trim() === computed)
}

/**
 * Map Resend event type to Umami event name.
 */
function resendEventToUmami(type) {
  const map = {
    "email.delivered": "email-delivered",
    "email.opened": "email-opened",
    "email.clicked": "email-clicked",
    "email.bounced": "email-bounced",
    "email.complained": "email-complained",
  }
  return map[type] || null
}

/**
 * Forward a Resend webhook event to Umami as a custom event.
 */
async function sendToUmami(eventName, data) {
  const payload = {
    website: UMAMI_WEBSITE_ID,
    hostname: "daily.yomoo.net",
    url: "/email",
    name: eventName,
    data,
  }

  await fetch(UMAMI_COLLECT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "YOMOO-Worker/1.0" },
    body: JSON.stringify({ payload }),
  })
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleSubscribe(request, env, cors) {
  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" }, cors)
  }

  const { email } = body || {}
  if (!isValidEmail(email)) {
    return jsonResponse(400, { error: "Invalid email address" }, cors)
  }

  const normalized = normalizeEmail(email)
  const value = JSON.stringify({
    email: normalized,
    subscribed_at: new Date().toISOString().slice(0, 10),
  })

  await env.SUBSCRIBERS.put(`sub:${normalized}`, value)

  return jsonResponse(200, { success: true }, cors)
}

async function handleUnsubscribe(request, env) {
  const url = new URL(request.url)
  const email = url.searchParams.get("email")
  const token = url.searchParams.get("token")

  if (!email || !token) {
    return htmlResponse(400, errorPage("Missing email or token parameter."))
  }

  const secret = env.API_SECRET
  if (!secret) {
    return htmlResponse(500, errorPage("Server configuration error."))
  }

  const valid = await hmacVerify(email, token, secret, crypto)
  if (!valid) {
    return htmlResponse(403, errorPage("Invalid or expired unsubscribe link."))
  }

  await env.SUBSCRIBERS.delete(`sub:${email}`)

  return htmlResponse(200, unsubscribeSuccessPage(email))
}

async function handleResendWebhook(request, env) {
  const webhookSecret = env.RESEND_WEBHOOK_SECRET
  if (!webhookSecret) {
    return jsonResponse(500, { error: "Webhook secret not configured" })
  }

  const body = await request.text()

  // Verify Svix signature
  const valid = await verifySvixSignature(body, request.headers, webhookSecret)
  if (!valid) {
    return jsonResponse(401, { error: "Invalid signature" })
  }

  let event
  try {
    event = JSON.parse(body)
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" })
  }

  const eventType = event.type
  const eventData = event.data || {}

  // Filter: only process events from daily@yomoo.net
  const { from } = eventData
  if (!from || !from.includes(ALLOWED_SENDER)) {
    return jsonResponse(200, { skipped: true, reason: "sender not matched" })
  }

  // Map to Umami event
  const umamiEvent = resendEventToUmami(eventType)
  if (!umamiEvent) {
    return jsonResponse(200, { skipped: true, reason: "unmapped event type" })
  }

  // Build tracking data
  const trackingData = {
    type: eventType,
    subject: eventData.subject || "",
    to: eventData.to ? (Array.isArray(eventData.to) ? eventData.to.length : 1) : 0,
  }

  // For click events, include the clicked URL
  if (eventType === "email.clicked" && eventData.click && eventData.click.link) {
    trackingData.link = eventData.click.link
  }

  await sendToUmami(umamiEvent, trackingData)

  return jsonResponse(200, { success: true, event: umamiEvent })
}

async function handleListSubscribers(request, env, cors) {
  const secret = env.API_SECRET
  const provided = request.headers.get("X-API-Secret")

  if (!secret || !provided || provided !== secret) {
    return jsonResponse(401, { error: "Unauthorized" }, cors)
  }

  const subscribers = []
  let cursor = null

  do {
    const result = await env.SUBSCRIBERS.list({
      prefix: "sub:",
      cursor,
    })
    for (const key of result.keys) {
      const value = await env.SUBSCRIBERS.get(key.name)
      if (value) {
        try {
          subscribers.push(JSON.parse(value))
        } catch {
          // skip malformed entries
        }
      }
    }
    cursor = result.list_complete ? null : result.cursor
  } while (cursor)

  return jsonResponse(200, subscribers, cors)
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function jsonResponse(status, data, cors = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...cors,
    },
  })
}

function htmlResponse(status, body) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

function unsubscribeSuccessPage(email) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Unsubscribed - YOMOO</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: #f8f9fa; color: #333;
    }
    .card {
      background: #fff; border-radius: 12px; padding: 48px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08); text-align: center;
      max-width: 480px; width: 90%;
    }
    .logo { font-size: 28px; font-weight: 700; color: #FF8C00; margin-bottom: 24px; }
    h1 { font-size: 20px; margin-bottom: 12px; }
    p { color: #666; line-height: 1.6; }
    .email { font-weight: 600; color: #333; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">YOMOO</div>
    <h1>Successfully Unsubscribed</h1>
    <p><span class="email">${escapeHtml(email)}</span> has been removed from the YOMOO daily report mailing list.</p>
    <p style="margin-top: 16px; font-size: 14px; color: #999;">You will no longer receive daily AI report emails.</p>
  </div>
</body>
</html>`
}

function errorPage(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Error - YOMOO</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: #f8f9fa; color: #333;
    }
    .card {
      background: #fff; border-radius: 12px; padding: 48px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08); text-align: center;
      max-width: 480px; width: 90%;
    }
    .logo { font-size: 28px; font-weight: 700; color: #FF8C00; margin-bottom: 24px; }
    h1 { font-size: 20px; margin-bottom: 12px; color: #c0392b; }
    p { color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">YOMOO</div>
    <h1>Error</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get("Origin")
    const cors = corsHeaders(origin)

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors })
    }

    // Route dispatch
    if (url.pathname === "/subscribe" && request.method === "POST") {
      return handleSubscribe(request, env, cors)
    }

    if (url.pathname === "/unsubscribe" && request.method === "GET") {
      return handleUnsubscribe(request, env)
    }

    if (url.pathname === "/subscribers" && request.method === "GET") {
      return handleListSubscribers(request, env, cors)
    }

    if (url.pathname === "/webhook/resend" && request.method === "POST") {
      return handleResendWebhook(request, env)
    }

    return jsonResponse(404, { error: "Not found" }, cors)
  },
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------
export {
  bufferToHex,
  corsHeaders,
  escapeHtml,
  hmacSign,
  hmacVerify,
  isAllowedOrigin,
  isValidEmail,
  normalizeEmail,
  resendEventToUmami,
  timingSafeEqual,
  verifySvixSignature,
}
