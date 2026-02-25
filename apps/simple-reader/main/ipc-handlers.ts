import fs from "node:fs"

import { BrowserWindow, dialog, ipcMain } from "electron"

import { generatePodcastScript, generateReport } from "./ai-report"
import type { Entry, Feed } from "./database"
import { execute, queryAll, queryOne, saveDatabase } from "./database"
import { parseOPML } from "./opml-parser"
import { getSchedulerStatus, startPipelineScheduler } from "./pipeline-scheduler"
import type { UserPreferences } from "./preferences"
import { loadPreferences, savePreferences as savePrefs } from "./preferences"
import { refreshAllFeeds } from "./scheduler"
import { generateAudio } from "./tts"

export function registerIpcHandlers() {
  ipcMain.handle("import-opml", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "OPML Files", extensions: ["opml", "xml"] }],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: "Cancelled" }
    }

    const filePath = result.filePaths[0]!
    const content = fs.readFileSync(filePath, "utf-8")
    const feeds = parseOPML(content)

    let importedCount = 0
    for (const feed of feeds) {
      const id = generateId()
      try {
        execute(
          "INSERT OR IGNORE INTO feeds (id, title, url, site_url, category) VALUES (?, ?, ?, ?, ?)",
          [id, feed.title, feed.xmlUrl, feed.htmlUrl || null, feed.category || null],
        )
        importedCount++
      } catch {
        // Skip duplicates
      }
    }

    saveDatabase()

    // Trigger initial fetch
    refreshAllFeeds()

    return { success: true, count: importedCount }
  })

  ipcMain.handle("get-feeds", () => {
    return queryAll<Feed>("SELECT * FROM feeds ORDER BY category, title")
  })

  ipcMain.handle("get-entries", (_event, feedId?: string) => {
    if (feedId) {
      return queryAll<Entry>(
        "SELECT * FROM entries WHERE feed_id = ? ORDER BY published_at DESC LIMIT 200",
        [feedId],
      )
    }
    return queryAll<Entry>("SELECT * FROM entries ORDER BY published_at DESC LIMIT 200")
  })

  ipcMain.handle("get-entry", (_event, entryId: string) => {
    return queryOne<Entry>("SELECT * FROM entries WHERE id = ?", [entryId])
  })

  ipcMain.handle("mark-read", (_event, entryId: string) => {
    execute("UPDATE entries SET read = 1 WHERE id = ?", [entryId])
    return { success: true }
  })

  ipcMain.handle("refresh-feeds", async () => {
    await refreshAllFeeds()
    return { success: true }
  })

  ipcMain.handle("delete-feed", (_event, feedId: string) => {
    execute("DELETE FROM entries WHERE feed_id = ?", [feedId])
    execute("DELETE FROM feeds WHERE id = ?", [feedId])
    return { success: true }
  })

  ipcMain.handle("add-feed", (_event, url: string, title?: string) => {
    const id = generateId()
    execute("INSERT OR IGNORE INTO feeds (id, title, url) VALUES (?, ?, ?)", [
      id,
      title || url,
      url,
    ])
    saveDatabase()
    refreshAllFeeds()
    return { success: true, id }
  })

  ipcMain.handle("get-unread-counts", () => {
    const rows = queryAll<{ feed_id: string; count: number }>(
      "SELECT feed_id, COUNT(*) as count FROM entries WHERE read = 0 GROUP BY feed_id",
    )
    const counts: Record<string, number> = {}
    for (const row of rows) {
      counts[row.feed_id] = row.count
    }
    return counts
  })

  // --- AI Report ---

  ipcMain.handle("generate-report", async (event) => {
    console.info("[ipc] generate-report called")
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) {
      console.error("[ipc] No window found")
      return { success: false, error: "No window found" }
    }

    try {
      await generateReport(
        (chunk) => win.webContents.send("report-chunk", chunk),
        (status) => win.webContents.send("report-status", status),
        () => win.webContents.send("report-done"),
        (error) => win.webContents.send("report-error", error),
      )
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle("get-preferences", () => {
    return loadPreferences()
  })

  ipcMain.handle("save-preferences", (_event, prefs: UserPreferences) => {
    savePrefs(prefs)
    // Restart pipeline scheduler in case schedule changed
    startPipelineScheduler()
    return { success: true }
  })

  ipcMain.handle("get-scheduler-status", () => {
    return getSchedulerStatus()
  })

  ipcMain.handle("get-reports", () => {
    return queryAll<{
      id: string
      title: string
      language: string
      time_range: number
      entry_count: number
      type: string
      created_at: number
    }>(
      "SELECT id, title, language, time_range, entry_count, type, created_at FROM reports ORDER BY created_at DESC LIMIT 50",
    )
  })

  ipcMain.handle("get-report", (_event, reportId: string) => {
    return queryOne<{
      id: string
      title: string
      content: string
      language: string
      time_range: number
      entry_count: number
      type: string
      created_at: number
    }>("SELECT * FROM reports WHERE id = ?", [reportId])
  })

  ipcMain.handle("delete-report", (_event, reportId: string) => {
    execute("DELETE FROM reports WHERE id = ?", [reportId])
    return { success: true }
  })

  ipcMain.handle("generate-podcast-script", async (event, reportContent: string) => {
    console.info("[ipc] generate-podcast-script called")
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) {
      console.error("[ipc] No window found")
      return { success: false, error: "No window found" }
    }

    try {
      await generatePodcastScript(
        reportContent,
        (chunk) => win.webContents.send("podcast-chunk", chunk),
        (status) => win.webContents.send("podcast-status", status),
        () => win.webContents.send("podcast-done"),
        (error) => win.webContents.send("podcast-error", error),
      )
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle("generate-audio", async (event, text: string) => {
    console.info("[ipc] generate-audio called, text length:", text.length)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: "No window found" }

    try {
      await generateAudio(text, {
        onStatus: (status) => win.webContents.send("audio-status", status),
        onDone: (filePath) => win.webContents.send("audio-done", filePath),
        onError: (error) => win.webContents.send("audio-error", error),
      })
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle("export-audio", async (_event, sourcePath: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: `podcast-${new Date().toISOString().slice(0, 10)}.mp3`,
      filters: [{ name: "MP3 Audio", extensions: ["mp3"] }],
    })
    if (result.canceled || !result.filePath) return { success: false }
    fs.copyFileSync(sourcePath, result.filePath)
    return { success: true }
  })

  ipcMain.handle("get-audio-data", (_event, filePath: string) => {
    try {
      const data = fs.readFileSync(filePath)
      return `data:audio/mp3;base64,${data.toString("base64")}`
    } catch {
      return null
    }
  })

  ipcMain.handle("export-podcast-script", async (_event, content: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: `podcast-script-${new Date().toISOString().slice(0, 10)}.txt`,
      filters: [{ name: "Text", extensions: ["txt"] }],
    })
    if (result.canceled || !result.filePath) return { success: false }
    fs.writeFileSync(result.filePath, content, "utf-8")
    return { success: true }
  })

  // --- YOMOO Pipeline ---
  ipcMain.handle("run-yomoo-pipeline", async (event) => {
    console.info("[ipc] run-yomoo-pipeline called")
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: "No window found" }

    try {
      // Dynamic import to avoid breaking other handlers if pipeline module has issues
      const { runPipeline } = await import("./pipeline")
      console.info("[ipc] pipeline module loaded successfully")

      await runPipeline({
        onStage: (stage) => {
          console.info("[pipeline] stage:", stage)
          win.webContents.send("pipeline-stage", stage)
        },
        onStatus: (status) => {
          console.info("[pipeline] status:", status)
          win.webContents.send("pipeline-status", status)
        },
        onProgress: (step, total) => {
          console.info("[pipeline] progress:", step, "/", total)
          win.webContents.send("pipeline-progress", step, total)
        },
        onDone: (result) => {
          console.info("[pipeline] done:", result)
          win.webContents.send("pipeline-done", result)
        },
        onError: (stage, error) => {
          console.error("[pipeline] error at", stage, ":", error)
          win.webContents.send("pipeline-error", stage, error)
        },
      })
      return { success: true }
    } catch (err) {
      console.error("[ipc] run-yomoo-pipeline error:", err)
      // Send error via event so UI gets notified even if invoke fails
      win.webContents.send("pipeline-error", "init", String(err))
      return { success: false, error: String(err) }
    }
  })

  // --- YOMOO Video-Only Pipeline ---
  ipcMain.handle("run-yomoo-video-only", async (event) => {
    console.info("[ipc] run-yomoo-video-only called")
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: "No window found" }

    try {
      const { runVideoOnly } = await import("./pipeline")
      console.info("[ipc] pipeline (video-only) module loaded successfully")

      await runVideoOnly({
        onStage: (stage) => {
          console.info("[pipeline-video] stage:", stage)
          win.webContents.send("pipeline-stage", stage)
        },
        onStatus: (status) => {
          console.info("[pipeline-video] status:", status)
          win.webContents.send("pipeline-status", status)
        },
        onProgress: (step, total) => {
          console.info("[pipeline-video] progress:", step, "/", total)
          win.webContents.send("pipeline-progress", step, total)
        },
        onDone: (result) => {
          console.info("[pipeline-video] done:", result)
          win.webContents.send("pipeline-done", result)
        },
        onError: (stage, error) => {
          console.error("[pipeline-video] error at", stage, ":", error)
          win.webContents.send("pipeline-error", stage, error)
        },
      })
      return { success: true }
    } catch (err) {
      console.error("[ipc] run-yomoo-video-only error:", err)
      win.webContents.send("pipeline-error", "init", String(err))
      return { success: false, error: String(err) }
    }
  })

  // --- Subscriber Management ---
  ipcMain.handle("list-subscribers", async () => {
    const prefs = loadPreferences()
    if (!prefs.workerUrl || !prefs.workerSecret) {
      return { success: false, error: "Worker URL and secret not configured" }
    }
    try {
      const resp = await fetch(`${prefs.workerUrl.replace(/\/$/, "")}/subscribers`, {
        headers: { "X-API-Secret": prefs.workerSecret },
      })
      if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` }
      const data = await resp.json()
      return { success: true, subscribers: data }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle("add-subscriber", async (_event, email: string) => {
    const prefs = loadPreferences()
    if (!prefs.workerUrl) return { success: false, error: "Worker URL not configured" }
    try {
      const resp = await fetch(`${prefs.workerUrl.replace(/\/$/, "")}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = await resp.json()
      return data
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle("remove-subscriber", async (_event, email: string) => {
    const prefs = loadPreferences()
    if (!prefs.workerUrl || !prefs.workerSecret) {
      return { success: false, error: "Worker URL and secret not configured" }
    }
    try {
      const crypto = await import("node:crypto")
      const token = crypto.createHmac("sha256", prefs.workerSecret).update(email).digest("hex")
      const url = `${prefs.workerUrl.replace(/\/$/, "")}/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`
      const resp = await fetch(url)
      return { success: resp.ok }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle("export-report", async (_event, content: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: `daily-report-${new Date().toISOString().slice(0, 10)}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    })
    if (result.canceled || !result.filePath) return { success: false }
    fs.writeFileSync(result.filePath, content, "utf-8")
    return { success: true }
  })

  // --- YouTube ---

  ipcMain.handle("youtube-get-auth-url", async () => {
    const prefs = loadPreferences()
    if (!prefs.youtubeClientId) {
      return { success: false, error: "YouTube Client ID not configured" }
    }
    const { getAuthUrl } = await import("./youtube")
    const url = getAuthUrl(prefs.youtubeClientId, "urn:ietf:wg:oauth:2.0:oob")
    return { success: true, url }
  })

  ipcMain.handle("youtube-exchange-code", async (_event, code: string) => {
    const prefs = loadPreferences()
    if (!prefs.youtubeClientId || !prefs.youtubeClientSecret) {
      return { success: false, error: "YouTube Client ID/Secret not configured" }
    }
    try {
      const { exchangeCode } = await import("./youtube")
      const tokens = await exchangeCode(
        code,
        prefs.youtubeClientId,
        prefs.youtubeClientSecret,
        "urn:ietf:wg:oauth:2.0:oob",
      )
      // Save refresh token to preferences
      prefs.youtubeRefreshToken = tokens.refreshToken
      savePrefs(prefs)
      console.info("[youtube] OAuth tokens exchanged and saved")
      return { success: true }
    } catch (err) {
      console.error("[youtube] Exchange code failed:", err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle("youtube-check-connection", async () => {
    const prefs = loadPreferences()
    if (!prefs.youtubeRefreshToken || !prefs.youtubeClientId || !prefs.youtubeClientSecret) {
      return { success: false, connected: false, error: "YouTube not configured" }
    }
    try {
      const { refreshAccessToken } = await import("./youtube")
      await refreshAccessToken(
        prefs.youtubeRefreshToken,
        prefs.youtubeClientId,
        prefs.youtubeClientSecret,
      )
      return { success: true, connected: true }
    } catch (err) {
      console.error("[youtube] Connection check failed:", err)
      return { success: false, connected: false, error: String(err) }
    }
  })
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
