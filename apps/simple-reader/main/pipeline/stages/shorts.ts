import fs from "node:fs"
import os from "node:os"

import path from "pathe"

import { generateShortsScripts } from "../../ai-report"
import { execute, saveDatabase } from "../../database"
import type { SubtitleSegment } from "../../tts"
import { generateAudioToFile } from "../../tts"
import { copyShortsBgm, downloadShortsOGImage, renderShorts } from "../../video-render"
import { refreshAccessToken, uploadVideo } from "../../youtube"
import { substituteTemplate } from "../channel-types"
import type { PipelineContext } from "../context"
import { loadChannelContext, loadPrompt } from "../prompt-loader"
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
 * Render and optionally upload a single Shorts video from a pre-generated script.
 * Returns the Shorts URL (YouTube or local path if skipUpload).
 */
async function renderAndUploadOneShorts(
  ctx: PipelineContext,
  callbacks: StageCallbacks,
  index: number,
  shortsScript: import("../../ai-report").ShortsScript,
  accessToken: string | undefined,
): Promise<{ url: string; title: string }> {
  const { prefs, date, pageUrl } = ctx
  const tmpDir = path.join(os.tmpdir(), `yomoo-video-${date}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  const suffix = index === 0 ? "" : `-${index + 1}`

  console.info(`[shorts] #${index + 1} script: ${shortsScript.title}`)

  // 1. Generate audio
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

  // Use channel YouTube config for shorts description/tags when available
  const { channel } = ctx
  const defaultDescription = `${shortsScript.headline}\n\n完整版: ${pageUrl}\n\n#AI新闻 #人工智能 #科技 #每日AI快送 #YOMOO`
  const shortsDescription = channel?.youtube?.shortsDescriptionTemplate
    ? substituteTemplate(channel.youtube.shortsDescriptionTemplate, channel, {
        date,
        headline: shortsScript.headline,
        pageUrl: pageUrl || "",
      })
    : defaultDescription

  const shortsTags = channel?.youtube?.tags ?? [
    "AI",
    "人工智能",
    "每日AI快送",
    "YOMOO",
    "科技新闻",
    "AI新闻",
  ]
  const defaultLanguage = channel?.language ?? "zh-CN"

  const videoId = await uploadVideo({
    accessToken: token,
    videoPath: shortsOutputPath,
    title: shortsScript.title,
    description: shortsDescription,
    tags: shortsTags,
    categoryId: "28",
    privacyStatus: "public",
    defaultLanguage,
    onProgress: (pct) => callbacks.onStatus(`[${index + 1}] Uploading Shorts: ${pct}%`),
  })

  const url = `https://www.youtube.com/shorts/${videoId}`
  console.info(`[shorts] #${index + 1} uploaded: ${url}`)
  callbacks.onStatus(`[${index + 1}] Shorts uploaded: ${url}`)

  // Record upload for reflect stage analytics
  try {
    const uploadId = Math.random().toString(36).slice(2) + Date.now().toString(36)
    const now = Math.floor(Date.now() / 1000)
    execute(
      "INSERT INTO video_uploads (id, video_id, type, title, date, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [uploadId, videoId, "shorts", shortsScript.title, ctx.date, ctx.groupId || null, now],
    )
    saveDatabase()
  } catch (err) {
    console.info("[shorts] Failed to record upload (non-fatal):", err)
  }

  return { url, title: shortsScript.title }
}

export const shortsStage: StageDefinition = {
  name: "shorts",
  label: "Generate & Upload YouTube Shorts",
  shouldRun: (ctx: PipelineContext) =>
    ctx.prefs.youtubeEnabled && !!ctx.prefs.youtubeRefreshToken && ctx.prefs.youtubeShortsEnabled,
  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    if (ctx.dryRun) {
      callbacks.onStatus("Dry run: Shorts will render but skip upload")
      ctx = { ...ctx, skipUpload: true }
    }

    const count = Math.max(1, ctx.prefs.youtubeShortsCount || 1)
    const shortsUrls: string[] = []

    // Get access token once for all uploads
    let accessToken = ctx.youtubeAccessToken
    if (!ctx.skipUpload && !accessToken) {
      accessToken = await refreshAccessToken(
        ctx.prefs.youtubeRefreshToken,
        ctx.prefs.youtubeClientId,
        ctx.prefs.youtubeClientSecret,
      )
    }

    // Load channel prompt override for shorts scripts when available
    let shortsPromptOverride: string | undefined
    if (ctx.channel) {
      try {
        const channelContext = loadChannelContext(ctx.channel)
        const contextPrefix = channelContext ? `${channelContext}\n\n` : ""
        shortsPromptOverride =
          contextPrefix +
          loadPrompt(ctx.channel, "shorts.md", {
            date: ctx.date,
            reportContent: ctx.reportContent!,
          })
        console.info("[shorts] Using channel prompt override (with context)")
      } catch (err) {
        console.info("[shorts] Channel prompt not found, using defaults:", err)
      }
    }

    // Generate all scripts in a single Claude CLI call
    callbacks.onStatus(`Generating ${count} Shorts scripts...`)
    const scripts = await generateShortsScripts(
      ctx.reportContent!,
      count,
      (s) => callbacks.onStatus(s),
      undefined,
      shortsPromptOverride,
    )
    console.info(`[shorts] Generated ${scripts.length} scripts in one call`)

    // Render and upload each one
    for (let i = 0; i < scripts.length; i++) {
      if (scripts.length > 1) {
        callbacks.onStatus(`Processing Shorts ${i + 1}/${scripts.length}...`)
      }

      try {
        const result = await renderAndUploadOneShorts(ctx, callbacks, i, scripts[i]!, accessToken)
        shortsUrls.push(result.url)
      } catch (err) {
        console.info(`[shorts] #${i + 1} failed (non-fatal):`, err)
        callbacks.onStatus(`Shorts #${i + 1} failed: ${err}`)
        if (scripts.length === 1) throw err
      }
    }

    return {
      ...ctx,
      shortsUrl: shortsUrls[0],
      shortsUrls,
    }
  },
}
