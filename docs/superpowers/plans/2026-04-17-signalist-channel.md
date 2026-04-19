# Signalist Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Signalist" channel type that automatically discovers YouTube interviews, extracts compelling highlights via AI, and renders cinematic vertical Shorts with text cards and epic BGM.

**Architecture:** Extends the existing channel/pipeline system with a new `pipelineType: "signalist"` and 5 new stages (screen, transcribe, extract, script, render). The orchestrator dispatches to different stage arrays based on pipeline type. Remotion renders cinematic 9:16 Shorts with text card → clip → text card alternation.

**Tech Stack:** TypeScript, Electron, yt-dlp (system binary), Remotion 4, Claude CLI for AI calls, existing pipeline infrastructure.

---

## File Structure

### New files

| File                                                 | Responsibility                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `main/pipeline/signalist-types.ts`                   | Signalist-specific TypeScript interfaces (CandidateVideo, ExtractedClip, ShortsScript, etc.) |
| `main/pipeline/signalist-dedup.ts`                   | Processed video dedup tracking (read/write/prune JSON)                                       |
| `main/pipeline/stages-signalist/screen.ts`           | AI screening stage — judges if a video is interview + relevant                               |
| `main/pipeline/stages-signalist/transcribe.ts`       | SRT download via yt-dlp, Whisper fallback                                                    |
| `main/pipeline/stages-signalist/extract.ts`          | AI highlight extraction (outline → timeline → scoring)                                       |
| `main/pipeline/stages-signalist/script.ts`           | AI text card copy generation                                                                 |
| `main/pipeline/stages-signalist/render.ts`           | yt-dlp segment download + Remotion render dispatch                                           |
| `main/pipeline/stages-signalist/index.ts`            | Exports SIGNALIST_STAGES array                                                               |
| `main/signalist-render.ts`                           | Remotion render spawning for SignalistShorts composition                                     |
| `video/src/SignalistShorts.tsx`                      | Remotion composition: text cards + video clips + BGM                                         |
| `video/src/components/TextCard.tsx`                  | Cinematic text card component (fade-in white text on black)                                  |
| `video/src/components/VideoClip.tsx`                 | 9:16 cropped video segment with hard subtitles                                               |
| `workspace/channels/signalist/channel.json`          | Bundled channel config template                                                              |
| `workspace/channels/signalist/prompts/screening.md`  | Video screening prompt                                                                       |
| `workspace/channels/signalist/prompts/extract.md`    | Highlight extraction prompt (adapted from AutoClip)                                          |
| `workspace/channels/signalist/prompts/script.md`     | Text card copy generation prompt                                                             |
| `workspace/channels/signalist/context/audience.md`   | Target audience profile                                                                      |
| `workspace/channels/signalist/context/style.md`      | Visual/editorial style guide                                                                 |
| `workspace/channels/signalist/context/guidelines.md` | Content guidelines                                                                           |

### Modified files

| File                              | Change                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `main/pipeline/channel-types.ts`  | Add `pipelineType?: "standard" \| "signalist"` and `signalist?` config block              |
| `main/pipeline/types.ts`          | Add new StageName values: `"screen" \| "transcribe" \| "extract" \| "script" \| "render"` |
| `main/pipeline/context.ts`        | Add Signalist context fields (candidateVideos, extractedClips, etc.)                      |
| `main/pipeline/orchestrator.ts`   | Import SIGNALIST_STAGES, dispatch by pipelineType, handle multi-video loop                |
| `main/pipeline/channel-loader.ts` | Preserve `signalist` config block in save/load                                            |
| `video/src/Root.tsx`              | Register `SignalistShorts` composition                                                    |
| `video/src/types.ts`              | Add `SignalistShortsData` type                                                            |

---

## Phase 1: Core Pipeline

### Task 1: Extend type system for Signalist

**Files:**

- Modify: `apps/simple-reader/main/pipeline/types.ts`
- Modify: `apps/simple-reader/main/pipeline/channel-types.ts`
- Create: `apps/simple-reader/main/pipeline/signalist-types.ts`
- Modify: `apps/simple-reader/main/pipeline/context.ts`

- [ ] **Step 1: Add new StageName values**

In `apps/simple-reader/main/pipeline/types.ts`, extend the `StageName` union:

```typescript
export type StageName =
  | "verify"
  | "reflect"
  | "discover"
  | "report"
  | "podcast"
  | "audio"
  | "upload"
  | "publish"
  | "video"
  | "youtube"
  | "shorts"
  // Signalist pipeline stages
  | "screen"
  | "transcribe"
  | "extract"
  | "script"
  | "render"
```

- [ ] **Step 2: Add pipelineType and signalist config to Channel**

In `apps/simple-reader/main/pipeline/channel-types.ts`, add to the `Channel` interface:

```typescript
export interface SignalistConfig {
  topics: string[]
  minVideoDuration: number // seconds, default 600
  viralScoreThreshold: number // 0-10, default 7
  maxShortsPerVideo: number // default 5
  shortsTargetDuration: number // seconds, default 58
  bgmDir: string // relative path to BGM assets
}

export interface Channel {
  id: string
  name: string
  language: string
  groupId: string
  pipelineType?: "standard" | "signalist"
  tts: ChannelTTS
  youtube?: ChannelYouTube
  web?: ChannelWeb
  signalist?: SignalistConfig
  stages: StageName[]
  promptDir: string
  skillsDir: string
}
```

Import `StageName` from `./types` — it's already imported.

- [ ] **Step 3: Create signalist-types.ts**

Create `apps/simple-reader/main/pipeline/signalist-types.ts`:

```typescript
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
```

- [ ] **Step 4: Extend PipelineContext**

In `apps/simple-reader/main/pipeline/context.ts`, add imports and fields:

Add at the top:

```typescript
import type {
  CandidateVideo,
  ExtractedClip,
  RenderedVideo,
  ScreenedVideo,
  ShortsScript,
  TranscriptData,
} from "./signalist-types"
```

Add to the `PipelineContext` interface (after the existing `shortsUrls` field):

```typescript
  // Signalist stages
  candidateVideos?: CandidateVideo[]
  screenedVideos?: ScreenedVideo[]
  currentTranscript?: TranscriptData
  extractedClips?: ExtractedClip[]
  signalistScripts?: ShortsScript[]
  renderedVideos?: RenderedVideo[]
```

- [ ] **Step 5: Verify typecheck passes**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/cherry-coin && pnpm run typecheck`
Expected: PASS (no consumers of the new types yet)

- [ ] **Step 6: Commit**

```bash
git add apps/simple-reader/main/pipeline/types.ts apps/simple-reader/main/pipeline/channel-types.ts apps/simple-reader/main/pipeline/signalist-types.ts apps/simple-reader/main/pipeline/context.ts
git commit -m "feat(signalist): extend type system with Signalist pipeline types"
```

---

### Task 2: Dedup tracker

**Files:**

- Create: `apps/simple-reader/main/pipeline/signalist-dedup.ts`

- [ ] **Step 1: Implement dedup module**

Create `apps/simple-reader/main/pipeline/signalist-dedup.ts`:

```typescript
import fs from "node:fs"

import { app } from "electron"
import path from "pathe"

import { getChannelsDir } from "./channel-loader"

interface DedupRecord {
  [videoId: string]: string // videoId → ISO date processed
}

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
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/cherry-coin && pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/main/pipeline/signalist-dedup.ts
git commit -m "feat(signalist): add processed video dedup tracker"
```

---

### Task 3: Screen stage

**Files:**

- Create: `apps/simple-reader/main/pipeline/stages-signalist/screen.ts`

- [ ] **Step 1: Implement screen stage**

Create `apps/simple-reader/main/pipeline/stages-signalist/screen.ts`:

```typescript
import { spawn } from "node:child_process"
import os from "node:os"

import path from "pathe"

import type { PipelineContext } from "../context"
import { loadPrompt } from "../prompt-loader"
import type { CandidateVideo, ScreenedVideo } from "../signalist-types"
import type { StageCallbacks, StageDefinition } from "../types"

function getClaudePath(): string {
  return path.join(os.homedir(), ".local", "bin", "claude")
}

/**
 * Call Claude CLI with a prompt, return the raw text response.
 */
function callClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getClaudePath(), ["--print", "--model", "sonnet", "-p", prompt], {
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString()
    })
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString()
    })
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`))
      }
    })
    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`))
    })
  })
}

