import { BrowserWindow } from "electron"

import type { Feed } from "./database"
import { execute, queryAll, saveDatabase } from "./database"
import { fetchFeed } from "./rss-fetcher"

const FETCH_INTERVAL = 30 * 60 * 1000 // 30 minutes
let intervalId: ReturnType<typeof setInterval> | null = null

export function startScheduler() {
  // Fetch immediately on start
  refreshAllFeeds()

  // Then every 30 minutes
  intervalId = setInterval(refreshAllFeeds, FETCH_INTERVAL)
}

export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

export async function refreshAllFeeds() {
  const feeds = queryAll<Feed>("SELECT * FROM feeds")

  console.info(`[scheduler] Refreshing ${feeds.length} feeds...`)

  const results = await Promise.allSettled(feeds.map((feed) => refreshFeed(feed)))

  let successCount = 0
  let errorCount = 0
  for (const r of results) {
    if (r.status === "fulfilled") successCount++
    else errorCount++
  }

  console.info(`[scheduler] Done: ${successCount} success, ${errorCount} errors`)

  // Notify renderer
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send("feeds-updated")
  }
}

async function refreshFeed(feed: Feed) {
  try {
    const result = await fetchFeed(feed.url, feed.etag, feed.last_modified)
    if (!result) {
      // 304 Not Modified
      return
    }

    // Update feed metadata
    const updates: string[] = ["last_fetched_at = ?", "error_at = NULL", "error_message = NULL"]
    const params: any[] = [new Date().toISOString()]

    if (result.feedTitle) {
      updates.push("title = ?")
      params.push(result.feedTitle)
    }
    if (result.feedDescription) {
      updates.push("description = ?")
      params.push(result.feedDescription)
    }
    if (result.feedImage) {
      updates.push("image = ?")
      params.push(result.feedImage)
    }
    if (result.siteUrl) {
      updates.push("site_url = ?")
      params.push(result.siteUrl)
    }
    if (result.etag !== undefined) {
      updates.push("etag = ?")
      params.push(result.etag)
    }
    if (result.lastModified !== undefined) {
      updates.push("last_modified = ?")
      params.push(result.lastModified)
    }

    params.push(feed.id)
    execute(`UPDATE feeds SET ${updates.join(", ")} WHERE id = ?`, params)

    // Upsert entries
    for (const entry of result.entries) {
      const entryId = `${feed.id}:${entry.guid}`
      execute(
        `INSERT OR IGNORE INTO entries (id, feed_id, guid, title, url, content, description, author, published_at, inserted_at, read)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          entryId,
          feed.id,
          entry.guid,
          entry.title,
          entry.url,
          entry.content,
          entry.description,
          entry.author,
          entry.publishedAt ? entry.publishedAt.getTime() : null,
          Date.now(),
        ],
      )
    }

    saveDatabase()
  } catch (error: any) {
    console.error(`[scheduler] Error fetching ${feed.url}:`, error.message)
    execute("UPDATE feeds SET error_at = ?, error_message = ? WHERE id = ?", [
      new Date().toISOString(),
      error.message,
      feed.id,
    ])
  }
}
