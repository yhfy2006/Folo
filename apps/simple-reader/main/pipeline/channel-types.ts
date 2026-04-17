import type { StageName } from "./types"

// ── TTS provider configuration ──────────────────────────────────────

export interface ChannelTTS {
  provider: "minimax" | "deepgram"
  voiceId: string
  model: string
  speed?: number
}

// ── YouTube channel configuration ───────────────────────────────────

export interface ChannelYouTube {
  channelId?: string
  tags: string[]
  titleTemplate: string
  descriptionTemplate?: string
  shortsDescriptionTemplate?: string
}

// ── Web/HTML page configuration ─────────────────────────────────────

export interface ChannelWeb {
  htmlLang: string
  brandName: string
  ogTitle?: string
  footerCta?: string
}

// ── Signalist pipeline configuration ────────────────────────────────

export interface SignalistConfig {
  topics: string[]
  minVideoDuration: number // seconds, default 600
  viralScoreThreshold: number // 0-10, default 7
  maxShortsPerVideo: number // default 5
  shortsTargetDuration: number // seconds, default 58
  bgmDir: string // relative path to BGM assets
}

// ── Channel definition ──────────────────────────────────────────────

export interface Channel {
  id: string
  name: string
  language: string
  groupId: string
  tts: ChannelTTS
  youtube?: ChannelYouTube
  web?: ChannelWeb
  pipelineType?: "standard" | "signalist"
  signalist?: SignalistConfig
  stages: StageName[]
  promptDir: string
  skillsDir: string
}

// ── Template engine ─────────────────────────────────────────────────

/**
 * Replace `{{variable}}` placeholders in a template string.
 *
 * Built-in variables resolved from the channel:
 *   language, brandName, cta, tags, date
 *
 * Any additional key/value pairs can be supplied via `extra`.
 */
export function substituteTemplate(
  template: string,
  channel: Channel,
  extra?: Record<string, string>,
): string {
  const vars: Record<string, string> = {
    language: channel.language,
    brandName: channel.web?.brandName ?? channel.name,
    cta: channel.web?.footerCta ?? "",
    tags: channel.youtube?.tags.join(", ") ?? "",
    date: new Date().toISOString().slice(0, 10),
    ...extra,
  }

  return template.replaceAll(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? "")
}