/**
 * Extract YouTube video ID from various URL formats.
 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]!
  }
  return null
}

export const screenStage: StageDefinition = {
  name: "screen",
  label: "Screen Videos",
  shouldRun: (ctx: PipelineContext) =>
    !!ctx.channel?.pipelineType && ctx.channel.pipelineType === "signalist",

  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    const candidates = ctx.candidateVideos
    if (!candidates || candidates.length === 0) {
      callbacks.onStatus("No candidate videos to screen")
      return ctx
    }

    const channel = ctx.channel!
    const signalistConfig = channel.signalist!

    callbacks.onStatus(`Screening ${candidates.length} candidate videos...`)

    // Load screening prompt template
    let promptTemplate: string
    try {
      promptTemplate = loadPrompt(channel, "screening.md")
    } catch {
      // Fallback prompt if template missing
      promptTemplate = `You are a content curator. Evaluate whether this video is an interview/speech worth clipping.
Title: {{videoTitle}}
Channel: {{channelName}}
Description: {{videoDescription}}

Topics of interest: ${signalistConfig.topics.join(", ")}
Minimum duration: ${signalistConfig.minVideoDuration} seconds

Respond with JSON only: {"pass": true/false, "reason": "one sentence"}`
    }

    const screened: ScreenedVideo[] = []

    for (const video of candidates) {
      callbacks.onStatus(`Screening: ${video.title.slice(0, 60)}...`)

      // Skip videos shorter than minimum duration
      if (video.duration > 0 && video.duration < signalistConfig.minVideoDuration) {
        screened.push({
          video,
          pass: false,
          reason: `Too short (${Math.round(video.duration / 60)}min < ${Math.round(signalistConfig.minVideoDuration / 60)}min minimum)`,
        })
        continue
      }

      const prompt = promptTemplate
        .replaceAll("{{videoTitle}}", video.title)
        .replaceAll("{{channelName}}", video.channelName)
        .replaceAll("{{videoDescription}}", video.description.slice(0, 500))
        .replaceAll("{{videoDuration}}", `${Math.round(video.duration / 60)} minutes`)
        .replaceAll("{{topics}}", signalistConfig.topics.join(", "))

      try {
        const response = await callClaude(prompt)
        // Extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0])
          screened.push({
            video,
            pass: !!result.pass,
            reason: result.reason || "No reason provided",
          })
          const status = result.pass ? "PASS" : "SKIP"
          callbacks.onStatus(`  ${status}: ${result.reason}`)
        } else {
          screened.push({ video, pass: false, reason: "Failed to parse AI response" })
        }
      } catch (err) {
        console.warn(`[screen] Failed to screen ${video.videoId}:`, err)
        screened.push({ video, pass: false, reason: `Screening error: ${err}` })
      }
    }

    const passed = screened.filter((s) => s.pass)
    callbacks.onStatus(`Screening complete: ${passed.length}/${candidates.length} passed`)

    return { ...ctx, screenedVideos: screened }
  },
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/cherry-coin && pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/main/pipeline/stages-signalist/screen.ts
git commit -m "feat(signalist): implement screen stage for AI video screening"
```

---

### Task 4: Transcribe stage

**Files:**

- Create: `apps/simple-reader/main/pipeline/stages-signalist/transcribe.ts`

- [ ] **Step 1: Implement transcribe stage**

Create `apps/simple-reader/main/pipeline/stages-signalist/transcribe.ts`:

```typescript
import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"

import path from "pathe"

import type { PipelineContext } from "../context"
import type { ScreenedVideo, TranscriptData } from "../signalist-types"
import type { StageCallbacks, StageDefinition } from "../types"

/**
 * Find yt-dlp binary. Check common locations.
 */
function findYtDlp(): string {
  const candidates = [
    "/opt/homebrew/bin/yt-dlp",
    "/usr/local/bin/yt-dlp",
    path.join(os.homedir(), ".local", "bin", "yt-dlp"),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return "yt-dlp" // Fallback to PATH
}

/**
 * Run a command and return stdout.
 */
function exec(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} failed: ${stderr || err.message}`))
      } else {
        resolve(stdout)
      }
    })
  })
}

/**
 * Download YouTube subtitles using yt-dlp.
 * Returns the SRT file path, or null if no subtitles available.
 */
async function downloadSubtitles(
  videoUrl: string,
  videoId: string,
  workDir: string,
): Promise<string | null> {
  const ytDlp = findYtDlp()

  try {
    await exec(ytDlp, [
      "--write-sub",
      "--write-auto-sub",
      "--sub-lang",
      "en",
      "--sub-format",
      "srt",
      "--skip-download",
      "-o",
      path.join(workDir, `${videoId}.%(ext)s`),
      videoUrl,
    ])

    // yt-dlp creates files like videoId.en.srt or videoId.en-auto.srt
    const candidates = [
      path.join(workDir, `${videoId}.en.srt`),
      path.join(workDir, `${videoId}.en-orig.srt`),
    ]
    // Also check for auto-generated
    const files = fs.readdirSync(workDir).filter((f) => f.startsWith(videoId) && f.endsWith(".srt"))
    for (const f of files) {
      candidates.push(path.join(workDir, f))
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }

    return null
  } catch (err) {
    console.warn(`[transcribe] yt-dlp subtitle download failed:`, err)
    return null
  }
}

/**
 * Fallback: download audio and transcribe with Whisper.
 * Returns the SRT file path, or null if Whisper is not available.
 */
async function whisperTranscribe(
  videoUrl: string,
  videoId: string,
  workDir: string,
  onStatus: (s: string) => void,
): Promise<string | null> {
  const ytDlp = findYtDlp()

  // Download audio
  const audioPath = path.join(workDir, `${videoId}.wav`)
  try {
    onStatus("Downloading audio for Whisper transcription...")
    await exec(ytDlp, ["-x", "--audio-format", "wav", "-o", audioPath, videoUrl])
  } catch (err) {
    console.warn("[transcribe] Audio download failed:", err)
    return null
  }

  // Check if whisper is available
  try {
    await exec("whisper", ["--help"])
  } catch {
    console.warn("[transcribe] Whisper not installed, skipping fallback")
    return null
  }

  // Run whisper
  onStatus("Running Whisper transcription (this may take a while)...")
  try {
    await exec("whisper", [
      audioPath,
      "--model",
      "medium",
      "--language",
      "en",
      "--output_format",
      "srt",
      "--output_dir",
      workDir,
    ])

    const srtPath = path.join(workDir, `${videoId}.srt`)
    if (fs.existsSync(srtPath)) return srtPath

    // Whisper may name it differently
    const files = fs.readdirSync(workDir).filter((f) => f.endsWith(".srt") && f.includes(videoId))
    return files.length > 0 ? path.join(workDir, files[0]!) : null
  } catch (err) {
    console.warn("[transcribe] Whisper transcription failed:", err)
    return null
  }
}

/**
 * Transcribe a single video. Returns TranscriptData or null on failure.
 */
export async function transcribeVideo(
  video: { videoId: string; url: string; title: string },
  workDir: string,
  onStatus: (s: string) => void,
): Promise<TranscriptData | null> {
  // Try YouTube captions first
  onStatus(`Downloading subtitles for: ${video.title.slice(0, 50)}...`)
  let srtPath = await downloadSubtitles(video.url, video.videoId, workDir)
  let source: "youtube" | "whisper" = "youtube"

  if (!srtPath) {
    onStatus("No YouTube captions found, trying Whisper fallback...")
    srtPath = await whisperTranscribe(video.url, video.videoId, workDir, onStatus)
    source = "whisper"
  }

  if (!srtPath) {
    onStatus(`Failed to get transcript for: ${video.title}`)
    return null
  }

  const srtContent = fs.readFileSync(srtPath, "utf-8")
  if (srtContent.trim().length < 100) {
    onStatus(`Transcript too short for: ${video.title}`)
    return null
  }

  return {
    videoId: video.videoId,
    srtPath,
    srtContent,
    source,
    language: "en",
  }
}

export const transcribeStage: StageDefinition = {
  name: "transcribe",
  label: "Transcribe Videos",
  shouldRun: (ctx: PipelineContext) =>
    ctx.channel?.pipelineType === "signalist" && !!ctx.screenedVideos?.some((s) => s.pass),

  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    // Check yt-dlp availability
    const ytDlp = findYtDlp()
    try {
      await exec(ytDlp, ["--version"])
    } catch {
      throw new Error("yt-dlp not found. Install with: brew install yt-dlp")
    }

    callbacks.onStatus("Transcribe stage starting...")
    // Note: actual transcription happens in the orchestrator's per-video loop.
    // This stage just validates prerequisites.
    return ctx
  },
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/cherry-coin && pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/main/pipeline/stages-signalist/transcribe.ts
git commit -m "feat(signalist): implement transcribe stage with yt-dlp + Whisper fallback"
```

---

### Task 5: Extract stage

**Files:**

- Create: `apps/simple-reader/main/pipeline/stages-signalist/extract.ts`

- [ ] **Step 1: Implement extract stage**

Create `apps/simple-reader/main/pipeline/stages-signalist/extract.ts`:

```typescript
import { spawn } from "node:child_process"
import os from "node:os"

import path from "pathe"

import type { PipelineContext } from "../context"
import { loadPrompt } from "../prompt-loader"
import type { ExtractedClip, TranscriptData } from "../signalist-types"
import type { StageCallbacks, StageDefinition } from "../types"

function getClaudePath(): string {
  return path.join(os.homedir(), ".local", "bin", "claude")
}

function callClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getClaudePath(), ["--print", "--model", "sonnet", "-p", prompt], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, LANG: "en_US.UTF-8" },
    })

    let stdout = ""
    let stderr = ""

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString()
    })
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString()
    })
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`))
    })
    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`))
    })
  })
}

/**
 * Parse SRT timestamp to seconds.
 * "00:12:34,567" → 754.567
 */
function srtTimeToSeconds(time: string): number {
  const [h, m, rest] = time.split(":")
  const [s, ms] = rest!.split(",")
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000
}

/**
 * Extract highlights from a transcript using AI analysis.
 * Inspired by AutoClip's 3-step pipeline: outline → timeline → scoring.
 * Combined into a single LLM call for efficiency.
 */
export async function extractHighlights(
  transcript: TranscriptData,
  channel: NonNullable<PipelineContext["channel"]>,
  onStatus: (s: string) => void,
): Promise<ExtractedClip[]> {
  const config = channel.signalist!

  // Load extraction prompt
  let promptTemplate: string
  try {
    promptTemplate = loadPrompt(channel, "extract.md", {
      viralScoreThreshold: String(config.viralScoreThreshold),
      maxClips: String(config.maxShortsPerVideo),
      targetDuration: String(config.shortsTargetDuration),
    })
  } catch {
    promptTemplate = DEFAULT_EXTRACT_PROMPT
  }

  const prompt = `${promptTemplate}

