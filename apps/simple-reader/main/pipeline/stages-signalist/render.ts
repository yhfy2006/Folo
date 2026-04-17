import { execFile } from "node:child_process"
import fs from "node:fs"

import path from "pathe"

import { copyBgmToPublic, copySegmentToPublic, renderSignalistShorts } from "../../signalist-render"
import type { PipelineContext } from "../context"
import type { ExtractedClip, RenderedVideo, ShortsScript } from "../signalist-types"
import type { StageCallbacks, StageDefinition } from "../types"
import { findYtDlp } from "./transcribe"

// ── SRT time parser ──────────────────────────────────────────────────

/**
 * Convert an SRT timestamp ("HH:MM:SS,mmm") to total seconds.
 * Example: "00:12:34,567" → 754.567
 */
export function srtToSeconds(time: string): number {
  const match = time.match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/)
  if (!match) return 0
  const hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)
  const seconds = Number.parseInt(match[3], 10)
  const millis = Number.parseInt(match[4], 10)
  return hours * 3600 + minutes * 60 + seconds + millis / 1000
}

// ── execFile wrapper ─────────────────────────────────────────────────

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

// ── BGM picker ───────────────────────────────────────────────────────

function pickRandomBgm(bgmDir: string): string | null {
  if (!bgmDir || !fs.existsSync(bgmDir)) return null
  const files = fs.readdirSync(bgmDir).filter((f) => /\.(?:mp3|wav|m4a|aac)$/i.test(f))
  if (files.length === 0) return null
  const chosen = files[Math.floor(Math.random() * files.length)]!
  return path.join(bgmDir, chosen)
}

// ── Core per-clip render function ────────────────────────────────────

const FPS = 30
const TEXT_CARD_DURATION_FRAMES = 90 // 3 seconds at 30 fps

