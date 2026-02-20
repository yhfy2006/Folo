import fs from "node:fs"

import { BrowserWindow, dialog, ipcMain } from "electron"

import { generateReport } from "./ai-report"
import type { Entry, Feed } from "./database"
import { execute, queryAll, queryOne, saveDatabase } from "./database"
import { parseOPML } from "./opml-parser"
import type { UserPreferences } from "./preferences"
import { loadPreferences, savePreferences as savePrefs } from "./preferences"
import { refreshAllFeeds } from "./scheduler"

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
    return { success: true }
  })

  ipcMain.handle("get-reports", () => {
    return queryAll<{
      id: string
      title: string
      language: string
      time_range: number
      entry_count: number
      created_at: number
    }>(
      "SELECT id, title, language, time_range, entry_count, created_at FROM reports ORDER BY created_at DESC LIMIT 50",
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
      created_at: number
    }>("SELECT * FROM reports WHERE id = ?", [reportId])
  })

  ipcMain.handle("delete-report", (_event, reportId: string) => {
    execute("DELETE FROM reports WHERE id = ?", [reportId])
    return { success: true }
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
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