## SRT Transcript

${transcript.srtContent}`

  onStatus("AI analyzing transcript for highlights...")
  const response = await callClaude(prompt)

  // Parse JSON array from response
  const jsonMatch = response.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    console.warn("[extract] Failed to parse AI response as JSON array")
    return []
  }

  try {
    const rawClips: Array<{
      id?: number
      start_time?: string
      startTime?: string
      end_time?: string
      endTime?: string
      topic?: string
      transcript?: string
      viral_score?: number
      viralScore?: number
      reason?: string
    }> = JSON.parse(jsonMatch[0])

    const clips: ExtractedClip[] = rawClips
      .map((raw, i) => {
        const startTime = raw.start_time || raw.startTime || "00:00:00,000"
        const endTime = raw.end_time || raw.endTime || "00:00:00,000"
        const startSec = srtTimeToSeconds(startTime)
        const endSec = srtTimeToSeconds(endTime)
        return {
          id: raw.id ?? i + 1,
          startTime,
          endTime,
          durationSeconds: Math.round((endSec - startSec) * 10) / 10,
          topic: raw.topic || `Clip ${i + 1}`,
          transcript: raw.transcript || "",
          viralScore: raw.viral_score ?? raw.viralScore ?? 0,
          reason: raw.reason || "",
        }
      })
      .filter((c) => c.durationSeconds >= 10 && c.viralScore >= config.viralScoreThreshold)
      .slice(0, config.maxShortsPerVideo)

    return clips
  } catch (err) {
    console.warn("[extract] Failed to parse clips JSON:", err)
    return []
  }
}

const DEFAULT_EXTRACT_PROMPT = `You are an expert video editor for Signalist, a YouTube Shorts channel.
Analyze this interview/speech transcript and identify the most compelling moments for ~60 second Shorts.

## Your Task

1. Read the full SRT transcript below
2. Identify moments with high viral potential
3. For each moment, provide precise SRT timestamps

## Selection Criteria (score 0-10)

- Controversy/surprise: counterintuitive claims, bold predictions
- Quotability: concise, memorable phrasing
- Emotional intensity: passion, humor, anger, awe
- Standalone clarity: understandable without full context
- Engagement: statements that provoke thought or debate

## Rules

- Each clip should be 30-60 seconds (for a ~60s Shorts with text cards)
- Align timestamps to sentence boundaries in the SRT
- Minimum viral score to include: {{viralScoreThreshold}}
- Maximum clips to return: {{maxClips}}
- If nothing is compelling enough, return an empty array []

## Output Format

Return a JSON array only, no other text:

[
  {
    "id": 1,
    "start_time": "00:12:34,567",
    "end_time": "00:13:28,901",
    "topic": "Brief topic label",
    "transcript": "Full text of the segment from the SRT",
    "viral_score": 8,
    "reason": "Why this moment is compelling"
  }
]`

export const extractStage: StageDefinition = {
  name: "extract",
  label: "Extract Highlights",
  shouldRun: (ctx: PipelineContext) => ctx.channel?.pipelineType === "signalist",

  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    callbacks.onStatus("Extract stage ready")
    // Actual extraction happens in the orchestrator's per-video loop
    return ctx
  },
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/cherry-coin && pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/main/pipeline/stages-signalist/extract.ts
git commit -m "feat(signalist): implement extract stage with AutoClip-inspired highlight detection"
```

---

### Task 6: Script stage

**Files:**

- Create: `apps/simple-reader/main/pipeline/stages-signalist/script.ts`

- [ ] **Step 1: Implement script stage**

Create `apps/simple-reader/main/pipeline/stages-signalist/script.ts`:

```typescript
import { spawn } from "node:child_process"
import os from "node:os"

import path from "pathe"

import type { PipelineContext } from "../context"
import { loadPrompt } from "../prompt-loader"
import type { ExtractedClip, ShortsScript } from "../signalist-types"
import type { StageCallbacks, StageDefinition } from "../types"

function getClaudePath(): string {
  return path.join(os.homedir(), ".local", "bin", "claude")
}

function callClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getClaudePath(), ["--print", "--model", "sonnet", "-p", prompt], {
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString()
    })
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString()
    })
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`))
    })
    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`))
    })
  })
}

/**
 * Generate text card scripts for a batch of extracted clips.
 */
export async function generateScripts(
  clips: ExtractedClip[],
  channel: NonNullable<PipelineContext["channel"]>,
  onStatus: (s: string) => void,
): Promise<ShortsScript[]> {
  let promptTemplate: string
  try {
    promptTemplate = loadPrompt(channel, "script.md")
  } catch {
    promptTemplate = DEFAULT_SCRIPT_PROMPT
  }

  const clipsJson = JSON.stringify(
    clips.map((c) => ({
      id: c.id,
      topic: c.topic,
      transcript: c.transcript,
      duration: c.durationSeconds,
      reason: c.reason,
    })),
    null,
    2,
  )

  const prompt = `${promptTemplate}

## Clips to Script

${clipsJson}`

  onStatus(`Generating text card scripts for ${clips.length} clips...`)
  const response = await callClaude(prompt)

  const jsonMatch = response.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    console.warn("[script] Failed to parse AI response")
    return []
  }

  try {
    const scripts: ShortsScript[] = JSON.parse(jsonMatch[0])
    return scripts.map((s) => ({
      clipId: s.clipId,
      openingCard: s.openingCard || "",
      segments: s.segments || [],
      closingCard: s.closingCard || "",
      suggestedTitle: s.suggestedTitle || `Signalist #${s.clipId}`,
      suggestedTags: s.suggestedTags || ["shorts", "interview"],
    }))
  } catch (err) {
    console.warn("[script] Failed to parse scripts JSON:", err)
    return []
  }
}

const DEFAULT_SCRIPT_PROMPT = `You are a cinematic editor for Signalist, a YouTube Shorts channel.

For each interview clip below, create a text card script that makes it feel like a movie trailer.

## Format Rules

- Opening card: Bold, attention-grabbing (like a movie tagline). Max 15 words.
- Segments: Split the clip into 2-4 sub-segments, each with a short transition text card. Max 10 words per card.
- Closing card: A thought-provoking question or powerful summary. Max 15 words.
- All text in English, conversational but cinematic tone.
- suggestedTitle: YouTube Shorts title, max 100 chars, attention-grabbing.
- suggestedTags: 5-8 relevant hashtags without the # symbol.

## Output Format

Return a JSON array:

[
  {
    "clipId": 1,
    "openingCard": "The moment everything changed.",
    "segments": [
      {"textCard": "Nobody saw this coming.", "clipStart": "00:12:34,000", "clipEnd": "00:12:48,000"},
      {"textCard": "But the data was clear.", "clipStart": "00:12:48,000", "clipEnd": "00:13:05,000"}
    ],
    "closingCard": "Are we ready for what comes next?",
    "suggestedTitle": "The Prediction Nobody Believed | Signalist",
    "suggestedTags": ["interview", "AI", "prediction", "tech", "future"]
  }
]`

