import fs from "node:fs"
import os from "node:os"

import path from "pathe"

import { queryAll } from "../database"
import { loadChannelByGroupId } from "./channel-loader"
import type { PipelineContext } from "./context"
import { createContext, saveContext } from "./context"
import { isVideoProcessed, markVideoProcessed, pruneProcessedVideos } from "./signalist-dedup"
import type { CandidateVideo, RenderedVideo } from "./signalist-types"
import { audioStage } from "./stages/audio"
import { discoverStage } from "./stages/discover"
import { podcastStage } from "./stages/podcast"
import { publishStage } from "./stages/publish"
import { reflectStage } from "./stages/reflect"
import { reportStage } from "./stages/report"
import { shortsStage } from "./stages/shorts"
import { uploadStage } from "./stages/upload"
import { verifyStage } from "./stages/verify"
import { videoStage } from "./stages/video"
import { youtubeStage } from "./stages/youtube"
import { SIGNALIST_STAGES } from "./stages-signalist"
import { extractHighlights } from "./stages-signalist/extract"
import { renderOneShorts } from "./stages-signalist/render"
import { generateScripts } from "./stages-signalist/script"
import { transcribeVideo } from "./stages-signalist/transcribe"
import type { StageDefinition, StageName } from "./types"

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
  reflectStage,
  discoverStage,
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

export async function runPipeline(
  callbacks: PipelineCallbacks,
  groupId?: string,
  options?: { dryRun?: boolean },
): Promise<void> {
  const ctx = createContext({ groupId, dryRun: options?.dryRun })

  if (groupId) {
    const channel = loadChannelByGroupId(groupId)
    if (channel) {
      ctx.channel = channel
    }
  }

  if (ctx.channel?.pipelineType === "signalist") {
    await executeSignalistPipeline(ctx, callbacks)
  } else {
    await executePipeline(ctx, ALL_STAGES, callbacks)
  }
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
  let activeStages = buildStageList(allStages, initialCtx)

  // Filter to only channel-allowed stages when a channel is bound
  if (initialCtx.channel) {
    activeStages = activeStages.filter((s) => initialCtx.channel!.stages.includes(s.name))
  }

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
      const nonFatal: StageName[] = ["reflect", "discover", "video", "youtube", "shorts"]
      if (nonFatal.includes(stage.name)) {
        console.info(`[pipeline] ${stage.name} failed (non-fatal):`, err)
        callbacks.onStatus(`${stage.label} skipped: ${err}`)
      } else {
        callbacks.onError(stage.name, String(err))
        saveContextSnapshot(ctx)
        return
      }
    }

    step++
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

async function executeSignalistPipeline(
  initialCtx: PipelineContext,
  callbacks: PipelineCallbacks,
): Promise<void> {
  let ctx = initialCtx
  const channel = ctx.channel!

  // Prune old dedup entries
  pruneProcessedVideos(channel.id)

  // Step 1: Discover
  callbacks.onStage("discover")
  callbacks.onProgress(0, 8)
  try {
    const discoverDef = SIGNALIST_STAGES.find((s) => s.name === "discover")!
    ctx = await discoverDef.run(ctx, { onStatus: callbacks.onStatus })
  } catch (err) {
    callbacks.onStatus(`Discover skipped: ${err}`)
  }

  // Build candidate videos from discovery signals
  const candidates: CandidateVideo[] = []
  if (ctx.discoverySignals) {
    for (const signal of ctx.discoverySignals) {
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
        duration: 0,
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
    const { video } = screened
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
          categoryId: "22",
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
}

function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]!
  }
  return null
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
