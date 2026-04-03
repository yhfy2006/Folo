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

/**
 * Match key points to subtitle timestamps by fuzzy keyword matching.
 * For each key point, finds the subtitle line that best matches it
 * and uses that subtitle's start time as the showAt timestamp.
 */
function matchKeyPointsToSubtitles(
  keyPoints: string[],
  subtitles: SubtitleSegment[],
): Array<{ text: string; showAt: number }> {
  if (keyPoints.length === 0 || subtitles.length === 0) return []

  const result: Array<{ text: string; showAt: number }> = []
  const usedTimes = new Set<number>()

  for (const kp of keyPoints) {
    // Extract meaningful chars from keyPoint for matching
    const kpChars = kp.replaceAll(/[\s\p{P}]/gu, "").toLowerCase()
    if (kpChars.length === 0) continue

    let bestMatch: SubtitleSegment | undefined
    let bestScore = 0

    for (const sub of subtitles) {
      const subChars = sub.text.replaceAll(/[\s\p{P}]/gu, "").toLowerCase()
      // Count how many chars from keyPoint appear in this subtitle
      let score = 0
      for (const char of kpChars) {
        if (subChars.includes(char)) score++
      }
      // Normalize by keyPoint length
      const normalizedScore = score / kpChars.length
      if (normalizedScore > bestScore && !usedTimes.has(sub.start)) {
        bestScore = normalizedScore
        bestMatch = sub
      }
    }

    // Only include if match quality is reasonable (>40% char overlap)
    if (bestMatch && bestScore > 0.4) {
      result.push({ text: kp, showAt: bestMatch.start })
      usedTimes.add(bestMatch.start)
    }
  }

  // Sort by appearance time
  result.sort((a, b) => a.showAt - b.showAt)
  return result
}

export const shortsStage: StageDefinition = {
  name: "shorts",
  label: "Generate & Upload YouTube Shorts",
  shouldRun: (ctx: PipelineContext) =>
    !!ctx.videoPath &&
    ctx.prefs.youtubeEnabled &&
    !!ctx.prefs.youtubeRefreshToken &&
    ctx.prefs.youtubeShortsEnabled,
  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    const { prefs, date, pageUrl, youtubeAccessToken } = ctx
    const tmpDir = path.join(os.tmpdir(), `yomoo-video-${date}`)
    fs.mkdirSync(tmpDir, { recursive: true })

    // 9a: Generate Shorts script
    callbacks.onStatus("Generating Shorts script...")
    const shortsScript = await generateShortsScript(ctx.reportContent!, (s) =>
      callbacks.onStatus(s),
    )
    console.info("[shorts] Shorts script generated:", shortsScript.title)

    // 9b: Generate Shorts audio
    callbacks.onStatus("Generating Shorts audio...")
    const shortsAudioResult = await generateAudioToFile(shortsScript.script, (s) =>
      callbacks.onStatus(s),
    )
    const shortsAudioPath = shortsAudioResult.filePath
    const shortsSubtitles = shortsAudioResult.subtitles

    // 9c: Match keyPoints to subtitle timestamps
    const keyPoints = matchKeyPointsToSubtitles(shortsScript.keyPoints, shortsSubtitles || [])

    // 9d: Build Shorts scenes JSON
    const shortsScenesData = {
      headline: shortsScript.headline,
      ogImagePath: undefined as string | undefined,
      audioDuration: shortsSubtitles?.at(-1)?.end || 45,
      fps: 30,
      subtitles: shortsSubtitles?.map((s) => ({
        text: s.text,
        start: s.start,
        end: s.end,
      })),
      keyPoints,
      youtubeTitle: shortsScript.title,
    }

    // 9d: Download OG image
    if (shortsScript.ogImageUrl) {
      const ogPath = await downloadShortsOGImage(shortsScript.ogImageUrl, (s) =>
        callbacks.onStatus(s),
      )
      if (ogPath) {
        shortsScenesData.ogImagePath = ogPath
      }
    }

    // Write Shorts scenes JSON
    const shortsScenesPath = path.join(tmpDir, "shorts-scenes.json")
    fs.writeFileSync(shortsScenesPath, JSON.stringify(shortsScenesData, null, 2), "utf-8")

    // 9e: Render Shorts video
    const shortsOutputPath = path.join(tmpDir, "shorts.mp4")
    await renderShorts(shortsScenesPath, shortsAudioPath, shortsOutputPath, {
      onProgress: (pct) => callbacks.onStatus(`Rendering Shorts: ${pct}%`),
      onStatus: (status) => callbacks.onStatus(status),
    })

    // 9f: Upload Shorts to YouTube
    // accessToken is guaranteed to be set when shortsEnabled (which requires youtubeEnabled)
    const shortsAccessToken =
      youtubeAccessToken ||
      (await refreshAccessToken(
        prefs.youtubeRefreshToken,
        prefs.youtubeClientId,
        prefs.youtubeClientSecret,
      ))
    callbacks.onStatus("Uploading Shorts to YouTube...")
    const shortsVideoId = await uploadVideo({
      accessToken: shortsAccessToken,
      videoPath: shortsOutputPath,
      title: shortsScript.title,
      description: `${shortsScript.headline}\n\n完整版: ${pageUrl}\n\n#Shorts #AI #每日AI快送 #YOMOO`,
      tags: ["Shorts", "AI", "每日AI快送", "YOMOO", "科技新闻"],
      categoryId: "28",
      privacyStatus: "public",
      onProgress: (pct) => callbacks.onStatus(`Uploading Shorts: ${pct}%`),
    })

    const shortsUrl = `https://www.youtube.com/shorts/${shortsVideoId}`
    console.info("[shorts] Shorts uploaded:", shortsUrl)
    callbacks.onStatus(`Shorts uploaded: ${shortsUrl}`)

    return { ...ctx, shortsUrl }
  },
}