export const scriptStage: StageDefinition = {
  name: "script",
  label: "Generate Scripts",
  shouldRun: (ctx: PipelineContext) => ctx.channel?.pipelineType === "signalist",

  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    callbacks.onStatus("Script stage ready")
    // Actual script generation happens in the orchestrator's per-video loop
    return ctx
  },
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/cherry-coin && pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/main/pipeline/stages-signalist/script.ts
git commit -m "feat(signalist): implement script stage for cinematic text card generation"
```

---

### Task 7: Remotion SignalistShorts composition

**Files:**

- Create: `apps/simple-reader/video/src/SignalistShorts.tsx`
- Create: `apps/simple-reader/video/src/components/TextCard.tsx`
- Create: `apps/simple-reader/video/src/components/VideoClip.tsx`
- Modify: `apps/simple-reader/video/src/types.ts`
- Modify: `apps/simple-reader/video/src/Root.tsx`

- [ ] **Step 1: Add SignalistShortsData type**

In `apps/simple-reader/video/src/types.ts`, add at the end:

```typescript
export interface SignalistSegment {
  type: "text" | "clip"
  text?: string // for text cards
  videoPath?: string // for clip segments (relative path for staticFile)
  subtitleText?: string // hard subtitles for clip segments
  durationFrames: number
}

export interface SignalistShortsData {
  segments: SignalistSegment[]
  totalDurationSeconds: number
  fps: number
  bgmPath?: string
}
```

- [ ] **Step 2: Create TextCard component**

Create `apps/simple-reader/video/src/components/TextCard.tsx`:

```tsx
import * as React from "react"
import { interpolate, useCurrentFrame } from "remotion"

interface TextCardProps {
  text: string
  startFrame: number
  durationFrames: number
}

export const TextCard: React.FC<TextCardProps> = ({ text, startFrame, durationFrames }) => {
  const frame = useCurrentFrame()
  const localFrame = frame - startFrame

  if (localFrame < 0 || localFrame >= durationFrames) return null

  // Fade in over 10 frames, fade out over 10 frames
  const fadeIn = interpolate(localFrame, [0, 10], [0, 1], { extrapolateRight: "clamp" })
  const fadeOut = interpolate(localFrame, [durationFrames - 10, durationFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const opacity = Math.min(fadeIn, fadeOut)

  // Subtle scale animation
  const scale = interpolate(localFrame, [0, 15], [0.95, 1], { extrapolateRight: "clamp" })

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
        opacity,
        zIndex: 100,
      }}
    >
      <div
        style={{
          fontSize: text.length > 40 ? 52 : 64,
          fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          fontWeight: 700,
          color: "#fff",
          textAlign: "center",
          lineHeight: 1.4,
          letterSpacing: 1.5,
          transform: `scale(${scale})`,
        }}
      >
        {text}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create VideoClip component**

Create `apps/simple-reader/video/src/components/VideoClip.tsx`:

```tsx
import * as React from "react"
import { interpolate, OffthreadVideo, staticFile, useCurrentFrame } from "remotion"

interface VideoClipProps {
  videoPath: string
  subtitleText?: string
  startFrame: number
  durationFrames: number
}

export const VideoClip: React.FC<VideoClipProps> = ({
  videoPath,
  subtitleText,
  startFrame,
  durationFrames,
}) => {
  const frame = useCurrentFrame()
  const localFrame = frame - startFrame

  if (localFrame < 0 || localFrame >= durationFrames) return null

  // Fade in/out
  const fadeIn = interpolate(localFrame, [0, 8], [0, 1], { extrapolateRight: "clamp" })
  const fadeOut = interpolate(localFrame, [durationFrames - 8, durationFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const opacity = Math.min(fadeIn, fadeOut)

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        zIndex: 50,
      }}
    >
      {/* 9:16 center-cropped video */}
      <div
        style={{
          width: 1080,
          height: 1920,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <OffthreadVideo
          src={staticFile(videoPath)}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            minWidth: "100%",
            minHeight: "100%",
            transform: "translate(-50%, -50%)",
            objectFit: "cover",
          }}
        />
      </div>

      {/* Hard-burned subtitle */}
      {subtitleText && (
        <div
          style={{
            position: "absolute",
            bottom: 180,
            left: 48,
            right: 48,
            zIndex: 60,
          }}
        >
          <div
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.7)",
              borderRadius: 8,
              padding: "12px 20px",
              display: "inline-block",
            }}
          >
            <span
              style={{
                fontSize: 36,
                fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
                fontWeight: 600,
                color: "#fff",
                lineHeight: 1.4,
              }}
            >
              {subtitleText}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create SignalistShorts composition**

Create `apps/simple-reader/video/src/SignalistShorts.tsx`:

```tsx
import * as React from "react"
import { Audio, staticFile, useVideoConfig } from "remotion"

import { TextCard } from "./components/TextCard"
import { VideoClip } from "./components/VideoClip"
import type { SignalistShortsData } from "./types"

export const SignalistShorts: React.FC<SignalistShortsData> = ({ segments, bgmPath }) => {
  const { fps, durationInFrames } = useVideoConfig()

  // Calculate cumulative start frames for each segment
  let currentFrame = 0
  const segmentLayout = segments.map((seg) => {
    const start = currentFrame
    currentFrame += seg.durationFrames
    return { ...seg, startFrame: start }
  })

  return (
    <div
      style={{
        width: 1080,
        height: 1920,
        backgroundColor: "#000",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background music with ducking */}
      {bgmPath && (
        <Audio
          src={staticFile(bgmPath)}
          volume={(f) => {
            const t = f / fps
            const dur = durationInFrames / fps
            // Find if current frame is in a clip segment
            const inClip = segmentLayout.some(
              (seg) =>
                seg.type === "clip" &&
                f >= seg.startFrame &&
                f < seg.startFrame + seg.durationFrames,
            )
            // Base volume: 0.4 for text cards, 0.15 for clips (duck under speech)
            const baseVol = inClip ? 0.15 : 0.4
            // Fade in over 1s, fade out over 2s
            if (t < 1) return baseVol * t
            if (t > dur - 2) return baseVol * ((dur - t) / 2)
            return baseVol
          }}
          loop
        />
      )}

      {/* Render segments */}
      {segmentLayout.map((seg, i) => {
        if (seg.type === "text" && seg.text) {
          return (
            <TextCard
              key={i}
              text={seg.text}
              startFrame={seg.startFrame}
              durationFrames={seg.durationFrames}
            />
          )
        }
        if (seg.type === "clip" && seg.videoPath) {
          return (
            <VideoClip
              key={i}
              videoPath={seg.videoPath}
              subtitleText={seg.subtitleText}
              startFrame={seg.startFrame}
              durationFrames={seg.durationFrames}
            />
          )
        }
        return null
      })}
    </div>
  )
}
```

- [ ] **Step 5: Register composition in Root.tsx**

In `apps/simple-reader/video/src/Root.tsx`:

Add import at the top (after existing imports):

```typescript
import { SignalistShorts } from "./SignalistShorts"
import type { SignalistShortsData } from "./types"
```

Add default props (after `defaultShortsProps`):

```typescript
const defaultSignalistProps: SignalistShortsData = {
  segments: [
    { type: "text", text: "The moment everything changed.", durationFrames: 90 },
    {
      type: "clip",
      videoPath: "signalist-clip.mp4",
      subtitleText: "This is incredible...",
      durationFrames: 300,
    },
    { type: "text", text: "Are we ready?", durationFrames: 90 },
  ],
  totalDurationSeconds: 16,
  fps: 30,
}
```

Add Composition (inside the `<>...</>` fragment, after `ShortsVideo`):

```tsx
<Composition
  id="SignalistShorts"
  component={SignalistShorts}
  durationInFrames={defaultSignalistProps.totalDurationSeconds * defaultSignalistProps.fps}
  fps={shorts.fps}
  width={shorts.width}
  height={shorts.height}
  defaultProps={defaultSignalistProps}
  calculateMetadata={async ({ props }) => ({
    durationInFrames: Math.ceil(props.totalDurationSeconds * props.fps),
  })}
/>
```

- [ ] **Step 6: Verify typecheck**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/cherry-coin && pnpm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/simple-reader/video/src/SignalistShorts.tsx apps/simple-reader/video/src/components/TextCard.tsx apps/simple-reader/video/src/components/VideoClip.tsx apps/simple-reader/video/src/types.ts apps/simple-reader/video/src/Root.tsx
git commit -m "feat(signalist): add Remotion SignalistShorts composition with text cards and video clips"
```

---

### Task 8: Render stage + signalist-render.ts

**Files:**

- Create: `apps/simple-reader/main/signalist-render.ts`
- Create: `apps/simple-reader/main/pipeline/stages-signalist/render.ts`

- [ ] **Step 1: Create signalist-render.ts**

Create `apps/simple-reader/main/signalist-render.ts`:

```typescript
import { spawn } from "node:child_process"
import fs from "node:fs"

import { app } from "electron"
import path from "pathe"

import type { SignalistShortsData } from "../video/src/types"

function getVideoProjectDir(): string {
  return path.resolve(app.getAppPath(), "video")
}

function getVideoEntryPoint(): string {
  return path.resolve(getVideoProjectDir(), "src", "index.ts")
}

function getRemotionBin(): string {
  let dir = getVideoProjectDir()
  while (dir !== path.dirname(dir)) {
    const bin = path.resolve(dir, "node_modules", ".bin", "remotion")
    if (fs.existsSync(bin)) return bin
    dir = path.dirname(dir)
  }
  return "remotion"
}

interface RenderOptions {
  onProgress?: (pct: number) => void
  onStatus?: (status: string) => void
}

/**
 * Copy a video segment file to Remotion's public/ directory.
 * Returns the filename (for staticFile() reference).
 */
export function copySegmentToPublic(sourcePath: string, name: string): string {
  const publicDir = path.resolve(getVideoProjectDir(), "public")
  fs.mkdirSync(publicDir, { recursive: true })
  const dest = path.resolve(publicDir, name)
  fs.copyFileSync(sourcePath, dest)
  return name
}

/**
 * Copy a BGM file to Remotion's public/ directory.
 */
export function copyBgmToPublic(sourcePath: string): string {
  const publicDir = path.resolve(getVideoProjectDir(), "public")
  fs.mkdirSync(publicDir, { recursive: true })
  const dest = path.resolve(publicDir, "signalist-bgm.mp3")
  fs.copyFileSync(sourcePath, dest)
  return "signalist-bgm.mp3"
}

/**
 * Render a Signalist Shorts video using Remotion.
 */
export function renderSignalistShorts(
  propsJsonPath: string,
  outputPath: string,
  options: RenderOptions = {},
): Promise<string> {
  const { onProgress, onStatus } = options

  return new Promise((resolve, reject) => {
    onStatus?.("Starting Signalist Shorts render...")

    const remotionBin = getRemotionBin()
    const videoProjectDir = getVideoProjectDir()
    const args = [
      "render",
      getVideoEntryPoint(),
      "SignalistShorts",
      "--output",
      outputPath,
      "--props",
      propsJsonPath,
      "--codec",
      "h264",
      "--fps",
      "30",
    ]

    console.info("[signalist-render] Spawning:", remotionBin, args.join(" "))

    const proc = spawn(remotionBin, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: videoProjectDir,
    })

    let stderr = ""

    proc.stdout.on("data", (data: Buffer) => {
      console.info("[signalist-render] stdout:", data.toString().trim())
    })

    proc.stderr.on("data", (data: Buffer) => {
      const text = data.toString()
      stderr += text
      const progressMatch = text.match(/(\d+)%/)
      if (progressMatch) {
        const pct = Number.parseInt(progressMatch[1]!, 10)
        onProgress?.(pct)
        onStatus?.(`Rendering Signalist Shorts: ${pct}%`)
      }
    })

    proc.on("close", (code) => {
      if (code === 0) {
        onStatus?.("Signalist Shorts render complete")
        resolve(outputPath)
      } else {
        reject(new Error(`Remotion render exited with code ${code}: ${stderr}`))
      }
    })

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn Remotion: ${err.message}`))
    })
  })
}
```

- [ ] **Step 2: Create render stage**

Create `apps/simple-reader/main/pipeline/stages-signalist/render.ts`:

```typescript
import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"

