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

export const videoStage: StageDefinition = {
  name: "video",
  label: "Generate Video",
  shouldRun: (ctx: PipelineContext) =>
    !!ctx.prefs.deepgramApiKey || (!!ctx.ttsSubtitles && ctx.ttsSubtitles.length > 0),
  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    const { prefs, date, audioFilePath, podcastScript, reportContent, ttsSubtitles } = ctx

    let alignedSegments: import("../../scene-generator").AlignedSegment[]
    let deepgramWords: import("../../deepgram").DeepgramWord[] = []
    let subtitles: import("../../scene-generator").SubtitleLine[]
    let audioDuration = 0

    if (ttsSubtitles && ttsSubtitles.length > 0) {
      // Use MiniMax TTS subtitles directly — skip Deepgram transcription
      callbacks.onStatus("Using MiniMax TTS subtitles (skipping Deepgram)...")
      console.info("[video] Using MiniMax subtitles, skipping Deepgram")

      // Convert TTS subtitles to aligned segments for scene generation
      alignedSegments = ttsSubtitles.map((s) => ({
        text: s.text,
        start: s.start,
        end: s.end,
      }))

      // Get audio duration from last subtitle
      audioDuration = ttsSubtitles.at(-1)?.end || 0

      // TTS subtitles are already sentence-level, use directly as video subtitles
      subtitles = ttsSubtitles.map((s) => ({
        text: s.text,
        start: s.start,
        end: s.end,
      }))
    } else {
      // Fallback: use Deepgram for transcription + alignment
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

      // Generate subtitles using LLM
      callbacks.onStatus("Generating subtitles with LLM...")
      subtitles = await generateSubtitlesWithLLM(alignedSegments, deepgramWords, (s) =>
        callbacks.onStatus(s),
      )
    }

    // Generate scenes
    const scenes = await generateScenes(
      alignedSegments,
      reportContent!,
      audioDuration,
      (status) => callbacks.onStatus(status),
      deepgramWords,
    )

    scenes.subtitles = subtitles
    console.info(`[video] Generated ${subtitles.length} subtitle lines`)

    // Fetch OG images for news scenes
    callbacks.onStatus("Fetching news images...")
    await fetchOGImages(scenes, (s) => callbacks.onStatus(s))

    // Write scenes.json to temp dir
    const tmpDir = path.join(os.tmpdir(), `yomoo-video-${date}`)
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }
    const scenesJsonPath = path.join(tmpDir, "scenes.json")
    fs.writeFileSync(scenesJsonPath, JSON.stringify(scenes, null, 2), "utf-8")
    console.info("[video] Scenes written to:", scenesJsonPath)
    callbacks.onStatus(`Scene generation complete: ${scenes.scenes.length} scenes`)

    // Download OG images to Remotion public/ dir
    await downloadOGImages(scenes, scenesJsonPath, (s) => callbacks.onStatus(s))

    // Render video
    callbacks.onStatus("Rendering video...")
    const outputVideoPath = path.join(tmpDir, "video.mp4")
    const thumbnailOutputPath = path.join(tmpDir, "thumbnail.png")

    await renderVideo(scenesJsonPath, audioFilePath!, outputVideoPath, {
      onProgress: (pct) => callbacks.onStatus(`Rendering video: ${pct}%`),
      onStatus: (status) => callbacks.onStatus(status),
    })

    // Render thumbnail
    await renderThumbnail(scenesJsonPath, thumbnailOutputPath, {
      onStatus: (status) => callbacks.onStatus(status),
    })

    console.info("[video] Video rendered:", outputVideoPath)
    console.info("[video] Thumbnail rendered:", thumbnailOutputPath)

    return {
      ...ctx,
      scenesJsonPath,
      videoPath: outputVideoPath,
      thumbnailPath: thumbnailOutputPath,
      audioDuration,
    }
  },
}
