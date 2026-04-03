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

export interface ShortsData {
  headline: string
  ogImagePath?: string
  audioDuration: number
  fps: number
  subtitles?: SubtitleLine[]
  youtubeTitle: string
}
