import fs from "node:fs"

import { buildVideoDescription, refreshAccessToken, setThumbnail, uploadVideo } from "../../youtube"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

export const youtubeStage: StageDefinition = {
  name: "youtube",
  label: "Upload to YouTube",
  shouldRun: (ctx: PipelineContext) =>
    !!ctx.videoPath && ctx.prefs.youtubeEnabled && !!ctx.prefs.youtubeRefreshToken,
  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    callbacks.onStatus("Uploading to YouTube...")

    const { prefs, date, videoPath, thumbnailPath, scenesJsonPath, pageUrl, audioUrl } = ctx

    // Refresh access token
    const youtubeAccessToken = await refreshAccessToken(
      prefs.youtubeRefreshToken,
      prefs.youtubeClientId,
      prefs.youtubeClientSecret,
    )

    // Read scenes.json to extract headlines and youtube title
    const scenes = JSON.parse(fs.readFileSync(scenesJsonPath!, "utf-8"))

    // Extract headlines from scenes for description
    const headlines = scenes.scenes
      .filter((s: { type: string; title?: string }) => s.type === "news" && s.title)
      .map((s: { title: string }) => s.title)

    const description = buildVideoDescription(date, headlines, pageUrl!, audioUrl!)

    // Upload video
    const videoId = await uploadVideo({
      accessToken: youtubeAccessToken,
      videoPath: videoPath!,
      title: scenes.youtubeTitle || `YOMOO 每日AI快送 — ${date}`,
      description,
      tags: ["AI", "每日AI快送", "YOMOO", "科技新闻", "AI新闻"],
      categoryId: "28",
      privacyStatus: "public",
      onProgress: (pct) => callbacks.onStatus(`Uploading to YouTube: ${pct}%`),
    })

    // Set thumbnail
    try {
      await setThumbnail(videoId, thumbnailPath!, youtubeAccessToken)
      callbacks.onStatus("Thumbnail set successfully")
    } catch (thumbErr) {
      // Non-fatal: YouTube will auto-select a frame
      console.info("[youtube] Thumbnail set failed (non-fatal):", thumbErr)
      callbacks.onStatus("Thumbnail set failed, YouTube will auto-select a frame")
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
    console.info("[youtube] Upload complete:", youtubeUrl)
    callbacks.onStatus(`YouTube upload complete: ${youtubeUrl}`)

    return { ...ctx, youtubeUrl, youtubeAccessToken }
  },
}