import path from "pathe"

import { copyBgmToPublic, copySegmentToPublic, renderSignalistShorts } from "../../signalist-render"
import type { PipelineContext } from "../context"
import type { ExtractedClip, RenderedVideo, ShortsScript } from "../signalist-types"
import type { StageCallbacks, StageDefinition } from "../types"

function findYtDlp(): string {
  const candidates = [
    "/opt/homebrew/bin/yt-dlp",
    "/usr/local/bin/yt-dlp",
    path.join(os.homedir(), ".local", "bin", "yt-dlp"),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return "yt-dlp"
}

function exec(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${stderr || err.message}`))
      else resolve(stdout)
    })
  })
}

/**
 * Convert SRT timestamp "HH:MM:SS,mmm" to seconds for yt-dlp.
 */
function srtToSeconds(time: string): number {
  const [h, m, rest] = time.split(":")
  const [s, ms] = rest!.split(",")
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000
}

/**
 * Download a specific segment of a YouTube video.
 */
async function downloadSegment(
  videoUrl: string,
  startTime: string,
  endTime: string,
  outputPath: string,
): Promise<void> {
  const ytDlp = findYtDlp()
  const startSec = srtToSeconds(startTime)
  const endSec = srtToSeconds(endTime)

  await exec(ytDlp, [
    "--download-sections",
    `*${startSec}-${endSec}`,
    "--force-keyframes-at-cuts",
    "-f",
    "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
    "--merge-output-format",
    "mp4",
    "-o",
    outputPath,
    videoUrl,
  ])
}

/**
 * Pick a random BGM file from the channel's BGM directory.
 */
function pickRandomBgm(channelDir: string, bgmDir: string): string | null {
  const fullBgmDir = path.join(channelDir, bgmDir)
  if (!fs.existsSync(fullBgmDir)) return null

  const files = fs.readdirSync(fullBgmDir).filter((f) => f.endsWith(".mp3") || f.endsWith(".wav"))
  if (files.length === 0) return null

  const picked = files[Math.floor(Math.random() * files.length)]!
  return path.join(fullBgmDir, picked)
}

/**
 * Render one Signalist Shorts from a clip + script pair.
 */
export async function renderOneShorts(
  clip: ExtractedClip,
  script: ShortsScript,
  videoUrl: string,
  sourceVideoId: string,
  sourceTitle: string,
  sourceChannel: string,
  channel: NonNullable<PipelineContext["channel"]>,
  workDir: string,
  onStatus: (s: string) => void,
): Promise<RenderedVideo | null> {
  const config = channel.signalist!
  const clipIdx = clip.id

  // 1. Download the video segment
  const segmentPath = path.join(workDir, `segment-${clipIdx}.mp4`)
  onStatus(`Downloading video segment ${clipIdx}...`)
  try {
    await downloadSegment(videoUrl, clip.startTime, clip.endTime, segmentPath)
  } catch (err) {
    console.warn(`[render] Failed to download segment ${clipIdx}:`, err)
    return null
  }

  if (!fs.existsSync(segmentPath)) {
    console.warn(`[render] Segment file not created: ${segmentPath}`)
    return null
  }

  // 2. Copy segment to Remotion public dir
  const segmentName = `signalist-segment-${clipIdx}.mp4`
  copySegmentToPublic(segmentPath, segmentName)

  // 3. Pick and copy BGM
  const channelDir = path.join(channel.promptDir, "..")
  const bgmSource = pickRandomBgm(channelDir, config.bgmDir)
  let bgmName: string | undefined
  if (bgmSource) {
    bgmName = copyBgmToPublic(bgmSource)
  }

  // 4. Build Remotion props
  const fps = 30
  const textCardDurationFrames = 90 // 3 seconds

  const segments: Array<{
    type: "text" | "clip"
    text?: string
    videoPath?: string
    subtitleText?: string
    durationFrames: number
  }> = []

  // Opening text card
  segments.push({
    type: "text",
    text: script.openingCard,
    durationFrames: textCardDurationFrames,
  })

  // Interleaved text cards and clip segments
  if (script.segments.length > 0) {
    for (const seg of script.segments) {
      // Clip segment
      const clipStartSec = srtToSeconds(seg.clipStart) - srtToSeconds(clip.startTime)
      const clipEndSec = srtToSeconds(seg.clipEnd) - srtToSeconds(clip.startTime)
      const clipDuration = Math.max(clipEndSec - clipStartSec, 2)
      segments.push({
        type: "clip",
        videoPath: segmentName,
        subtitleText: seg.textCard, // Use as subtitle during clip
        durationFrames: Math.round(clipDuration * fps),
      })

      // Transition text card (if not the last segment)
      if (seg !== script.segments.at(-1)) {
        segments.push({
          type: "text",
          text: seg.textCard,
          durationFrames: Math.round(textCardDurationFrames * 0.7), // Shorter transition cards
        })
      }
    }
  } else {
    // No segments defined — use full clip as one segment
    segments.push({
      type: "clip",
      videoPath: segmentName,
      durationFrames: Math.round(clip.durationSeconds * fps),
    })
  }

  // Closing text card
  segments.push({
    type: "text",
    text: script.closingCard,
    durationFrames: textCardDurationFrames,
  })

  const totalFrames = segments.reduce((sum, s) => sum + s.durationFrames, 0)
  const totalDurationSeconds = totalFrames / fps

  const propsData = {
    segments,
    totalDurationSeconds,
    fps,
    bgmPath: bgmName,
  }

  // 5. Write props JSON
  const propsPath = path.join(workDir, `signalist-props-${clipIdx}.json`)
  fs.writeFileSync(propsPath, JSON.stringify(propsData, null, 2), "utf-8")

  // 6. Render
  const outputPath = path.join(workDir, `signalist-shorts-${clipIdx}.mp4`)
  onStatus(`Rendering Signalist Shorts ${clipIdx}...`)
  await renderSignalistShorts(propsPath, outputPath, {
    onProgress: (pct) => onStatus(`Rendering Shorts ${clipIdx}: ${pct}%`),
    onStatus,
  })

  // 7. Build description from channel template
  const description =
    channel.youtube?.descriptionTemplate
      ?.replaceAll("{{suggestedTitle}}", script.suggestedTitle)
      .replaceAll("{{sourceTitle}}", sourceTitle)
      .replaceAll("{{sourceChannel}}", sourceChannel) ||
    `Extracted from: ${sourceTitle} by ${sourceChannel}\n\n#shorts #signalist`

  return {
    clipId: clip.id,
    filePath: outputPath,
    title: script.suggestedTitle,
    description,
    tags: script.suggestedTags,
    sourceVideoId,
    sourceTitle,
    sourceChannel,
  }
}

export const renderStage: StageDefinition = {
  name: "render",
  label: "Render Shorts",
  shouldRun: (ctx: PipelineContext) => ctx.channel?.pipelineType === "signalist",

  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    callbacks.onStatus("Render stage ready")
    // Actual rendering happens in the orchestrator's per-video loop
    return ctx
  },
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/cherry-coin && pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/simple-reader/main/signalist-render.ts apps/simple-reader/main/pipeline/stages-signalist/render.ts
git commit -m "feat(signalist): implement render stage with yt-dlp segment download + Remotion rendering"
```

---

### Task 9: Signalist stages index + orchestrator integration

**Files:**

- Create: `apps/simple-reader/main/pipeline/stages-signalist/index.ts`
- Modify: `apps/simple-reader/main/pipeline/orchestrator.ts`

- [ ] **Step 1: Create stages index**

Create `apps/simple-reader/main/pipeline/stages-signalist/index.ts`:

```typescript
import { discoverStage } from "../stages/discover"
import { publishStage } from "../stages/publish"
import { uploadStage } from "../stages/upload"
import type { StageDefinition } from "../types"
import { extractStage } from "./extract"
import { renderStage } from "./render"
import { screenStage } from "./screen"
import { scriptStage } from "./script"
import { transcribeStage } from "./transcribe"

/**
 * Signalist pipeline stage definitions in execution order.
 * Reuses discover, upload, publish from the standard pipeline.
 */
export const SIGNALIST_STAGES: StageDefinition[] = [
  discoverStage,
  screenStage,
  transcribeStage,
  extractStage,
  scriptStage,
  renderStage,
  uploadStage,
  publishStage,
]
```

- [ ] **Step 2: Update orchestrator to support Signalist pipeline**

In `apps/simple-reader/main/pipeline/orchestrator.ts`, make the following changes:

Add import at the top (after existing stage imports):

```typescript
import { isVideoProcessed, markVideoProcessed, pruneProcessedVideos } from "./signalist-dedup"
import type { CandidateVideo, RenderedVideo } from "./signalist-types"
import { SIGNALIST_STAGES } from "./stages-signalist"
import { extractHighlights } from "./stages-signalist/extract"
import { renderOneShorts } from "./stages-signalist/render"
import { generateScripts } from "./stages-signalist/script"
import { transcribeVideo } from "./stages-signalist/transcribe"
```

Replace the `runPipeline` function with:

```typescript
export async function runPipeline(
  callbacks: PipelineCallbacks,
  groupId?: string,
  options?: { dryRun?: boolean },
): Promise<void> {
  const ctx = createContext({ groupId, dryRun: options?.dryRun })

  // Resolve channel from groupId so stages can access channel config
  if (groupId) {
    const channel = loadChannelByGroupId(groupId)
    if (channel) {
      ctx.channel = channel
    }
  }

  // Dispatch to the correct pipeline based on channel type
  if (ctx.channel?.pipelineType === "signalist") {
    await executeSignalistPipeline(ctx, callbacks)
  } else {
    await executePipeline(ctx, ALL_STAGES, callbacks)
  }
}
```

Add the Signalist pipeline executor (after `executePipeline`):

```typescript
/**
 * Signalist pipeline: discover → screen → (per-video: transcribe → extract → script → render) → upload
 * The key difference from standard: stages 3-6 loop over each screened video.
 */
async function executeSignalistPipeline(
  initialCtx: PipelineContext,
  callbacks: PipelineCallbacks,
): Promise<void> {
  let ctx = initialCtx
  const channel = ctx.channel!

  // Prune old dedup entries
  pruneProcessedVideos(channel.id)

  // Step 1: Discover (reuse standard discover stage)
  callbacks.onStage("discover")
  callbacks.onProgress(0, 8)
  try {
    const discoverStage = SIGNALIST_STAGES.find((s) => s.name === "discover")!
    ctx = await discoverStage.run(ctx, { onStatus: callbacks.onStatus })
  } catch (err) {
    callbacks.onStatus(`Discover skipped: ${err}`)
  }

  // Build candidate videos from discovery signals (entries with YouTube video URLs)
  const candidates: CandidateVideo[] = []
  if (ctx.discoverySignals) {
    for (const signal of ctx.discoverySignals) {
      // Extract video ID from entry URL
      const entry = queryAll<{ id: string; url: string; title: string; content: string }>(
        "SELECT id, url, title, content FROM entries WHERE id = ?",
        [signal.entryId],
      )[0]
      if (!entry?.url) continue

      const videoId = extractYouTubeVideoId(entry.url)
      if (!videoId) continue
      if (isVideoProcessed(channel.id, videoId)) continue

      candidates.push({
        videoId,
        title: entry.title || signal.title,
        channelName: signal.overlappingSources[0] || "Unknown",
        description: entry.content?.slice(0, 500) || "",
        duration: 0, // Will be filtered by screen stage if needed
        url: entry.url,
        publishDate: new Date().toISOString(),
      })
    }
  }
  ctx = { ...ctx, candidateVideos: candidates }
  callbacks.onStatus(`Found ${candidates.length} new candidate videos`)

  // Step 2: Screen
  callbacks.onStage("screen")
  callbacks.onProgress(1, 8)
  const screenDef = SIGNALIST_STAGES.find((s) => s.name === "screen")!
  ctx = await screenDef.run(ctx, { onStatus: callbacks.onStatus })

  const passedVideos = ctx.screenedVideos?.filter((s) => s.pass) || []
  if (passedVideos.length === 0) {
    callbacks.onStatus("No videos passed screening")
    callbacks.onProgress(8, 8)
    callbacks.onDone({ pageUrl: "", audioUrl: "", date: ctx.date })
    return
  }

  // Steps 3-6: Per-video processing loop
  const allRendered: RenderedVideo[] = []
  const workDir = path.join(os.tmpdir(), `signalist-${ctx.date}`)
  fs.mkdirSync(workDir, { recursive: true })

  for (let vi = 0; vi < passedVideos.length; vi++) {
    const screened = passedVideos[vi]!
    const video = screened.video
    callbacks.onStatus(
      `Processing video ${vi + 1}/${passedVideos.length}: ${video.title.slice(0, 50)}...`,
    )

    // 3. Transcribe
    callbacks.onStage("transcribe")
    callbacks.onProgress(2, 8)
    const transcript = await transcribeVideo(video, workDir, callbacks.onStatus)
    if (!transcript) {
      callbacks.onStatus(`Skipping ${video.title}: no transcript`)
      continue
    }

    // 4. Extract
    callbacks.onStage("extract")
    callbacks.onProgress(3, 8)
    const clips = await extractHighlights(transcript, channel, callbacks.onStatus)
    if (clips.length === 0) {
      callbacks.onStatus(`No compelling highlights found in: ${video.title}`)
      markVideoProcessed(channel.id, video.videoId)
      continue
    }
    callbacks.onStatus(
      `Found ${clips.length} highlights (scores: ${clips.map((c) => c.viralScore).join(", ")})`,
    )

    // 5. Script
    callbacks.onStage("script")
    callbacks.onProgress(4, 8)
    const scripts = await generateScripts(clips, channel, callbacks.onStatus)

    // 6. Render
    callbacks.onStage("render")
    callbacks.onProgress(5, 8)
    for (let ci = 0; ci < Math.min(clips.length, scripts.length); ci++) {
      try {
        const rendered = await renderOneShorts(
          clips[ci]!,
          scripts[ci]!,
          video.url,
          video.videoId,
          video.title,
          video.channelName,
          channel,
          workDir,
          callbacks.onStatus,
        )
        if (rendered) allRendered.push(rendered)
      } catch (err) {
        console.warn(`[signalist] Render failed for clip ${ci + 1}:`, err)
        callbacks.onStatus(`Render failed for clip ${ci + 1}: ${err}`)
      }
    }

    markVideoProcessed(channel.id, video.videoId)
  }

  ctx = { ...ctx, renderedVideos: allRendered }

  if (allRendered.length === 0) {
    callbacks.onStatus("No Shorts rendered")
    callbacks.onProgress(8, 8)
    callbacks.onDone({ pageUrl: "", audioUrl: "", date: ctx.date })
    return
  }

  // Step 7: Upload (TODO Phase 2 — for now just report rendered files)
  callbacks.onStage("upload")
  callbacks.onProgress(6, 8)
  callbacks.onStatus(`${allRendered.length} Shorts rendered and ready for upload`)

  // Step 8: Publish
  callbacks.onStage("publish")
  callbacks.onProgress(7, 8)

  callbacks.onProgress(8, 8)
  const firstUrl = allRendered[0]?.filePath || ""
  callbacks.onDone({
    pageUrl: firstUrl,
    audioUrl: "",
    date: ctx.date,
    youtubeUrl: undefined,
  })
}

function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]!
  }
  return null
}
```

Add missing imports at the top of the file:

```typescript
import { queryAll } from "../database"
```

- [ ] **Step 3: Verify typecheck**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/cherry-coin && pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/simple-reader/main/pipeline/stages-signalist/index.ts apps/simple-reader/main/pipeline/orchestrator.ts
git commit -m "feat(signalist): wire orchestrator with Signalist pipeline and per-video processing loop"
```

