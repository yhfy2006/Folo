export interface IntroScene {
  type: "intro"
  start: number
  end: number
}

export interface OverviewScene {
  type: "overview"
  start: number
  end: number
  headlines: string[]
}

export interface NewsPoint {
  text: string
  showAt: number
}

export interface NewsScene {
  type: "news"
  start: number
  end: number
  index: number
  total: number
  title: string
  source: string
  sourceUrl?: string
  ogImage?: string
  points: NewsPoint[]
}

export interface OutroScene {
  type: "outro"
  start: number
  end: number
}

export type Scene = IntroScene | OverviewScene | NewsScene | OutroScene

export interface SubtitleLine {
  text: string
  start: number
  end: number
}

export interface ScenesData {
  date: string
  title: string
  audioDuration: number
  fps: number
  scenes: Scene[]
  subtitles?: SubtitleLine[]
  thumbnailTitle?: string
  youtubeTitle?: string
}

export interface ShortsKeyPoint {
  text: string
  showAt: number
}

export interface ShortsData {
  headline: string
  ogImagePath?: string
  audioDuration: number
  fps: number
  subtitles?: SubtitleLine[]
  keyPoints?: ShortsKeyPoint[]
  youtubeTitle: string
  bgmPath?: string
}

export interface SignalistSegment {
  type: "text" | "clip"
  text?: string
  videoPath?: string
  subtitleText?: string
  topText?: string // bold headline above video (clip segments only)
  bottomText?: string // bold headline below video (clip segments only)
  durationFrames: number
  videoStartFrom?: number // frame offset into source video (for clip segments)
  // Cover variant (for opening card only) — renders editorial magazine layout;
  // first frame is fully opaque (no fade-in) so it functions as Shorts-feed thumbnail.
  variant?: "cover"
  kicker?: string // top label, e.g. "COMMENTARY · AI SAFETY · N°012"
  attribution?: string // primary attribution name, e.g. "GEOFFREY HINTON"
  attributionRole?: string // muted second line, e.g. "Turing laureate · Ex-Google · 2024"
  pullQuote?: string // italic bottom quote with red vertical rule, e.g. "And it could talk itself free."
}

export interface SignalistShortsData {
  segments: SignalistSegment[]
  totalDurationSeconds: number
  fps: number
  bgmPath?: string
}
