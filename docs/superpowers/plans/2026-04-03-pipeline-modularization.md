# Pipeline Modularization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the monolithic `pipeline.ts` (869 lines) into independent, testable stage modules connected by a serializable `PipelineContext`, enabling any stage to run in isolation.

**Architecture:** Each pipeline stage becomes a standalone function `(ctx, callbacks) => Promise<ctx>`. A shared `PipelineContext` object accumulates state across stages and can be serialized to/from JSON for debugging and partial re-runs. An orchestrator chains stages together and handles progress tracking. `runVideoOnly` is deleted and replaced by `runFrom("video", ctx)`.

**Tech Stack:** TypeScript, Vitest, existing dependencies (no new packages)

---

## File Structure

```
main/pipeline/
  context.ts           # PipelineContext type, createContext(), save/load helpers
  types.ts             # StageCallbacks, StageName, StageDefinition
  orchestrator.ts      # runPipeline(), runFrom(), stage registry
  stages/
    verify.ts          # Stage 0: GitHub token verification + repo setup
    report.ts          # Stage 1: AI report generation + SEO description
    podcast.ts         # Stage 2: Podcast script generation
    audio.ts           # Stage 3: TTS audio generation
    upload.ts          # Stage 4: Upload audio to GitHub Release
    publish.ts         # Stage 5: HTML generation + GitHub Pages commit
    video.ts           # Stage 6: Audio alignment + scene generation + video render
    youtube.ts         # Stage 7: YouTube upload
    shorts.ts          # Stage 8: Shorts script + audio + render + upload
  __tests__/
    context.test.ts    # Context serialization roundtrip tests
    orchestrator.test.ts # Stage filtering, runFrom, progress tracking
    verify.test.ts
    shorts.test.ts     # The key use case: test Shorts stage in isolation

main/pipeline.ts       # Replaced: thin re-export wrapper for backward compat
main/ipc-handlers.ts   # Modified: import from pipeline/orchestrator
main/preload.ts        # Modified: add runFrom IPC (optional, can be Phase 2)
```

Files NOT moved (they stay in `main/`): `ai-report.ts`, `database.ts`, `deepgram.ts`, `github.ts`, `html-generator.ts`, `og-image.ts`, `preferences.ts`, `scene-generator.ts`, `tts.ts`, `video-render.ts`, `youtube.ts`, `workspace.ts`, `scheduler.ts`, etc. We only extract pipeline orchestration logic; the underlying service modules stay put.

---

### Task 1: Create PipelineContext and Types

**Files:**

- Create: `apps/simple-reader/main/pipeline/context.ts`
- Create: `apps/simple-reader/main/pipeline/types.ts`
- Test: `apps/simple-reader/main/pipeline/__tests__/context.test.ts`

- [ ] **Step 1: Write the failing test for context serialization**

```typescript
// apps/simple-reader/main/pipeline/__tests__/context.test.ts
import fs from "node:fs"
import os from "node:os"

import path from "pathe"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({ app: { getPath: () => os.tmpdir() } }))
vi.mock("../../preferences", () => ({
  loadPreferences: vi.fn(() => ({
    language: "en",
    interests: [],
    reportStyle: "detailed",
    timeRange: 24,
    minimaxApiKey: "test",
    ttsVoiceId: "English_Graceful_Lady",
    ttsModel: "speech-2.8-hd",
    githubToken: "ghp_test",
    githubOwner: "test-owner",
    pipelineSchedule: "",
    workerUrl: "",
    workerSecret: "",
    deepgramApiKey: "dg_test",
    youtubeClientId: "",
    youtubeClientSecret: "",
    youtubeRefreshToken: "",
    youtubeEnabled: false,
    youtubeShortsEnabled: true,
  })),
}))

import { createContext, loadContext, saveContext } from "../context"

describe("PipelineContext", () => {
  const tmpDir = path.join(os.tmpdir(), "pipeline-ctx-test")

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  it("should create a context with defaults", () => {
    const ctx = createContext()
    expect(ctx.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(ctx.prefs.githubToken).toBe("ghp_test")
  })

  it("should create a context with overrides", () => {
    const ctx = createContext({
      date: "2026-01-01",
      reportContent: "test report",
    })
    expect(ctx.date).toBe("2026-01-01")
    expect(ctx.reportContent).toBe("test report")
  })

  it("should serialize and deserialize context to JSON", () => {
    const ctx = createContext({
      reportContent: "# Test Report\nSome content here",
      podcastScript: "Hello listeners...",
      audioFilePath: "/tmp/test.mp3",
    })

    fs.mkdirSync(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, "ctx.json")

    saveContext(ctx, filePath)
    const loaded = loadContext(filePath)

    expect(loaded.date).toBe(ctx.date)
    expect(loaded.reportContent).toBe(ctx.reportContent)
    expect(loaded.podcastScript).toBe(ctx.podcastScript)
    expect(loaded.audioFilePath).toBe(ctx.audioFilePath)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/simple-reader && npx vitest run main/pipeline/__tests__/context.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement context.ts and types.ts**

```typescript
// apps/simple-reader/main/pipeline/types.ts
import type { PipelineContext } from "./context"

export type StageName =
  | "verify"
  | "report"
  | "podcast"
  | "audio"
  | "upload"
  | "publish"
  | "video"
  | "youtube"
  | "shorts"

export interface StageCallbacks {
  onStatus: (status: string) => void
}

export interface StageDefinition {
  name: StageName
  label: string
  shouldRun: (ctx: PipelineContext) => boolean
  run: (ctx: PipelineContext, callbacks: StageCallbacks) => Promise<PipelineContext>
}
```

```typescript
// apps/simple-reader/main/pipeline/context.ts
import fs from "node:fs"