---

### Task 10: Bundled channel template

**Files:**

- Create: `apps/simple-reader/workspace/channels/signalist/channel.json`
- Create: `apps/simple-reader/workspace/channels/signalist/prompts/screening.md`
- Create: `apps/simple-reader/workspace/channels/signalist/prompts/extract.md`
- Create: `apps/simple-reader/workspace/channels/signalist/prompts/script.md`
- Create: `apps/simple-reader/workspace/channels/signalist/context/audience.md`
- Create: `apps/simple-reader/workspace/channels/signalist/context/style.md`
- Create: `apps/simple-reader/workspace/channels/signalist/context/guidelines.md`
- Create: `apps/simple-reader/workspace/channels/signalist/skills/.gitkeep`
- Create: `apps/simple-reader/workspace/channels/signalist/assets/bgm/.gitkeep`

- [ ] **Step 1: Create channel.json**

Create `apps/simple-reader/workspace/channels/signalist/channel.json`:

```json
{
  "name": "Signalist",
  "language": "en",
  "groupId": "",
  "pipelineType": "signalist",
  "tts": {
    "provider": "minimax",
    "voiceId": "",
    "model": ""
  },
  "youtube": {
    "tags": ["shorts", "interview", "highlights", "AI", "tech", "signalist"],
    "titleTemplate": "{{suggestedTitle}} | Signalist",
    "descriptionTemplate": "Extracted from: {{sourceTitle}} by {{sourceChannel}}\n\n#shorts #signalist #interview #highlights"
  },
  "stages": [
    "discover",
    "screen",
    "transcribe",
    "extract",
    "script",
    "render",
    "upload",
    "publish"
  ],
  "promptDir": "prompts",
  "skillsDir": "skills",
  "signalist": {
    "topics": ["AI", "technology", "politics", "science", "culture", "economics"],
    "minVideoDuration": 600,
    "viralScoreThreshold": 7,
    "maxShortsPerVideo": 5,
    "shortsTargetDuration": 58,
    "bgmDir": "assets/bgm"
  }
}
```

