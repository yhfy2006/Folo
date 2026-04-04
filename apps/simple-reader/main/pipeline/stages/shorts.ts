import fs from "node:fs"
import os from "node:os"

import path from "pathe"

import { generateShortsScript } from "../../ai-report"
import type { SubtitleSegment } from "../../tts"
import { generateAudioToFile } from "../../tts"
import { copyShortsBgm, downloadShortsOGImage, renderShorts } from "../../video-render"
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

/**
 * Generate, render, and optionally upload a single Shorts video.
 * Returns the Shorts URL (YouTube or local path if skipUpload).
 */
async function generateOneShorts(
  ctx: PipelineContext,
  callbacks: StageCallbacks,
  index: number,
  excludeTopics: string[],
  accessToken: string | undefined,
): Promise<{ url: string; title: string }> {
  const { prefs, date, pageUrl } = ctx
  const tmpDir = path.join(os.tmpdir(), `yomoo-video-${date}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  const suffix = index === 0 ? "" : `-${index + 1}`

  // 1. Generate script (exclude already-used topics)
  callbacks.onStatus(`[${index + 1}] Generating Shorts script...`)
  const shortsScript = await generateShortsScript(
    ctx.reportContent!,
    (s) => callbacks.onStatus(`[${index + 1}] ${s}`),
    excludeTopics.length > 0 ? excludeTopics : undefined,
  )
  console.info(`[shorts] #${index + 1} script generated: ${shortsScript.title}`)

  // 2. Generate audio
  callbacks.onStatus(`[${index + 1}] Generating Shorts audio...`)
  const shortsAudioResult = await generateAudioToFile(shortsScript.script, (s) =>
    callbacks.onStatus(`[${index + 1}] ${s}`),
  )
  const shortsAudioPath = shortsAudioResult.filePath
  const shortsSubtitles = shortsAudioResult.subtitles

  // 3. Match keyPoints to subtitle timestamps
  const keyPoints = matchKeyPointsToSubtitles(shortsScript.keyPoints, shortsSubtitles || [])

  // 4. Build scenes JSON
  const shortsScenesData = {
    headline: shortsScript.headline,
    ogImagePath: undefined as string | undefined,
    audioDuration: shortsSubtitles?.at(-1)?.end || 45,
    fps: 30,
    subtitles: shortsSubtitles?.map((s) => ({ text: s.text, start: s.start, end: s.end })),
    keyPoints,
    youtubeTitle: shortsScript.title,
    bgmPath: undefined as string | undefined,
  }

  // Copy background music if configured
  if (prefs.shortsBgmPath && fs.existsSync(prefs.shortsBgmPath)) {
    shortsScenesData.bgmPath = copyShortsBgm(prefs.shortsBgmPath)
  }

  // 5. Download OG image
  if (shortsScript.ogImageUrl) {
    const ogPath = await downloadShortsOGImage(shortsScript.ogImageUrl, (s) =>
      callbacks.onStatus(`[${index + 1}] ${s}`),
    )
    if (ogPath) {
      shortsScenesData.ogImagePath = ogPath
    }
  }

  const shortsScenesPath = path.join(tmpDir, `shorts-scenes${suffix}.json`)
  fs.writeFileSync(shortsScenesPath, JSON.stringify(shortsScenesData, null, 2), "utf-8")

  // 6. Render video
  const shortsOutputPath = path.join(tmpDir, `shorts${suffix}.mp4`)
  await renderShorts(shortsScenesPath, shortsAudioPath, shortsOutputPath, {
    onProgress: (pct) => callbacks.onStatus(`[${index + 1}] Rendering Shorts: ${pct}%`),
    onStatus: (status) => callbacks.onStatus(`[${index + 1}] ${status}`),
  })

  // 7. Upload or skip
  if (ctx.skipUpload) {
    console.info(`[shorts] #${index + 1} skipping upload (skipUpload=true)`)
    callbacks.onStatus(`[${index + 1}] Shorts rendered: ${shortsOutputPath}`)
    return { url: shortsOutputPath, title: shortsScript.title }
  }

  const token =
    accessToken ||
    (await refreshAccessToken(
      prefs.youtubeRefreshToken,
      prefs.youtubeClientId,
      prefs.youtubeClientSecret,
    ))
  callbacks.onStatus(`[${index + 1}] Uploading Shorts to YouTube...`)
  const videoId = await uploadVideo({
    accessToken: token,
    videoPath: shortsOutputPath,
    title: shortsScript.title,
    description: `${shortsScript.headline}\n\n完整版: ${pageUrl}\n\n#AI新闻 #人工智能 #科技 #每日AI快送 #YOMOO`,
    tags: ["AI", "人工智能", "每日AI快送", "YOMOO", "科技新闻", "AI新闻"],
    categoryId: "28",
    privacyStatus: "public",
    onProgress: (pct) => callbacks.onStatus(`[${index + 1}] Uploading Shorts: ${pct}%`),
  })

  const url = `https://www.youtube.com/shorts/${videoId}`
  console.info(`[shorts] #${index + 1} uploaded: ${url}`)
  callbacks.onStatus(`[${index + 1}] Shorts uploaded: ${url}`)
  return { url, title: shortsScript.title }
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
    const count = Math.max(1, ctx.prefs.youtubeShortsCount || 1)
    const shortsUrls: string[] = []
    const excludeTopics: string[] = []

    // Get access token once for all uploads
    let accessToken = ctx.youtubeAccessToken
    if (!ctx.skipUpload && !accessToken) {
      accessToken = await refreshAccessToken(
        ctx.prefs.youtubeRefreshToken,
        ctx.prefs.youtubeClientId,
        ctx.prefs.youtubeClientSecret,
      )
    }

    for (let i = 0; i < count; i++) {
      if (count > 1) {
        callbacks.onStatus(`Generating Shorts ${i + 1}/${count}...`)
      }

      try {
        const result = await generateOneShorts(ctx, callbacks, i, excludeTopics, accessToken)
        shortsUrls.push(result.url)
        excludeTopics.push(result.title)
      } catch (err) {
        // Individual Shorts failure is non-fatal when generating multiple
        console.info(`[shorts] #${i + 1} failed (non-fatal):`, err)
        callbacks.onStatus(`Shorts #${i + 1} failed: ${err}`)
        if (count === 1) throw err
      }
    }

    return {
      ...ctx,
      shortsUrl: shortsUrls[0],
      shortsUrls,
    }
  },
}
