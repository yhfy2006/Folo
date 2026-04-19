import fs from "node:fs"

import path from "pathe"

import { getChannelsDir } from "./channel-loader"

type DedupRecord = Record<string, string>

function getDedupPath(channelId: string): string {
  return path.join(getChannelsDir(), channelId, "processed-videos.json")
}

export function loadProcessedVideos(channelId: string): DedupRecord {
  const filePath = getDedupPath(channelId)
  if (!fs.existsSync(filePath)) return {}
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"))
  } catch {
    return {}
  }
}

export function isVideoProcessed(channelId: string, videoId: string): boolean {
  const records = loadProcessedVideos(channelId)
  return videoId in records
}

export function markVideoProcessed(channelId: string, videoId: string): void {
  const records = loadProcessedVideos(channelId)
  records[videoId] = new Date().toISOString().slice(0, 10)
  const filePath = getDedupPath(channelId)
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), "utf-8")
}

/**
 * Remove entries older than maxAgeDays (default 90).
 */
export function pruneProcessedVideos(channelId: string, maxAgeDays = 90): void {
  const records = loadProcessedVideos(channelId)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - maxAgeDays)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  let pruned = false
  for (const [videoId, date] of Object.entries(records)) {
    if (date < cutoffStr) {
      delete records[videoId]
      pruned = true
    }
  }

  if (pruned) {
    const filePath = getDedupPath(channelId)
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), "utf-8")
  }
}
