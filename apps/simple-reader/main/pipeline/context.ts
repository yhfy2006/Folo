import fs from "node:fs"

import type { UserPreferences } from "../preferences"
import { loadPreferences } from "../preferences"
import type { SubtitleSegment } from "../tts"
import type { Channel } from "./channel-types"

export interface PipelineContext {
  // Immutable config
  date: string
  groupId?: string
  groupName?: string
  channel?: Channel
  prefs: UserPreferences

  // Stage 0: verify
  owner?: string

  // Pre-stage: YouTube insights
  youtubeInsights?: string

  // Stage 1: report
  reportContent?: string
  seoDescription?: string

  // Stage 2: podcast
  podcastScript?: string

  // Stage 3: audio
  audioFilePath?: string
  ttsSubtitles?: SubtitleSegment[]

  // Stage 4: upload
  audioUrl?: string

  // Stage 5: publish
  pageUrl?: string

  // Stage 6: video
  scenesJsonPath?: string
  videoPath?: string
  thumbnailPath?: string
  audioDuration?: number

  // Stage 7: youtube
  youtubeUrl?: string
  youtubeAccessToken?: string

  // Stage 8: shorts
  shortsUrl?: string
  shortsUrls?: string[]

  // Options
  skipUpload?: boolean
  dryRun?: boolean
}

export function createContext(overrides?: Partial<PipelineContext>): PipelineContext {
  const prefs = overrides?.prefs ?? loadPreferences()
  return {
    date: new Date().toISOString().slice(0, 10),
    prefs,
    ...overrides,
  }
}

export function saveContext(ctx: PipelineContext, filePath: string): void {
  const serializable = {
    ...ctx,
    prefs: {
      ...ctx.prefs,
      githubToken: "***",
      minimaxApiKey: "***",
      deepgramApiKey: "***",
      youtubeClientSecret: "***",
      youtubeRefreshToken: "***",
    },
  }
  fs.writeFileSync(filePath, JSON.stringify(serializable, null, 2), "utf-8")
}

export function loadContext(filePath: string): PipelineContext {
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"))
  data.prefs = loadPreferences()
  return data as PipelineContext
}
