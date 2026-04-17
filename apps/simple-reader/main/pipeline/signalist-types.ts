export interface CandidateVideo {
  videoId: string
  title: string
  channelName: string
  description: string
  duration: number // seconds
  url: string
  publishDate: string
}

export interface ScreenedVideo {
  video: CandidateVideo
  pass: boolean
  reason: string
}

export interface TranscriptData {
  videoId: string
  srtPath: string
  srtContent: string
  source: "youtube" | "whisper"
  language: string
}

export interface ExtractedClip {
  id: number
  startTime: string // "HH:MM:SS,mmm" SRT format
  endTime: string
  durationSeconds: number
  topic: string
  transcript: string
  viralScore: number
  reason: string
}

export interface ShortsScriptSegment {
  textCard: string
  clipStart: string
  clipEnd: string
}

export interface ShortsScript {
  clipId: number
  openingCard: string
  segments: ShortsScriptSegment[]
  closingCard: string
  suggestedTitle: string
  suggestedTags: string[]
}

export interface RenderedVideo {
  clipId: number
  filePath: string
  title: string
  description: string
  tags: string[]
  sourceVideoId: string
  sourceTitle: string
  sourceChannel: string
}
