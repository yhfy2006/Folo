import { exec } from "node:child_process"
import http from "node:http"

import { defineCommand } from "citty"

import { loadPreferences, savePreferences } from "../../main/preferences"
import { exchangeCode, getAuthUrl, refreshAccessToken } from "../../main/youtube"
import { fail, printJson } from "../lib/output"
import { initRuntime } from "../lib/runtime"

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`
  exec(cmd, (err) => {
    if (err) console.warn("[auth] could not auto-open browser, visit the URL manually")
  })
}

async function waitForCode(redirectUri: string, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsed = new URL(req.url ?? "/", `http://localhost:${port}`)
      if (parsed.pathname !== "/callback") {
        res.writeHead(404).end("not found")
        return
      }
      const code = parsed.searchParams.get("code")
      const error = parsed.searchParams.get("error")
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
        `<!doctype html><meta charset=utf-8><title>simple-reader auth</title>
<body style="font-family:system-ui;padding:40px;max-width:480px;margin:auto">
<h2>${code ? "You can close this tab" : "Auth failed"}</h2>
<p>${code ? "simple-reader received the OAuth code." : String(error ?? "no code returned")}</p>
</body>`,
      )
      server.close()
      if (code) resolve(code)
      else reject(new Error(error ?? "no code"))
    })
    server.listen(port, "127.0.0.1")
    server.on("error", reject)
  })
}

const youtubeCmd = defineCommand({
  meta: { name: "youtube", description: "Run YouTube OAuth flow" },
  args: {
    port: { type: "string", description: "Local callback port", default: "7777" },
    json: { type: "boolean", description: "Emit JSON" },
  },
  async run({ args }) {
    await initRuntime()
    const prefs = loadPreferences()
    if (!prefs.youtubeClientId || !prefs.youtubeClientSecret) {
      fail("youtubeClientId / youtubeClientSecret not set. Run: sr prefs set youtubeClientId <id>")
    }
    const port = Number(args.port)
    if (!Number.isFinite(port) || port <= 0) fail("invalid --port")

    const redirectUri = `http://localhost:${port}/callback`
    const authUrl = getAuthUrl(prefs.youtubeClientId, redirectUri)

    console.info("[auth] opening browser…")
    console.info(`[auth] if it doesn't open, visit:\n  ${authUrl}`)

    const serverP = waitForCode(redirectUri, port)
    openBrowser(authUrl)

    try {
      const code = await serverP
      const tokens = await exchangeCode(
        code,
        prefs.youtubeClientId,
        prefs.youtubeClientSecret,
        redirectUri,
      )
      prefs.youtubeRefreshToken = tokens.refreshToken
      savePreferences(prefs)
      if (args.json) {
        printJson({ success: true })
        return
      }
      console.info("[auth] stored refresh token")
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err))
    }
  },
})

const youtubeStatusCmd = defineCommand({
  meta: { name: "youtube:status", description: "Check that stored YouTube tokens still work" },
  args: {
    json: { type: "boolean", description: "Emit JSON" },
  },
  async run({ args }) {
    await initRuntime()
    const prefs = loadPreferences()
    const configured = Boolean(
      prefs.youtubeRefreshToken && prefs.youtubeClientId && prefs.youtubeClientSecret,
    )
    if (!configured) {
      const payload = { connected: false, reason: "not configured" }
      if (args.json) printJson(payload)
      else console.info("[auth] YouTube not configured")
      return
    }
    try {
      await refreshAccessToken(
        prefs.youtubeRefreshToken,
        prefs.youtubeClientId,
        prefs.youtubeClientSecret,
      )
      if (args.json) {
        printJson({ connected: true })
        return
      }
      console.info("[auth] YouTube connected ✓")
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (args.json) {
        printJson({ connected: false, reason: message })
        return
      }
      fail(`YouTube auth failed: ${message}`)
    }
  },
})

export const authCommand = defineCommand({
  meta: { name: "auth", description: "Authenticate external services" },
  subCommands: {
    youtube: youtubeCmd,
    "youtube:status": youtubeStatusCmd,
  },
})