/**
 * Download, render, and return a RenderedVideo for one clip+script pair.
 * Returns null if any critical step fails.
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
  onStatus: (msg: string) => void,
): Promise<RenderedVideo | null> {
  const clipId = clip.id

  // 1. Download the video segment via yt-dlp --download-sections
  const startSec = srtToSeconds(clip.startTime)
  const endSec = srtToSeconds(clip.endTime)
  const segmentName = `signalist-segment-${sourceVideoId}-${clipId}.mp4`
  const segmentPath = path.join(workDir, segmentName)

  onStatus(
    `[render] Downloading segment ${clipId} (${startSec.toFixed(1)}s–${endSec.toFixed(1)}s) from ${videoUrl}`,
  )

  const ytDlp = findYtDlp()
  try {
    await exec(
      ytDlp,
      [
        "--download-sections",
        `*${startSec}-${endSec}`,
        "--force-keyframes-at-cuts",
        "-f",
        "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
        "--merge-output-format",
        "mp4",
        "-o",
        segmentPath,
        videoUrl,
      ],
      workDir,
    )
  } catch (err) {
    console.error(`[render] yt-dlp segment download failed for clip ${clipId}:`, err)
    onStatus(`[render] Segment download failed for clip ${clipId}, skipping`)
    return null
  }

  if (!fs.existsSync(segmentPath)) {
    console.error(`[render] Segment file not found after download: ${segmentPath}`)
    onStatus(`[render] Segment file missing for clip ${clipId}, skipping`)
    return null
  }

  // 2. Copy segment to Remotion public/
  const publicSegmentName = copySegmentToPublic(segmentPath, segmentName)

  // 3. Pick a random BGM and copy to public/
  const bgmDir = channel.signalist?.bgmDir ?? ""
  const bgmSourcePath = pickRandomBgm(bgmDir)
  let bgmPublicName: string | undefined
  if (bgmSourcePath) {
    bgmPublicName = copyBgmToPublic(bgmSourcePath)
    onStatus(`[render] BGM: ${path.basename(bgmSourcePath)}`)
  } else {
    onStatus(`[render] No BGM found in bgmDir="${bgmDir}", rendering without music`)
  }

  // 4. Build Remotion segments array
  //    Pattern: opening card → (transition card → clip segment)* → closing card
  type RemotionSegment = {
    type: "text" | "clip"
    text?: string
    videoPath?: string
    subtitleText?: string
    durationFrames: number
  }

  const segments: RemotionSegment[] = []

  // Opening card
  if (script.openingCard) {
    segments.push({
      type: "text",
      text: script.openingCard,
      durationFrames: TEXT_CARD_DURATION_FRAMES,
    })
  }

  if (script.segments.length > 0) {
    // Interleave: transition text card → clip segment
    for (const seg of script.segments) {
      // Transition text card
      if (seg.textCard) {
        segments.push({
          type: "text",
          text: seg.textCard,
          durationFrames: TEXT_CARD_DURATION_FRAMES,
        })
      }

      // Video clip sub-segment
      const segStartSec = srtToSeconds(seg.clipStart)
      const segEndSec = srtToSeconds(seg.clipEnd)
      const durationSec = Math.max(1, segEndSec - segStartSec)
      const durationFrames = Math.round(durationSec * FPS)

      segments.push({
        type: "clip",
        videoPath: publicSegmentName,
        subtitleText: seg.textCard,
        durationFrames,
      })
    }
  } else {
    // No segments — use the full clip as one video segment
    const fullDurationSec = Math.max(1, endSec - startSec)
    segments.push({
      type: "clip",
      videoPath: publicSegmentName,
      durationFrames: Math.round(fullDurationSec * FPS),
    })
  }

  // Closing card
  if (script.closingCard) {
    segments.push({
      type: "text",
      text: script.closingCard,
      durationFrames: TEXT_CARD_DURATION_FRAMES,
    })
  }

  const totalDurationSeconds = segments.reduce((acc, seg) => acc + seg.durationFrames / FPS, 0)

  // 5. Write props JSON to workDir
  const propsData = {
    segments,
    totalDurationSeconds,
    fps: FPS,
    bgmPath: bgmPublicName,
  }
  const propsPath = path.join(workDir, `signalist-props-${sourceVideoId}-${clipId}.json`)
  fs.writeFileSync(propsPath, JSON.stringify(propsData, null, 2), "utf-8")
  onStatus(`[render] Props written: ${propsPath}`)

  // 6. Render via Remotion
  const outputPath = path.join(workDir, `signalist-shorts-${sourceVideoId}-${clipId}.mp4`)
  onStatus(`[render] Rendering clip ${clipId} → ${outputPath}`)

  try {
    await renderSignalistShorts(propsPath, outputPath, {
      onStatus,
      onProgress: (pct) => {
        onStatus(`[render] Clip ${clipId}: ${pct}%`)
      },
    })
  } catch (err) {
    console.error(`[render] Remotion render failed for clip ${clipId}:`, err)
    onStatus(`[render] Render failed for clip ${clipId}: ${err}`)
    return null
  }

  // 7. Build description
  const descriptionTemplate = channel.youtube?.descriptionTemplate
  let description: string
  if (descriptionTemplate) {
    description = descriptionTemplate
      .replaceAll("{{title}}", script.suggestedTitle)
      .replaceAll("{{sourceTitle}}", sourceTitle)
      .replaceAll("{{sourceChannel}}", sourceChannel)
      .replaceAll("{{sourceVideoId}}", sourceVideoId)
      .replaceAll("{{topic}}", clip.topic)
  } else {
    description = `${script.suggestedTitle}\n\nSource: ${sourceTitle} by ${sourceChannel}\nhttps://youtube.com/watch?v=${sourceVideoId}`
  }

  // 8. Build tags — merge script tags with channel tags
  const channelTags = channel.youtube?.tags ?? []
  const tags = [...new Set([...script.suggestedTags, ...channelTags])]

  onStatus(`[render] Clip ${clipId} rendered successfully`)

  return {
    clipId,
    filePath: outputPath,
    title: script.suggestedTitle,
    description,
    tags,
    sourceVideoId,
    sourceTitle,
    sourceChannel,
  }
}

// ── Stage definition ─────────────────────────────────────────────────

export const renderStage: StageDefinition = {
  name: "render",
  label: "Render Shorts",

  shouldRun: (ctx: PipelineContext): boolean => ctx.channel?.pipelineType === "signalist",

  run: async (ctx: PipelineContext, _callbacks: StageCallbacks): Promise<PipelineContext> => {
    // Per-clip rendering happens in the orchestrator's per-video loop
    // via the exported renderOneShorts() function.
    return ctx
  },
}
