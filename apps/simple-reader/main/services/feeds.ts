import type { Feed } from "../database"
import { execute, queryAll, queryOne, saveDatabase } from "../database"
import { loadChannelById, saveChannelConfig } from "../pipeline/channel-loader"

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/**
 * Ensure the channel has a feed_group. If `channel.groupId` is empty,
 * create one named after the channel and persist the id back into channel.json.
 * Returns the resolved groupId.
 */
function ensureChannelGroup(channelId: string): string {
  const channel = loadChannelById(channelId)
  if (!channel) throw new Error(`Channel not found: ${channelId}`)

  if (channel.groupId) {
    const existing = queryOne<{ id: string }>("SELECT id FROM feed_groups WHERE id = ?", [
      channel.groupId,
    ])
    if (existing) return channel.groupId
  }

  const groupId = generateId()
  execute(`INSERT INTO feed_groups (id, name, created_at) VALUES (?, ?, ?)`, [
    groupId,
    channel.name,
    Date.now(),
  ])
  channel.groupId = groupId
  saveChannelConfig(channel)
  saveDatabase()
  return groupId
}

export function listFeeds(channelId?: string): Feed[] {
  if (!channelId) {
    return queryAll<Feed>("SELECT * FROM feeds ORDER BY category, title")
  }
  const channel = loadChannelById(channelId)
  if (!channel || !channel.groupId) return []
  return queryAll<Feed>(
    `SELECT f.* FROM feeds f
     INNER JOIN feed_group_feeds gf ON f.id = gf.feed_id
     WHERE gf.group_id = ?
     ORDER BY f.category, f.title`,
    [channel.groupId],
  )
}

export interface AddFeedResult {
  feedId: string
  groupId: string | null
  alreadyExisted: boolean
}

export function addFeed(
  url: string,
  options?: { channelId?: string; title?: string },
): AddFeedResult {
  const existing = queryOne<{ id: string }>("SELECT id FROM feeds WHERE url = ?", [url])
  let feedId: string
  let alreadyExisted = false

  if (existing) {
    feedId = existing.id
    alreadyExisted = true
  } else {
    feedId = generateId()
    execute("INSERT INTO feeds (id, title, url) VALUES (?, ?, ?)", [
      feedId,
      options?.title || url,
      url,
    ])
  }

  let groupId: string | null = null
  if (options?.channelId) {
    groupId = ensureChannelGroup(options.channelId)
    execute(`INSERT OR IGNORE INTO feed_group_feeds (group_id, feed_id) VALUES (?, ?)`, [
      groupId,
      feedId,
    ])
  }

  saveDatabase()
  return { feedId, groupId, alreadyExisted }
}

export function removeFeed(feedId: string): { removed: boolean } {
  const existing = queryOne<{ id: string }>("SELECT id FROM feeds WHERE id = ?", [feedId])
  if (!existing) return { removed: false }
  execute("DELETE FROM entries WHERE feed_id = ?", [feedId])
  execute("DELETE FROM feed_group_feeds WHERE feed_id = ?", [feedId])
  execute("DELETE FROM feeds WHERE id = ?", [feedId])
  saveDatabase()
  return { removed: true }
}

export function cleanupDeadYouTubeRss(): { removed: number; urls: string[] } {
  const rows = queryAll<{ id: string; url: string }>(
    "SELECT id, url FROM feeds WHERE url LIKE '%youtube.com/feeds/videos.xml%'",
  )
  for (const { id } of rows) {
    execute("DELETE FROM entries WHERE feed_id = ?", [id])
    execute("DELETE FROM feed_group_feeds WHERE feed_id = ?", [id])
    execute("DELETE FROM feeds WHERE id = ?", [id])
  }
  saveDatabase()
  return { removed: rows.length, urls: rows.map((r) => r.url) }
}
