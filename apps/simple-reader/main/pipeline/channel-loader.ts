import fs from "node:fs"

import path from "pathe"

import { getUserDataPath } from "../runtime/paths"
import type { Channel } from "./channel-types"
import type { StageName } from "./types"

// ── All pipeline stages in default order ───────────────────────────────

const ALL_STAGES: StageName[] = [
  "verify",
  "reflect",
  "discover",
  "report",
  "podcast",
  "audio",
  "upload",
  "publish",
  "video",
  "youtube",
  "shorts",
]

// ── Prompt file templates ──────────────────────────────────────────────

const PROMPT_FILES: Record<string, string> = {
  "screening.md": "# screening prompt\n\nTODO: Write prompt template\n",
  "report.md": "# report prompt\n\nTODO: Write prompt template\n",
  "podcast.md": "# podcast prompt\n\nTODO: Write prompt template\n",
  "shorts.md": "# shorts prompt\n\nTODO: Write prompt template\n",
  "scenes.md": "# scenes prompt\n\nTODO: Write prompt template\n",
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Returns the absolute path to `workspace/channels/` under Electron userData.
 */
export function getChannelsDir(): string {
  return path.join(getUserDataPath(), "workspace", "channels")
}

/**
 * Resolve stored relative paths to absolute paths based on the channel directory.
 */
function resolveChannel(
  raw: Omit<Channel, "promptDir" | "skillsDir"> & { promptDir?: string; skillsDir?: string },
  channelDir: string,
): Channel {
  return {
    ...raw,
    promptDir: path.join(channelDir, raw.promptDir ?? "prompts"),
    skillsDir: path.join(channelDir, raw.skillsDir ?? "skills"),
  } as Channel
}

/**
 * Read and parse a single channel from its directory.
 * Returns null if the directory doesn't contain a valid channel.json.
 */
function readChannelFromDir(channelDir: string): Channel | null {
  const configPath = path.join(channelDir, "channel.json")
  if (!fs.existsSync(configPath)) {
    return null
  }

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"))
    // Inject id from directory name (not stored in channel.json)
    raw.id = path.basename(channelDir)
    return resolveChannel(raw, channelDir)
  } catch {
    console.warn(`[channel-loader] Failed to parse ${configPath}`)
    return null
  }
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Scan all channel directories and return Channel[].
 */
export function loadAllChannels(): Channel[] {
  const channelsDir = getChannelsDir()
  if (!fs.existsSync(channelsDir)) {
    return []
  }

  const entries = fs.readdirSync(channelsDir)
  const channels: Channel[] = []

  for (const entry of entries) {
    const channelDir = path.join(channelsDir, entry)
    if (!fs.statSync(channelDir).isDirectory()) {
      continue
    }
    const channel = readChannelFromDir(channelDir)
    if (channel) {
      channels.push(channel)
    }
  }

  return channels
}

/**
 * Load a single channel by its ID (directory name).
 * Returns null if the channel doesn't exist.
 */
export function loadChannelById(channelId: string): Channel | null {
  const channelDir = path.join(getChannelsDir(), channelId)
  if (!fs.existsSync(channelDir)) {
    return null
  }
  return readChannelFromDir(channelDir)
}

/**
 * Find a channel by its bound feed group ID.
 * Returns the first match, or null if none found.
 */
export function loadChannelByGroupId(groupId: string): Channel | null {
  const channels = loadAllChannels()
  return channels.find((ch) => ch.groupId === groupId) ?? null
}

/**
 * Create a new channel directory with default config and empty prompt .md files.
 */
export function createChannel(
  id: string,
  name: string,
  language: string,
  groupId: string,
): Channel {
  const channelDir = path.join(getChannelsDir(), id)
  const promptsDir = path.join(channelDir, "prompts")
  const skillsDir = path.join(channelDir, "skills")

  // Create directory structure
  fs.mkdirSync(promptsDir, { recursive: true })
  fs.mkdirSync(skillsDir, { recursive: true })

  const contextDir = path.join(channelDir, "context")
  fs.mkdirSync(contextDir, { recursive: true })

  // Write default context files
  fs.writeFileSync(
    path.join(contextDir, "audience.md"),
    "# Audience Profile\n\nNo data yet. Will be generated after first reflect run.\n",
    "utf-8",
  )
  fs.writeFileSync(
    path.join(contextDir, "style.md"),
    "# Content Style\n\nNo data yet. Will be generated after first reflect run.\n",
    "utf-8",
  )
  fs.writeFileSync(
    path.join(contextDir, "guidelines.md"),
    "# Content Guidelines\n\n## Prohibited\n- (list content types or terms to avoid)\n\n## Required Elements\n- (list elements every episode must include)\n\n## Format Requirements\n- (list hard format constraints)\n",
    "utf-8",
  )

  // Build default channel config
  const config: Omit<Channel, "promptDir" | "skillsDir"> & {
    promptDir: string
    skillsDir: string
  } = {
    id,
    name,
    language,
    groupId,
    tts: {
      provider: "minimax",
      voiceId: "",
      model: "speech-02-hd",
    },
    youtube: {
      tags: [],
      titleTemplate: `${name} — {{date}}`,
    },
    stages: [...ALL_STAGES],
    promptDir: "prompts",
    skillsDir: "skills",
  }

  // Write channel.json
  fs.writeFileSync(path.join(channelDir, "channel.json"), JSON.stringify(config, null, 2), "utf-8")

  // Write empty prompt template files
  for (const [filename, content] of Object.entries(PROMPT_FILES)) {
    fs.writeFileSync(path.join(promptsDir, filename), content, "utf-8")
  }

  console.info("[channel-loader] Created channel:", id)

  // Return with resolved absolute paths
  return resolveChannel(config, channelDir)
}

/**
 * Write channel.json, storing promptDir and skillsDir as relative paths.
 */
export function saveChannelConfig(channel: Channel): void {
  const channelDir = path.join(getChannelsDir(), channel.id)
  if (!fs.existsSync(channelDir)) {
    fs.mkdirSync(channelDir, { recursive: true })
  }

  // Strip computed absolute paths back to relative for storage
  const { promptDir, skillsDir, ...rest } = channel
  const storable = {
    ...rest,
    promptDir: path.relative(channelDir, promptDir) || "prompts",
    skillsDir: path.relative(channelDir, skillsDir) || "skills",
  }

  fs.writeFileSync(
    path.join(channelDir, "channel.json"),
    JSON.stringify(storable, null, 2),
    "utf-8",
  )
}

/**
 * Remove a channel directory and all its contents.
 */
export function deleteChannel(channelId: string): void {
  const channelDir = path.join(getChannelsDir(), channelId)
  if (fs.existsSync(channelDir)) {
    fs.rmSync(channelDir, { recursive: true, force: true })
    console.info("[channel-loader] Deleted channel:", channelId)
  }
}