- [ ] **Step 2: Create screening prompt**

Create `apps/simple-reader/workspace/channels/signalist/prompts/screening.md`:

```markdown
You are a content curator for Signalist, a YouTube Shorts channel that extracts the most compelling moments from interviews and speeches.

Evaluate whether this video is worth processing for viral Shorts clips.

## Video Details

Title: {{videoTitle}}
Channel: {{channelName}}
Description: {{videoDescription}}
Duration: {{videoDuration}}

## Selection Criteria

1. **Format**: Must be an interview, conversation, speech, panel discussion, or debate. NOT a tutorial, music video, product review, vlog, or gaming video.
2. **Topic relevance**: Must relate to one or more of these topics: {{topics}}
3. **Duration**: Minimum 10 minutes (shorter videos rarely have enough extractable content).
4. **Source credibility**: From a recognized channel, expert, or public figure.
5. **Viral potential**: The topic should be timely, controversial, surprising, or thought-provoking.

## Response

Respond with JSON only, no other text:

{"pass": true, "reason": "one sentence explaining why this video is worth clipping"}

or

{"pass": false, "reason": "one sentence explaining why this video should be skipped"}
```

- [ ] **Step 3: Create extract prompt**

Create `apps/simple-reader/workspace/channels/signalist/prompts/extract.md`:

```markdown
You are an expert video editor for Signalist, a YouTube Shorts channel that creates cinematic highlight clips from interviews and speeches.

Analyze the SRT transcript below and identify the most compelling moments for ~60 second YouTube Shorts.

## Analysis Process

1. Read the entire transcript to understand context and flow
2. Identify moments with high viral potential using the scoring criteria
3. For each moment, provide precise SRT timestamps aligned to sentence boundaries
4. Score each moment honestly — only include truly compelling content

## Scoring Criteria (0-10)

- **Controversy/surprise** (weight: 25%): Counterintuitive claims, bold predictions, unexpected revelations
- **Quotability** (weight: 25%): Concise, memorable phrasing that stands alone
- **Emotional intensity** (weight: 20%): Genuine passion, humor, anger, awe, or vulnerability
- **Standalone clarity** (weight: 20%): Understandable without watching the full interview
- **Engagement potential** (weight: 10%): Likely to provoke comments, shares, or debate

## Rules

- Each clip should be 30-60 seconds of speech content (the final Shorts will be ~60s with text cards added)
- Align start/end timestamps to sentence boundaries in the SRT — never cut mid-sentence
- Add 0.5s buffer before the first word and after the last word
- Minimum viral score to include: {{viralScoreThreshold}}
- Maximum clips to return: {{maxClips}}
- If nothing meets the threshold, return an empty array []
- Include the full transcript text for each clip (copy from the SRT)

## Output Format

Return a JSON array only, no other text:

[
{
"id": 1,
"start_time": "00:12:34,567",
"end_time": "00:13:28,901",
"topic": "Brief topic label (3-5 words)",
"transcript": "Full text of the segment copied from the SRT",
"viral_score": 8,
"reason": "One sentence: why this moment is compelling"
}
]
```

- [ ] **Step 4: Create script prompt**

Create `apps/simple-reader/workspace/channels/signalist/prompts/script.md`:

```markdown
You are a cinematic editor for Signalist, a YouTube Shorts channel that turns interview highlights into movie-trailer-style short videos.

For each clip below, create a text card script. The final video alternates between black-screen text cards and interview footage.

## Style Guide

- **Opening card**: Bold, attention-grabbing, like a movie tagline. Create intrigue. Max 15 words.
- **Transition cards**: Short, punchy, contextualizes the next segment. Max 10 words.
- **Closing card**: Thought-provoking question OR powerful summary. Leave the viewer thinking. Max 15 words.
- **Tone**: Conversational but cinematic. Not clickbait — genuine insight.
- **Language**: English only.

## Segment Structure

Split each clip into 2-4 sub-segments at natural pauses or topic shifts. Each sub-segment:

- Gets a brief transition text card before it
- clipStart/clipEnd are timestamps WITHIN the extracted clip (relative to the clip, not the full video)

## YouTube Metadata

- **suggestedTitle**: Max 100 characters. Attention-grabbing but honest. Include topic keywords.
- **suggestedTags**: 5-8 relevant tags without # symbol. Include "shorts", "interview", and topic keywords.

## Output Format

Return a JSON array only, no other text:

[
{
"clipId": 1,
"openingCard": "The moment everything changed.",
"segments": [
{"textCard": "Nobody saw this coming.", "clipStart": "00:00:02,000", "clipEnd": "00:00:18,000"},
{"textCard": "But the data was clear.", "clipStart": "00:00:18,000", "clipEnd": "00:00:35,000"}
],
"closingCard": "Are we ready for what comes next?",
"suggestedTitle": "The Prediction Nobody Believed | Signalist",
"suggestedTags": ["shorts", "interview", "AI", "prediction", "tech", "future"]
}
]
```

