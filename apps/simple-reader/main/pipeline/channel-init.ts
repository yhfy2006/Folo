import fs from "node:fs"

import { app } from "electron"
import path from "pathe"

import type { FeedGroup } from "../database"
import { queryAll } from "../database"
import { loadPreferences } from "../preferences"
import type { loadChannelById } from "./channel-loader"
import { getChannelsDir, loadAllChannels, saveChannelConfig } from "./channel-loader"

/**
 * Get the path to bundled channel templates shipped with the app.
 * In dev: apps/simple-reader/workspace/channels/
 * In prod: resources/workspace/channels/
 */
function getBundledChannelsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "workspace", "channels")
  }
  // Dev mode: relative to this file's location in main/pipeline/
  return path.join(__dirname, "../../workspace/channels")
}

/**
 * Recursively copy a directory.
 */
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/**
 * Initialize channels on app startup.
 *
 * 1. Copy bundled channel templates to userData if they don't exist yet
 * 2. Auto-bind zh-ai-daily to the first feed group if groupId is empty
 * 3. Sync TTS/YouTube preferences from V1 prefs into channel config
 */
export function initChannels(): void {
  const channelsDir = getChannelsDir()
  const bundledDir = getBundledChannelsDir()

  // Step 1: Copy bundled channel templates to userData
  if (fs.existsSync(bundledDir)) {
    for (const entry of fs.readdirSync(bundledDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const destDir = path.join(channelsDir, entry.name)
      if (!fs.existsSync(destDir)) {
        console.info(`[channel-init] Installing bundled channel: ${entry.name}`)
        copyDirSync(path.join(bundledDir, entry.name), destDir)
      }
    }
  }

  // Step 2: Auto-bind channels with empty groupId
  const channels = loadAllChannels()
  const prefs = loadPreferences()

  // Get all feed groups from database
  let groups: FeedGroup[] = []
  try {
    groups = queryAll<FeedGroup>("SELECT * FROM feed_groups ORDER BY created_at ASC", [])
  } catch {
    // Database might not be initialized yet on first run
    console.warn("[channel-init] Could not query feed_groups (DB may not be ready)")
    return
  }

  for (const channel of channels) {
    if (channel.groupId) continue // Already bound
    if (groups.length === 0) continue

    // Try to find a group that isn't already bound to another channel
    const boundGroupIds = new Set(channels.filter((c) => c.groupId).map((c) => c.groupId))
    const availableGroup = groups.find((g) => !boundGroupIds.has(g.id))
    if (!availableGroup) continue

    console.info(
      `[channel-init] Auto-binding channel "${channel.id}" to group "${availableGroup.name}" (${availableGroup.id})`,
    )
    channel.groupId = availableGroup.id
    boundGroupIds.add(availableGroup.id)

    // Step 3: Sync V1 preferences into channel config
    syncPrefsToChannel(channel, prefs, availableGroup)
    saveChannelConfig(channel)
  }
}

/**
 * Sync V1 global preferences into a channel's config.
 * Only fills in empty/default values — doesn't overwrite user customizations.
 */
function syncPrefsToChannel(
  channel: ReturnType<typeof loadChannelById> & object,
  prefs: ReturnType<typeof loadPreferences>,
  group: FeedGroup,
): void {
  // TTS settings from preferences
  if (!channel.tts.voiceId && prefs.ttsVoiceId) {
    channel.tts.voiceId = prefs.ttsVoiceId
  }
  if (channel.tts.model === "speech-02-hd" && prefs.ttsModel) {
    channel.tts.model = prefs.ttsModel
  }

  // Language from group settings (if set)
  if (group.language && channel.language === "zh-CN" && group.language !== "Default") {
    // Keep channel.language as-is if it's already explicitly set
  }

  // Pipeline schedule from group
  if (group.pipeline_schedule) {
    // Store on the group, not the channel — channel reads from group's schedule
    console.info(`[channel-init] Group "${group.name}" has schedule: ${group.pipeline_schedule}`)
  }

  // YouTube stage enabled/disabled based on V1 preferences
  if (!prefs.youtubeEnabled) {
    channel.stages = channel.stages.filter(
      (s: string) => s !== "youtube" && s !== "shorts" && s !== "video",
    )
  }
}
