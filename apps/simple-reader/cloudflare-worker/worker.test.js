// Tests for YOMOO Cloudflare Worker pure logic functions.
// Run with: node worker.test.js (requires Node 18+ for Web Crypto API)

import {
  corsHeaders,
  escapeHtml,
  hmacSign,
  hmacVerify,
  isAllowedOrigin,
  isValidEmail,
  normalizeEmail,
  timingSafeEqual,
} from "./worker.js"

let passed = 0
let failed = 0

function assert(condition, message) {
  if (condition) {
    passed++
    console.info(`  PASS: ${message}`)
  } else {
    failed++
    console.error(`  FAIL: ${message}`)
  }
}

function assertEqual(actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    failed++
    console.error(
      `  FAIL: ${message}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`,
    )
  } else {
    passed++
    console.info(`  PASS: ${message}`)
  }
}

// ---------------------------------------------------------------------------
// isValidEmail
// ---------------------------------------------------------------------------
console.info("\n--- isValidEmail ---")

assert(isValidEmail("user@example.com"), "basic email is valid")
assert(isValidEmail("  user@example.com  "), "email with whitespace is valid")
assert(isValidEmail("a@b"), "minimal email is valid")
assert(!isValidEmail(""), "empty string is invalid")
assert(!isValidEmail("no-at-sign"), "missing @ is invalid")
assert(!isValidEmail("@example.com"), "missing local part is invalid")
assert(!isValidEmail("user@"), "missing domain is invalid")
assert(!isValidEmail("a@@b.com"), "double @ is invalid")
assert(!isValidEmail(null), "null is invalid")
assert(!isValidEmail(), "undefined is invalid")
assert(!isValidEmail(42), "number is invalid")

// ---------------------------------------------------------------------------
// normalizeEmail
// ---------------------------------------------------------------------------
console.info("\n--- normalizeEmail ---")

assertEqual(normalizeEmail("  User@Example.COM  "), "user@example.com", "trims and lowercases")
assertEqual(normalizeEmail("test@test.com"), "test@test.com", "already normal")

// ---------------------------------------------------------------------------
// isAllowedOrigin
// ---------------------------------------------------------------------------
console.info("\n--- isAllowedOrigin ---")

assert(isAllowedOrigin("https://myuser.github.io"), "github.io subdomain allowed")
assert(isAllowedOrigin("https://my-user.github.io"), "github.io with hyphen allowed")
assert(isAllowedOrigin("http://localhost:5173"), "localhost:5173 allowed")
assert(isAllowedOrigin("http://localhost:5174"), "localhost:5174 allowed")
assert(!isAllowedOrigin("https://evil.com"), "random domain blocked")
assert(!isAllowedOrigin("https://github.io"), "bare github.io without subdomain blocked")
assert(!isAllowedOrigin("http://localhost:3000"), "wrong port blocked")
assert(!isAllowedOrigin(null), "null blocked")
assert(!isAllowedOrigin(""), "empty string blocked")
assert(!isAllowedOrigin("https://evil.github.io.attacker.com"), "suffix attack blocked")

// ---------------------------------------------------------------------------
// corsHeaders
// ---------------------------------------------------------------------------
console.info("\n--- corsHeaders ---")

const cors = corsHeaders("https://myuser.github.io")
assertEqual(cors["Access-Control-Allow-Origin"], "https://myuser.github.io", "sets origin header")
assert(cors["Access-Control-Allow-Methods"].includes("POST"), "allows POST method")
assert(cors["Access-Control-Allow-Headers"].includes("X-API-Secret"), "allows X-API-Secret header")

const noCors = corsHeaders("https://evil.com")
assertEqual(noCors, {}, "returns empty for disallowed origin")

// ---------------------------------------------------------------------------
// timingSafeEqual
// ---------------------------------------------------------------------------
console.info("\n--- timingSafeEqual ---")

assert(timingSafeEqual("abc", "abc"), "equal strings match")
assert(!timingSafeEqual("abc", "abd"), "different strings don't match")
assert(!timingSafeEqual("abc", "abcd"), "different lengths don't match")
assert(timingSafeEqual("", ""), "empty strings match")

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------
console.info("\n--- escapeHtml ---")

assertEqual(escapeHtml("<script>"), "&lt;script&gt;", "escapes angle brackets")
assertEqual(escapeHtml("a\"b'c&d"), "a&quot;b&#39;c&amp;d", "escapes quotes and ampersand")
assertEqual(escapeHtml("hello"), "hello", "plain text unchanged")

// ---------------------------------------------------------------------------
// HMAC sign/verify (async - uses Web Crypto)
// ---------------------------------------------------------------------------
console.info("\n--- HMAC sign/verify ---")

async function testHmac() {
  const secret = "test-secret-key"
  const message = "user@example.com"

  const token = await hmacSign(message, secret, crypto)
  assert(typeof token === "string", "hmacSign returns a string")
  assert(token.length === 64, "HMAC-SHA256 hex is 64 chars")
  assert(/^[0-9a-f]+$/.test(token), "token is hex-encoded")

  const valid = await hmacVerify(message, token, secret, crypto)
  assert(valid, "hmacVerify returns true for valid token")

  const invalid = await hmacVerify(message, `badtoken${"0".repeat(56)}`, secret, crypto)
  assert(!invalid, "hmacVerify returns false for wrong token")

  const wrongSecret = await hmacVerify(message, token, "wrong-secret", crypto)
  assert(!wrongSecret, "hmacVerify returns false for wrong secret")

  // Deterministic: same input produces same output
  const token2 = await hmacSign(message, secret, crypto)
  assertEqual(token, token2, "hmacSign is deterministic")
}

await testHmac()

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.info(`\n=== Results: ${passed} passed, ${failed} failed ===`)
if (failed > 0) {
  throw new Error(`${failed} test(s) failed`)
}