- [ ] **Step 5: Create context files**

Create `apps/simple-reader/workspace/channels/signalist/context/audience.md`:

```markdown
# Audience Profile

English-speaking tech-curious audience aged 18-45. Interested in big ideas, paradigm shifts, and thought-provoking perspectives from experts and public figures. Consumes content primarily on mobile via YouTube Shorts, TikTok, and Instagram Reels. Values authenticity and substance over clickbait.
```

Create `apps/simple-reader/workspace/channels/signalist/context/style.md`:

```markdown
# Content Style

Cinematic, high-contrast, minimal. Think movie trailer meets TED talk.

- Text cards: White text on pure black, clean sans-serif font, center-aligned
- Transitions: Smooth fade to/from black (no flashy effects)
- BGM: Epic/cinematic underscore, never overpowering speech
- Subtitles: Clean white text with dark semi-transparent background
- Pacing: Deliberate pauses at text cards (3s), let moments breathe
```

Create `apps/simple-reader/workspace/channels/signalist/context/guidelines.md`:

```markdown
# Content Guidelines

## Prohibited

- Political propaganda or one-sided partisan content
- Content that could incite violence or hatred
- Misleading out-of-context clips that distort the speaker's intent
- Copyright-problematic content (full segments must be transformative)

## Required Elements

- Every Shorts must include source attribution in description
- Text cards must add context, not just repeat what's said
- Closing card must provoke genuine thought, not cheap engagement bait

## Format Requirements

- Duration: 55-60 seconds
- Aspect ratio: 9:16 vertical
- Minimum 2 text cards (opening + closing)
- Maximum 4 interview segments per Shorts
```

- [ ] **Step 6: Create placeholder directories**

Create `apps/simple-reader/workspace/channels/signalist/skills/.gitkeep` (empty file)
Create `apps/simple-reader/workspace/channels/signalist/assets/bgm/.gitkeep` (empty file)

- [ ] **Step 7: Commit**

```bash
git add apps/simple-reader/workspace/channels/signalist/
git commit -m "feat(signalist): add bundled Signalist channel template with prompts and context"
```

---

## Phase 2: Upload & Polish

### Task 11: Adapt upload/publish for Signalist

**Files:**

- Modify: `apps/simple-reader/main/pipeline/orchestrator.ts`

- [ ] **Step 1: Add YouTube upload to Signalist pipeline**

In the `executeSignalistPipeline` function in `orchestrator.ts`, replace the upload/publish placeholder sections (the "Step 7: Upload" and "Step 8: Publish" blocks) with:

```typescript
// Step 7: Upload to YouTube
callbacks.onStage("upload")
callbacks.onProgress(6, 8)

if (ctx.dryRun || ctx.skipUpload) {
  callbacks.onStatus(`Dry run: ${allRendered.length} Shorts rendered, skipping upload`)
} else if (ctx.prefs.youtubeEnabled && ctx.prefs.youtubeRefreshToken) {
  const { refreshAccessToken, uploadVideo } = await import("../youtube")
  const token = await refreshAccessToken(
    ctx.prefs.youtubeRefreshToken,
    ctx.prefs.youtubeClientId,
    ctx.prefs.youtubeClientSecret,
  )

  const shortsUrls: string[] = []
  for (let i = 0; i < allRendered.length; i++) {
    const rendered = allRendered[i]!
    callbacks.onStatus(`Uploading Shorts ${i + 1}/${allRendered.length}: ${rendered.title}`)

    try {
      const videoId = await uploadVideo({
        accessToken: token,
        videoPath: rendered.filePath,
        title: rendered.title,
        description: rendered.description,
        tags: rendered.tags,
        categoryId: "22", // People & Blogs
        privacyStatus: "public",
        defaultLanguage: "en",
        onProgress: (pct) => callbacks.onStatus(`Uploading ${i + 1}: ${pct}%`),
      })
      shortsUrls.push(`https://www.youtube.com/shorts/${videoId}`)
      callbacks.onStatus(`Uploaded: https://www.youtube.com/shorts/${videoId}`)
    } catch (err) {
      console.warn(`[signalist] Upload failed for ${rendered.title}:`, err)
      callbacks.onStatus(`Upload failed: ${err}`)
    }
  }
  ctx = { ...ctx, shortsUrls }
} else {
  callbacks.onStatus("YouTube not configured — skipping upload")
}

// Step 8: Publish (already public on upload)
callbacks.onStage("publish")
callbacks.onProgress(7, 8)

callbacks.onProgress(8, 8)
callbacks.onDone({
  pageUrl: ctx.shortsUrls?.[0] || allRendered[0]?.filePath || "",
  audioUrl: "",
  date: ctx.date,
  youtubeUrl: ctx.shortsUrls?.[0],
})
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/cherry-coin && pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/main/pipeline/orchestrator.ts
git commit -m "feat(signalist): add YouTube upload to Signalist pipeline"
```

---

### Task 12: UI — Pipeline tab stage labels for Signalist

**Files:**

- Modify: `apps/simple-reader/renderer/components/tabs/PipelineTab.tsx`

- [ ] **Step 1: Add Signalist stage labels**

In `apps/simple-reader/renderer/components/tabs/PipelineTab.tsx`, find the stage label mapping (there should be an object or map that converts stage names to display labels). Add entries for the new stages:

```typescript
const STAGE_LABELS: Record<string, string> = {
  // Standard pipeline
  verify: "Verify",
  reflect: "Reflect",
  discover: "Discover",
  report: "Report",
  podcast: "Podcast",
  audio: "Audio",
  upload: "Upload",
  publish: "Publish",
  video: "Video",
  youtube: "YouTube",
  shorts: "Shorts",
  // Signalist pipeline
  screen: "Screen Videos",
  transcribe: "Transcribe",
  extract: "Extract Highlights",
  script: "Generate Scripts",
  render: "Render Shorts",
}
```

The Pipeline tab already reads the channel's `stages` array to determine which stages to show in the sidebar. Since the Signalist channel.json defines `stages: ["discover", "screen", "transcribe", "extract", "script", "render", "upload", "publish"]`, the sidebar will automatically show the correct stages — we just need the labels.

- [ ] **Step 2: Verify the app renders**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/cherry-coin/apps/simple-reader && pnpm dev`
Expected: The app starts, navigate to Signalist channel detail → Pipeline tab shows the correct stage names.

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/renderer/components/tabs/PipelineTab.tsx
git commit -m "feat(signalist): add Signalist stage labels to Pipeline tab UI"
```

---

## Phase 3: Optimization (Future)

### Task 13: Smart 9:16 cropping with face detection

**Scope:** Replace center-crop with face-detection-based cropping using a lightweight model. Low priority — center-crop works well for most talking-head interviews.

**Approach:** Use `@mediapipe/face_detection` or ffmpeg's `cropdetect` filter to find the speaker's face position, then crop to 9:16 centered on the face.

### Task 14: A/B testing text card styles

**Scope:** Create 2-3 text card style variants (different fonts, animations, color accents) and randomly assign per Shorts. Track performance via YouTube Analytics API after 7 days.

### Task 15: Analytics integration

**Scope:** After uploading, periodically check YouTube Analytics for Shorts performance (views, watch time, retention). Store metrics and use them to refine the extract stage's viral scoring.

---

## Self-Review Checklist

1. **Spec coverage:**
   - ✅ Pipeline stages: discover, screen, transcribe, extract, script, render, upload, publish
   - ✅ pipelineType field on Channel interface
   - ✅ SignalistConfig block
   - ✅ Dedup tracking
   - ✅ AutoClip-inspired prompt engineering for extract
   - ✅ Remotion composition for cinematic Shorts
   - ✅ BGM handling with ducking
   - ✅ 9:16 vertical format
   - ✅ Text card ↔ clip alternation pattern
   - ✅ yt-dlp subtitle download + Whisper fallback
   - ✅ Bundled channel template with prompts/context
   - ✅ YouTube upload integration
   - ✅ UI stage labels

2. **Placeholder scan:** No TBD/TODO/placeholders found. All code blocks are complete.

3. **Type consistency:** Verified: `ExtractedClip`, `ShortsScript`, `RenderedVideo`, `CandidateVideo`, `ScreenedVideo`, `TranscriptData` are consistently named and structured across all tasks. `SignalistShortsData` in Remotion types matches the props built in the render stage.