import type { UserPreferences } from "../preferences"
import { loadPreferences } from "../preferences"
import type { SubtitleSegment } from "../tts"

export interface PipelineContext {
  // Immutable config
  date: string
  groupId?: string
  groupName?: string
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
  // Strip prefs secrets for safety — they can be reloaded from preferences
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
  // Reload live prefs (secrets were stripped on save)
  data.prefs = loadPreferences()
  return data as PipelineContext
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/simple-reader && npx vitest run main/pipeline/__tests__/context.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/simple-reader/main/pipeline/context.ts apps/simple-reader/main/pipeline/types.ts apps/simple-reader/main/pipeline/__tests__/context.test.ts
git commit -m "feat(pipeline): add PipelineContext type and serialization"
```

---

### Task 2: Extract Stage Functions from pipeline.ts

Extract each stage from the monolithic `runPipeline` into its own file. Each stage reads what it needs from `ctx`, does its work, and returns a new `ctx` with its outputs added.

**Files:**

- Create: `apps/simple-reader/main/pipeline/stages/verify.ts`
- Create: `apps/simple-reader/main/pipeline/stages/report.ts`
- Create: `apps/simple-reader/main/pipeline/stages/podcast.ts`
- Create: `apps/simple-reader/main/pipeline/stages/audio.ts`
- Create: `apps/simple-reader/main/pipeline/stages/upload.ts`
- Create: `apps/simple-reader/main/pipeline/stages/publish.ts`
- Create: `apps/simple-reader/main/pipeline/stages/video.ts`
- Create: `apps/simple-reader/main/pipeline/stages/youtube.ts`
- Create: `apps/simple-reader/main/pipeline/stages/shorts.ts`

- [ ] **Step 1: Create verify stage**

```typescript
// apps/simple-reader/main/pipeline/stages/verify.ts
import { queryOne } from "../../database"
import { ensureRepo, verifyToken } from "../../github"
import { formatYouTubeInsights } from "../../ai-report"
import { listChannelVideos, refreshAccessToken } from "../../youtube"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

async function run(ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> {
  const { prefs } = ctx

  if (!prefs.githubToken) {
    throw new Error("GitHub PAT not configured. Please set it in Preferences.")
  }

  callbacks.onStatus("Verifying GitHub token...")
  const tokenUser = await verifyToken(prefs.githubToken)
  const owner = prefs.githubOwner || tokenUser
  callbacks.onStatus(`Authenticated as ${tokenUser}, repo owner: ${owner}`)

  await ensureRepo(prefs.githubToken, owner)

  // Resolve group name
  let groupName = ctx.groupName
  if (ctx.groupId && !groupName) {
    const group = queryOne<{ name: string }>(`SELECT name FROM feed_groups WHERE id = ?`, [
      ctx.groupId,
    ])
    groupName = group?.name
  }

  // Pre-fetch YouTube audience insights (non-fatal)
  let youtubeInsights = ctx.youtubeInsights
  if (!youtubeInsights && prefs.youtubeEnabled && prefs.youtubeRefreshToken) {
    try {
      callbacks.onStatus("Fetching YouTube audience insights...")
      const accessToken = await refreshAccessToken(
        prefs.youtubeRefreshToken,
        prefs.youtubeClientId,
        prefs.youtubeClientSecret,
      )
      const videos = await listChannelVideos(accessToken)
      youtubeInsights = formatYouTubeInsights(videos) || undefined
      if (youtubeInsights) {
        callbacks.onStatus(`YouTube insights loaded: ${videos.length} videos analyzed`)
      }
    } catch (err) {
      console.info("[pipeline:verify] YouTube insights fetch failed (non-fatal):", err)
    }
  }

  return { ...ctx, owner, groupName, youtubeInsights }
}

export const verifyStage: StageDefinition = {
  name: "verify",
  label: "Verify GitHub Token",
  shouldRun: () => true,
  run,
}
```

- [ ] **Step 2: Create report stage**

```typescript
// apps/simple-reader/main/pipeline/stages/report.ts
import { generateReportToString, generateSeoDescription } from "../../ai-report"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

async function run(ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> {
  callbacks.onStatus("Generating AI report...")
  const reportContent = await generateReportToString(
    (status) => callbacks.onStatus(status),
    ctx.groupId,
    ctx.youtubeInsights,
  )

  if (!reportContent || reportContent.length < 50) {
    throw new Error("Report generation produced no content")
  }

  callbacks.onStatus("Generating SEO description...")
  let seoDescription: string
  try {
    seoDescription = await generateSeoDescription(reportContent)
  } catch {
    seoDescription = reportContent
      .replaceAll(/[#*\n]/g, " ")
      .replaceAll(/\s+/g, " ")
      .trim()
      .slice(0, 150)
  }

  return { ...ctx, reportContent, seoDescription }
}

export const reportStage: StageDefinition = {
  name: "report",
  label: "Generate AI Report",
  shouldRun: () => true,
  run,
}
```

- [ ] **Step 3: Create podcast stage**

```typescript
// apps/simple-reader/main/pipeline/stages/podcast.ts
import { generatePodcastScriptToString } from "../../ai-report"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

async function run(ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> {
  callbacks.onStatus("Generating podcast script...")
  const podcastScript = await generatePodcastScriptToString(ctx.reportContent!, (status) =>
    callbacks.onStatus(status),
  )
  return { ...ctx, podcastScript }
}

export const podcastStage: StageDefinition = {
  name: "podcast",
  label: "Generate Podcast Script",
  shouldRun: () => true,
  run,
}
```

- [ ] **Step 4: Create audio stage**

```typescript
// apps/simple-reader/main/pipeline/stages/audio.ts
import { generateAudioToFile } from "../../tts"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

async function run(ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> {
  if (!ctx.prefs.minimaxApiKey) {
    throw new Error("MiniMax API Key not configured. Please set it in Preferences.")
  }

  callbacks.onStatus("Generating audio...")
  const ttsResult = await generateAudioToFile(ctx.podcastScript!, (status) =>
    callbacks.onStatus(status),
  )

  if (ttsResult.subtitles) {
    console.info(
      `[pipeline:audio] MiniMax returned ${ttsResult.subtitles.length} subtitle segments`,
    )
  }

  return { ...ctx, audioFilePath: ttsResult.filePath, ttsSubtitles: ttsResult.subtitles }
}

export const audioStage: StageDefinition = {
  name: "audio",
  label: "Generate Audio",
  shouldRun: () => true,
  run,
}
```

- [ ] **Step 5: Create upload stage**

```typescript
// apps/simple-reader/main/pipeline/stages/upload.ts
import fs from "node:fs"

import { createReleaseWithAudio } from "../../github"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

async function run(ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> {
  callbacks.onStatus("Uploading audio to GitHub...")
  const audioBuffer = fs.readFileSync(ctx.audioFilePath!)
  const fileName = `yomoo-${ctx.date}.mp3`
  const tag = `v${ctx.date}`
  const title = `YOMOO 每日AI快送 - ${ctx.date}`

  const audioUrl = await createReleaseWithAudio(
    ctx.prefs.githubToken,
    ctx.owner!,
    tag,
    title,
    audioBuffer,
    fileName,
  )
  return { ...ctx, audioUrl }
}

export const uploadStage: StageDefinition = {
  name: "upload",
  label: "Upload Audio",
  shouldRun: () => true,
  run,
}
```

- [ ] **Step 6: Create publish stage**

```typescript
// apps/simple-reader/main/pipeline/stages/publish.ts
import {
  commitFile,
  ensureRobotsTxt,
  getGitHubPagesUrl,
  updateRootIndex,
  updateSitemap,
} from "../../github"
import { generateEmailHtml, generateHtmlPage } from "../../html-generator"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

async function run(ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> {
  callbacks.onStatus("Publishing branded page...")
  const { prefs, date, owner, groupName, reportContent, audioUrl, podcastScript, seoDescription } =
    ctx

  const html = generateHtmlPage(reportContent!, audioUrl!, date, podcastScript!, seoDescription!)
  const htmlBase64 = Buffer.from(html).toString("base64")

  const episodePath = groupName ? `episodes/${groupName}/${date}` : `episodes/${date}`

  await commitFile(
    prefs.githubToken,
    owner!,
    "yomoo-daily",
    `${episodePath}/index.html`,
    htmlBase64,
    `feat: add episode ${date}${groupName ? ` (${groupName})` : ""}`,
  )

  const episodeTitle = groupName
    ? `${groupName} - YOMOO 每日AI快送 - ${date}`
    : `YOMOO 每日AI快送 - ${date}`
  await updateRootIndex(prefs.githubToken, owner!, date, episodeTitle)

  callbacks.onStatus("Committing email version...")
  const emailHtml = await generateEmailHtml(reportContent!, audioUrl!, date)
  const emailBase64 = Buffer.from(emailHtml).toString("base64")

  await commitFile(
    prefs.githubToken,
    owner!,
    "yomoo-daily",
    `${episodePath}/email.html`,
    emailBase64,
    `feat: add email version for ${date}${groupName ? ` (${groupName})` : ""}`,
  )

  callbacks.onStatus("Updating sitemap and robots.txt...")
  await updateSitemap(prefs.githubToken, owner!, date)
  await ensureRobotsTxt(prefs.githubToken, owner!)

  const pageUrl = getGitHubPagesUrl(owner!, date)
  return { ...ctx, pageUrl }
}

export const publishStage: StageDefinition = {
  name: "publish",
  label: "Publish HTML",
  shouldRun: () => true,
  run,
}
```

- [ ] **Step 7: Create video stage**

```typescript
// apps/simple-reader/main/pipeline/stages/video.ts
import fs from "node:fs"
import os from "node:os"

import path from "pathe"

import { transcribeAudio } from "../../deepgram"
import { fetchOGImages } from "../../og-image"
import {
  alignTranscriptWithScript,
  generateScenes,
  generateSubtitlesWithLLM,
} from "../../scene-generator"
import { downloadOGImages, renderThumbnail, renderVideo } from "../../video-render"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

async function run(ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> {
  const { prefs, date, ttsSubtitles, audioFilePath, podcastScript, reportContent } = ctx
  let alignedSegments: import("../../scene-generator").AlignedSegment[]
  let deepgramWords: import("../../deepgram").DeepgramWord[] = []
  let subtitles: import("../../scene-generator").SubtitleLine[]
  let audioDuration = 0

  if (ttsSubtitles && ttsSubtitles.length > 0) {
    callbacks.onStatus("Using MiniMax TTS subtitles (skipping Deepgram)...")
    alignedSegments = ttsSubtitles.map((s) => ({ text: s.text, start: s.start, end: s.end }))
    audioDuration = ttsSubtitles.at(-1)?.end || 0
    subtitles = ttsSubtitles.map((s) => ({ text: s.text, start: s.start, end: s.end }))
  } else {
    callbacks.onStatus("Transcribing audio with Deepgram...")
    const deepgramResult = await transcribeAudio(audioFilePath!, prefs.deepgramApiKey, {
      onStatus: (status) => callbacks.onStatus(status),
    })
    deepgramWords = deepgramResult.words

    callbacks.onStatus("Aligning transcript with script...")
    alignedSegments = alignTranscriptWithScript(deepgramWords, podcastScript!)

    if (deepgramWords.length > 0) {
      audioDuration = deepgramWords.at(-1)!.end
    }

    callbacks.onStatus("Generating subtitles with LLM...")
    subtitles = await generateSubtitlesWithLLM(alignedSegments, deepgramWords, (s) =>
      callbacks.onStatus(s),
    )
  }

  const scenes = await generateScenes(
    alignedSegments,
    reportContent!,
    audioDuration,
    (status) => callbacks.onStatus(status),
    deepgramWords,
  )
  scenes.subtitles = subtitles
  console.info(`[pipeline:video] Generated ${subtitles.length} subtitle lines`)

  callbacks.onStatus("Fetching news images...")
  await fetchOGImages(scenes, (s) => callbacks.onStatus(s))

  const tmpDir = path.join(os.tmpdir(), `yomoo-video-${date}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  const scenesJsonPath = path.join(tmpDir, "scenes.json")
  fs.writeFileSync(scenesJsonPath, JSON.stringify(scenes, null, 2), "utf-8")
  callbacks.onStatus(`Scene generation complete: ${scenes.scenes.length} scenes`)

  await downloadOGImages(scenes, scenesJsonPath, (s) => callbacks.onStatus(s))

  callbacks.onStatus("Rendering video...")
  const videoPath = path.join(tmpDir, "video.mp4")
  const thumbnailPath = path.join(tmpDir, "thumbnail.png")

  await renderVideo(scenesJsonPath, audioFilePath!, videoPath, {
    onProgress: (pct) => callbacks.onStatus(`Rendering video: ${pct}%`),
    onStatus: (status) => callbacks.onStatus(status),
  })

  await renderThumbnail(scenesJsonPath, thumbnailPath, {
    onStatus: (status) => callbacks.onStatus(status),
  })

  return { ...ctx, scenesJsonPath, videoPath, thumbnailPath, audioDuration }
}

export const videoStage: StageDefinition = {
  name: "video",
  label: "Generate Video",
  shouldRun: (ctx) =>
    !!ctx.prefs.deepgramApiKey || (!!ctx.ttsSubtitles && ctx.ttsSubtitles.length > 0),
  run,
}
```

- [ ] **Step 8: Create youtube stage**

```typescript
// apps/simple-reader/main/pipeline/stages/youtube.ts
import fs from "node:fs"

import { buildVideoDescription, refreshAccessToken, setThumbnail, uploadVideo } from "../../youtube"
import type { ScenesJson } from "../../scene-generator"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

async function run(ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> {
  const { prefs, date, pageUrl, audioUrl, scenesJsonPath, videoPath, thumbnailPath } = ctx

  callbacks.onStatus("Uploading to YouTube...")
  const accessToken = await refreshAccessToken(
    prefs.youtubeRefreshToken,
    prefs.youtubeClientId,
    prefs.youtubeClientSecret,
  )

  const scenes: ScenesJson = JSON.parse(fs.readFileSync(scenesJsonPath!, "utf-8"))
  const headlines = scenes.scenes.filter((s) => s.type === "news" && s.title).map((s) => s.title!)
  const description = buildVideoDescription(date, headlines, pageUrl!, audioUrl!)

  const videoId = await uploadVideo({
    accessToken,
    videoPath: videoPath!,
    title: scenes.youtubeTitle || `YOMOO 每日AI快送 — ${date}`,
    description,
    tags: ["AI", "每日AI快送", "YOMOO", "科技新闻", "AI新闻"],
    categoryId: "28",
    privacyStatus: "public",
    onProgress: (pct) => callbacks.onStatus(`Uploading to YouTube: ${pct}%`),
  })

  try {
    await setThumbnail(videoId, thumbnailPath!, accessToken)
    callbacks.onStatus("Thumbnail set successfully")
  } catch (thumbErr) {
    console.info("[pipeline:youtube] Thumbnail set failed (non-fatal):", thumbErr)
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
  callbacks.onStatus(`YouTube upload complete: ${youtubeUrl}`)

  return { ...ctx, youtubeUrl, youtubeAccessToken: accessToken }
}

export const youtubeStage: StageDefinition = {
  name: "youtube",
  label: "Upload to YouTube",
  shouldRun: (ctx) => {
    const videoReady = !!ctx.videoPath
    return videoReady && ctx.prefs.youtubeEnabled && !!ctx.prefs.youtubeRefreshToken
  },
  run,
}
```

- [ ] **Step 9: Create shorts stage**

```typescript
// apps/simple-reader/main/pipeline/stages/shorts.ts
import fs from "node:fs"
import os from "node:os"

import path from "pathe"

import { generateShortsScript } from "../../ai-report"
import type { SubtitleSegment } from "../../tts"
import { generateAudioToFile } from "../../tts"
import { downloadShortsOGImage, renderShorts } from "../../video-render"
import { refreshAccessToken, uploadVideo } from "../../youtube"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

async function run(ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> {
  const { prefs, date, reportContent, pageUrl } = ctx

  // 1. Generate Shorts script
  callbacks.onStatus("Generating Shorts script...")
  const shortsScript = await generateShortsScript(reportContent!, (s) => callbacks.onStatus(s))
  console.info("[pipeline:shorts] Shorts script generated:", shortsScript.title)

  // 2. Generate Shorts audio
  callbacks.onStatus("Generating Shorts audio...")
  const shortsAudioResult = await generateAudioToFile(shortsScript.script, (s) =>
    callbacks.onStatus(s),
  )
  const shortsAudioPath = shortsAudioResult.filePath
  const shortsSubtitles = shortsAudioResult.subtitles

  // 3. Match keyPoints to subtitle timestamps
  const keyPoints = matchKeyPointsToSubtitles(shortsScript.keyPoints, shortsSubtitles || [])

  // 4. Build Shorts scenes JSON
  const shortsScenesData = {
    headline: shortsScript.headline,
    ogImagePath: undefined as string | undefined,
    audioDuration: shortsSubtitles?.at(-1)?.end || 45,
    fps: 30,
    subtitles: shortsSubtitles?.map((s) => ({ text: s.text, start: s.start, end: s.end })),
    keyPoints,
    youtubeTitle: shortsScript.title,
  }

  // 5. Download OG image
  if (shortsScript.ogImageUrl) {
    const ogPath = await downloadShortsOGImage(shortsScript.ogImageUrl, (s) =>
      callbacks.onStatus(s),
    )
    if (ogPath) {
      shortsScenesData.ogImagePath = ogPath
    }
  }

  // 6. Write scenes JSON + render
  const tmpDir = path.join(os.tmpdir(), `yomoo-video-${date}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  const shortsScenesPath = path.join(tmpDir, "shorts-scenes.json")
  fs.writeFileSync(shortsScenesPath, JSON.stringify(shortsScenesData, null, 2), "utf-8")

  const shortsOutputPath = path.join(tmpDir, "shorts.mp4")
  await renderShorts(shortsScenesPath, shortsAudioPath, shortsOutputPath, {
    onProgress: (pct) => callbacks.onStatus(`Rendering Shorts: ${pct}%`),
    onStatus: (status) => callbacks.onStatus(status),
  })

  // 7. Upload Shorts to YouTube
  const accessToken =
    ctx.youtubeAccessToken ||
    (await refreshAccessToken(
      prefs.youtubeRefreshToken,
      prefs.youtubeClientId,
      prefs.youtubeClientSecret,
    ))
  callbacks.onStatus("Uploading Shorts to YouTube...")
  const shortsVideoId = await uploadVideo({
    accessToken,
    videoPath: shortsOutputPath,
    title: shortsScript.title,
    description: `${shortsScript.headline}\n\n完整版: ${pageUrl}\n\n#Shorts #AI #每日AI快送 #YOMOO`,
    tags: ["Shorts", "AI", "每日AI快送", "YOMOO", "科技新闻"],
    categoryId: "28",
    privacyStatus: "public",
    onProgress: (pct) => callbacks.onStatus(`Uploading Shorts: ${pct}%`),
  })

  const shortsUrl = `https://www.youtube.com/shorts/${shortsVideoId}`
  callbacks.onStatus(`Shorts uploaded: ${shortsUrl}`)

  return { ...ctx, shortsUrl }
}

export const shortsStage: StageDefinition = {
  name: "shorts",
  label: "Generate Shorts",
  shouldRun: (ctx) => {
    const videoReady = !!ctx.videoPath
    return (
      videoReady &&
      ctx.prefs.youtubeEnabled &&
      !!ctx.prefs.youtubeRefreshToken &&
      ctx.prefs.youtubeShortsEnabled
    )
  },
  run,
}

/**
 * Match key points to subtitle timestamps by fuzzy keyword matching.
 * Moved from pipeline.ts — pure function, no external deps.
 */
function matchKeyPointsToSubtitles(
  keyPoints: string[],
  subtitles: SubtitleSegment[],
): Array<{ text: string; showAt: number }> {
  if (keyPoints.length === 0 || subtitles.length === 0) return []

  const result: Array<{ text: string; showAt: number }> = []
  const usedTimes = new Set<number>()

  for (const kp of keyPoints) {
    const kpChars = kp.replaceAll(/[\s\p{P}]/gu, "").toLowerCase()
    if (kpChars.length === 0) continue

    let bestMatch: SubtitleSegment | undefined
    let bestScore = 0

    for (const sub of subtitles) {
      const subChars = sub.text.replaceAll(/[\s\p{P}]/gu, "").toLowerCase()
      let score = 0
      for (const char of kpChars) {
        if (subChars.includes(char)) score++
      }
      const normalizedScore = score / kpChars.length
      if (normalizedScore > bestScore && !usedTimes.has(sub.start)) {
        bestScore = normalizedScore
        bestMatch = sub
      }
    }

    if (bestMatch && bestScore > 0.4) {
      result.push({ text: kp, showAt: bestMatch.start })
      usedTimes.add(bestMatch.start)
    }
  }

  result.sort((a, b) => a.showAt - b.showAt)
  return result
}
```

- [ ] **Step 10: Commit all stage files**

```bash
git add apps/simple-reader/main/pipeline/stages/
git commit -m "feat(pipeline): extract all 9 stages into individual modules"
```

---

### Task 3: Build the Orchestrator

The orchestrator wires stages together, manages progress callbacks, and provides `runFrom()` for partial re-runs.

**Files:**

- Create: `apps/simple-reader/main/pipeline/orchestrator.ts`
- Test: `apps/simple-reader/main/pipeline/__tests__/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test for orchestrator**

```typescript
// apps/simple-reader/main/pipeline/__tests__/orchestrator.test.ts
import os from "node:os"

import { describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({ app: { getPath: () => os.tmpdir() } }))
vi.mock("../../preferences", () => ({
  loadPreferences: vi.fn(() => ({
    language: "en",
    interests: [],
    reportStyle: "detailed",
    timeRange: 24,
    minimaxApiKey: "test",
    ttsVoiceId: "",
    ttsModel: "",
    githubToken: "ghp_test",
    githubOwner: "test",
    pipelineSchedule: "",
    workerUrl: "",
    workerSecret: "",
    deepgramApiKey: "",
    youtubeClientId: "",
    youtubeClientSecret: "",
    youtubeRefreshToken: "",
    youtubeEnabled: false,
    youtubeShortsEnabled: false,
  })),
}))

import { createContext } from "../context"
import type { StageDefinition } from "../types"
import { buildStageList, resolveStartIndex } from "../orchestrator"

const makeStage = (name: string, shouldRun = true): StageDefinition => ({
  name: name as any,
  label: name,
  shouldRun: () => shouldRun,
  run: vi.fn(async (ctx) => ctx),
})

describe("orchestrator", () => {
  it("buildStageList filters out disabled stages", () => {
    const ctx = createContext()
    const stages = [makeStage("verify"), makeStage("report"), makeStage("video", false)]
    const filtered = buildStageList(stages, ctx)
    expect(filtered.map((s) => s.name)).toEqual(["verify", "report"])
  })

  it("resolveStartIndex returns 0 for full run", () => {
    const stages = [makeStage("verify"), makeStage("report"), makeStage("podcast")]
    expect(resolveStartIndex(stages, undefined)).toBe(0)
  })

  it("resolveStartIndex finds correct stage by name", () => {
    const stages = [makeStage("verify"), makeStage("report"), makeStage("podcast")]
    expect(resolveStartIndex(stages, "report")).toBe(1)
  })

  it("resolveStartIndex throws for unknown stage", () => {
    const stages = [makeStage("verify")]
    expect(() => resolveStartIndex(stages, "unknown" as any)).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/simple-reader && npx vitest run main/pipeline/__tests__/orchestrator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement orchestrator.ts**

```typescript
// apps/simple-reader/main/pipeline/orchestrator.ts
import fs from "node:fs"
import os from "node:os"

import path from "pathe"

import type { PipelineContext } from "./context"
import { createContext, saveContext } from "./context"
import { audioStage } from "./stages/audio"
import { podcastStage } from "./stages/podcast"
import { publishStage } from "./stages/publish"
import { reportStage } from "./stages/report"
import { shortsStage } from "./stages/shorts"
import { uploadStage } from "./stages/upload"
import { verifyStage } from "./stages/verify"
import { videoStage } from "./stages/video"
import { youtubeStage } from "./stages/youtube"
import type { StageName, StageDefinition } from "./types"

export interface PipelineResult {
  pageUrl: string
  audioUrl: string
  date: string
  youtubeUrl?: string
}

export interface PipelineCallbacks {
  onStage: (stage: string) => void
  onStatus: (status: string) => void
  onProgress: (step: number, total: number) => void
  onDone: (result: PipelineResult) => void
  onError: (stage: string, error: string) => void
}

const ALL_STAGES: StageDefinition[] = [
  verifyStage,
  reportStage,
  podcastStage,
  audioStage,
  uploadStage,
  publishStage,
  videoStage,
  youtubeStage,
  shortsStage,
]

export function buildStageList(stages: StageDefinition[], ctx: PipelineContext): StageDefinition[] {
  return stages.filter((s) => s.shouldRun(ctx))
}

export function resolveStartIndex(stages: StageDefinition[], startFrom?: StageName): number {
  if (!startFrom) return 0
  const idx = stages.findIndex((s) => s.name === startFrom)
  if (idx === -1) throw new Error(`Unknown stage: ${startFrom}`)
  return idx
}

export async function runPipeline(callbacks: PipelineCallbacks, groupId?: string): Promise<void> {
  const ctx = createContext({ groupId })
  await executePipeline(ctx, ALL_STAGES, callbacks)
}

export async function runFrom(
  startStage: StageName,
  ctx: PipelineContext,
  callbacks: PipelineCallbacks,
): Promise<void> {
  await executePipeline(ctx, ALL_STAGES, callbacks, startStage)
}

async function executePipeline(
  initialCtx: PipelineContext,
  allStages: StageDefinition[],
  callbacks: PipelineCallbacks,
  startFrom?: StageName,
): Promise<void> {
  const activeStages = buildStageList(allStages, initialCtx)
  const startIdx = resolveStartIndex(activeStages, startFrom)
  const stagesToRun = activeStages.slice(startIdx)
  const total = stagesToRun.length

  let ctx = initialCtx
  let step = 0

  for (const stage of stagesToRun) {
    callbacks.onStage(stage.name)
    callbacks.onProgress(step, total)

    try {
      ctx = await stage.run(ctx, { onStatus: callbacks.onStatus })
    } catch (err) {
      // Video, YouTube, Shorts failures are non-fatal
      const nonFatal: StageName[] = ["video", "youtube", "shorts"]
      if (nonFatal.includes(stage.name)) {
        console.info(`[pipeline] ${stage.name} failed (non-fatal):`, err)
        callbacks.onStatus(`${stage.label} skipped: ${err}`)
      } else {
        callbacks.onError(stage.name, String(err))
        // Save context snapshot for debugging
        saveContextSnapshot(ctx)
        return
      }
    }

    step++

    // Save context snapshot after each stage for debugging / partial re-runs
    saveContextSnapshot(ctx)
  }

  callbacks.onProgress(total, total)
  callbacks.onDone({
    pageUrl: ctx.pageUrl || "",
    audioUrl: ctx.audioUrl || "",
    date: ctx.date,
    youtubeUrl: ctx.youtubeUrl,
  })
}

function saveContextSnapshot(ctx: PipelineContext): void {
  try {
    const snapshotDir = path.join(os.tmpdir(), `yomoo-video-${ctx.date}`)
    fs.mkdirSync(snapshotDir, { recursive: true })
    saveContext(ctx, path.join(snapshotDir, "pipeline-context.json"))
  } catch {
    // Non-fatal: snapshot saving should never break the pipeline
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/simple-reader && npx vitest run main/pipeline/__tests__/orchestrator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/simple-reader/main/pipeline/orchestrator.ts apps/simple-reader/main/pipeline/__tests__/orchestrator.test.ts
git commit -m "feat(pipeline): add orchestrator with runPipeline and runFrom"
```

---

### Task 4: Replace Old pipeline.ts and Update Callers

Replace the monolithic `pipeline.ts` with a thin re-export wrapper, update `ipc-handlers.ts` to use the new orchestrator, and remove `runVideoOnly`.

**Files:**

- Modify: `apps/simple-reader/main/pipeline.ts` (replace entire content)
- Modify: `apps/simple-reader/main/ipc-handlers.ts:325-407`

- [ ] **Step 1: Replace pipeline.ts with re-export wrapper**

Replace the entire contents of `apps/simple-reader/main/pipeline.ts` with:

```typescript
// apps/simple-reader/main/pipeline.ts
// Thin re-export for backward compatibility.
// All logic now lives in pipeline/ directory.
export { runPipeline, runFrom } from "./pipeline/orchestrator"
export type { PipelineCallbacks, PipelineResult } from "./pipeline/orchestrator"
export { createContext, loadContext, saveContext } from "./pipeline/context"
export type { PipelineContext } from "./pipeline/context"
```

- [ ] **Step 2: Update ipc-handlers.ts — replace runVideoOnly with runFrom**

In `apps/simple-reader/main/ipc-handlers.ts`, replace the `run-yomoo-video-only` handler (lines ~369-407) with:

```typescript
// --- YOMOO Video-Only Pipeline ---
ipcMain.handle("run-yomoo-video-only", async (event) => {
  console.info("[ipc] run-yomoo-video-only called")
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { success: false, error: "No window found" }

  try {
    const { runFrom, loadContext } = await import("./pipeline")
    const { createContext } = await import("./pipeline/context")
    const { loadPreferences } = await import("./preferences")
    const { queryOne } = await import("./database")
    const { getGitHubPagesUrl } = await import("./github")
    const os = await import("node:os")
    const fs = await import("node:fs")
    const path = await import("pathe")

    const prefs = loadPreferences()
    const date = new Date().toISOString().slice(0, 10)

    // Load report and podcast from DB
    const report = queryOne<{ content: string }>(
      "SELECT content FROM reports WHERE type = 'report' AND title LIKE ? ORDER BY created_at DESC LIMIT 1",
      [`%${date}%`],
    )
    const podcast = queryOne<{ content: string }>(
      "SELECT content FROM reports WHERE type = 'podcast' AND title LIKE ? ORDER BY created_at DESC LIMIT 1",
      [`%${date}%`],
    )
    if (!report?.content) return { success: false, error: `No report found for ${date}` }
    if (!podcast?.content) return { success: false, error: `No podcast found for ${date}` }

    // Find audio file
    const audioDir = path.join(
      process.env.HOME || os.homedir(),
      "Library",
      "Application Support",
      "simple-reader",
      "audio",
    )
    const audioFiles = fs.existsSync(audioDir)
      ? fs
          .readdirSync(audioDir)
          .filter((f: string) => f.endsWith(".mp3"))
          .sort()
          .reverse()
      : []
    if (audioFiles.length === 0) return { success: false, error: "No audio file found" }

    const owner = prefs.githubOwner || "YOMOO-LLC"

    // Build a pre-filled context and start from "video" stage
    const ctx = createContext({
      date,
      prefs,
      owner,
      reportContent: report.content,
      podcastScript: podcast.content,
      audioFilePath: path.join(audioDir, audioFiles[0]!),
      pageUrl: getGitHubPagesUrl(owner, date),
      audioUrl: `https://github.com/${owner}/yomoo-daily/releases/download/v${date}/yomoo-${date}.mp3`,
    })

    await runFrom("video", ctx, {
      onStage: (stage) => win.webContents.send("pipeline-stage", stage),
      onStatus: (status) => win.webContents.send("pipeline-status", status),
      onProgress: (step, total) => win.webContents.send("pipeline-progress", step, total),
      onDone: (result) => win.webContents.send("pipeline-done", result),
      onError: (stage, error) => win.webContents.send("pipeline-error", stage, error),
    })
    return { success: true }
  } catch (err) {
    console.error("[ipc] run-yomoo-video-only error:", err)
    win.webContents.send("pipeline-error", "init", String(err))
    return { success: false, error: String(err) }
  }
})
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `cd apps/simple-reader && npx vitest run`
Expected: All existing tests + new tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/simple-reader/main/pipeline.ts apps/simple-reader/main/ipc-handlers.ts
git commit -m "refactor(pipeline): replace monolith with modular orchestrator, remove runVideoOnly"
```

---

### Task 5: Write Integration Test for Shorts Stage in Isolation

This is the key test that validates the entire modularization effort — running the Shorts stage without the rest of the pipeline.

**Files:**

- Create: `apps/simple-reader/main/pipeline/__tests__/shorts.test.ts`

- [ ] **Step 1: Write the Shorts stage isolation test**

```typescript
// apps/simple-reader/main/pipeline/__tests__/shorts.test.ts
import os from "node:os"

import { describe, expect, it, vi } from "vitest"

// Mock electron
vi.mock("electron", () => ({ app: { getPath: () => os.tmpdir(), getAppPath: () => "/tmp" } }))

// Mock preferences
vi.mock("../../preferences", () => ({
  loadPreferences: vi.fn(() => ({
    language: "zh-CN",
    interests: [],
    reportStyle: "detailed",
    timeRange: 24,
    minimaxApiKey: "test-minimax-key",
    ttsVoiceId: "Chinese_Male_1",
    ttsModel: "speech-2.8-hd",
    githubToken: "ghp_test",
    githubOwner: "test-owner",
    pipelineSchedule: "",
    workerUrl: "",
    workerSecret: "",
    deepgramApiKey: "",
    youtubeClientId: "yt-client",
    youtubeClientSecret: "yt-secret",
    youtubeRefreshToken: "yt-refresh",
    youtubeEnabled: true,
    youtubeShortsEnabled: true,
  })),
}))

// Mock external services
vi.mock("../../ai-report", () => ({
  generateShortsScript: vi.fn(async () => ({
    title: "AI自动写代码了！GitHub Copilot大升级",
    headline: "Copilot大升级",
    script: "你知道吗，GitHub Copilot 现在可以自动写代码了。关注看更多每日AI快送。",
    ogImageUrl: "https://example.com/og.jpg",
    keyPoints: ["自动写代码", "实时补全", "多语言支持"],
  })),
}))

vi.mock("../../tts", () => ({
  generateAudioToFile: vi.fn(async () => ({
    filePath: "/tmp/shorts-audio.mp3",
    subtitles: [
      { text: "你知道吗", start: 0, end: 1.5 },
      { text: "GitHub Copilot 现在可以自动写代码了", start: 1.5, end: 4.0 },
      { text: "关注看更多每日AI快送", start: 4.0, end: 6.0 },
    ],
  })),
}))

vi.mock("../../video-render", () => ({
  downloadShortsOGImage: vi.fn(async () => "images/shorts-og.jpg"),
  renderShorts: vi.fn(async () => "/tmp/shorts.mp4"),
}))

vi.mock("../../youtube", () => ({
  refreshAccessToken: vi.fn(async () => "mock-access-token"),
  uploadVideo: vi.fn(async () => "mock-video-id"),
}))

import { createContext } from "../context"
import { shortsStage } from "../stages/shorts"

describe("shorts stage in isolation", () => {
  it("should run shorts stage with pre-filled context", async () => {
    const ctx = createContext({
      date: "2026-04-03",
      reportContent: "# AI快送\n\n## GitHub Copilot 大升级\n\nGitHub今天宣布Copilot获得重大更新...",
      pageUrl: "https://test-owner.github.io/yomoo-daily/episodes/2026-04-03/",
      videoPath: "/tmp/video.mp4",
      youtubeAccessToken: "existing-token",
    })

    const statuses: string[] = []
    const result = await shortsStage.run(ctx, {
      onStatus: (s) => statuses.push(s),
    })

    expect(result.shortsUrl).toBe("https://www.youtube.com/shorts/mock-video-id")
    expect(statuses).toContain("Generating Shorts script...")
    expect(statuses).toContain("Generating Shorts audio...")
  })

  it("shouldRun returns true when video + youtube + shorts all enabled", () => {
    const ctx = createContext({
      videoPath: "/tmp/video.mp4",
    })
    // The mock prefs have youtubeEnabled=true, youtubeShortsEnabled=true, youtubeRefreshToken set
    expect(shortsStage.shouldRun(ctx)).toBe(true)
  })

  it("shouldRun returns false when no video was generated", () => {
    const ctx = createContext()
    // videoPath is undefined
    expect(shortsStage.shouldRun(ctx)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd apps/simple-reader && npx vitest run main/pipeline/__tests__/shorts.test.ts`
Expected: PASS — Shorts stage runs with mocked dependencies, no full pipeline needed

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/main/pipeline/__tests__/shorts.test.ts
git commit -m "test(pipeline): add Shorts stage isolation test"
```

---

### Task 6: Update vitest config and verify all tests

**Files:**

- Modify: `apps/simple-reader/vitest.config.ts`

- [ ] **Step 1: Update vitest config to include pipeline tests**

The existing config `include: ["main/**/*.test.ts"]` already covers `main/pipeline/__tests__/*.test.ts` since it uses `**` glob. Verify by running all tests.

Run: `cd apps/simple-reader && npx vitest run`
Expected: All tests pass (existing + new pipeline tests)

- [ ] **Step 2: Run typecheck**

Run: `cd apps/simple-reader && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit any fixes if needed, then final commit**

```bash
git add -A
git commit -m "refactor(pipeline): complete modularization — 9 independent stages with serializable context"
```

---

## Summary of What Changed

| Before                                        | After                                                               |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `pipeline.ts` — 869-line monolith             | `pipeline/orchestrator.ts` + 9 stage files (~60-100 lines each)     |
| `runVideoOnly` — 200 lines of duplicated code | Deleted. Replaced by `runFrom("video", ctx)`                        |
| Can't test Shorts without full pipeline       | `shortsStage.run(ctx, callbacks)` — direct call with mocked context |
| No way to resume from failure                 | `saveContext()` after each stage → `loadContext()` + `runFrom()`    |
| Pipeline state = local variables              | `PipelineContext` — typed, serializable, inspectable                |
