import fs from "node:fs"

import { execute, saveDatabase } from "../../database"
import type { ScenesJson } from "../../scene-generator"
import { buildVideoDescription, refreshAccessToken, setThumbnail, uploadVideo } from "../../youtube"
import { substituteTemplate } from "../channel-types"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

export const youtubeStage: StageDefinition = {
  name: "youtube",
  label: "Upload to YouTube",
  shouldRun: (ctx: PipelineContext) => ctx.prefs.youtubeEnabled && !!ctx.prefs.youtubeRefreshToken,
  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    if (!ctx.videoPath) {
      throw new Error("No video file available — video stage may have failed")
    }

    callbacks.onStatus("Uploading to YouTube...")

    if (ctx.dryRun) {
      callbacks.onStatus("Dry run: skipping YouTube upload")
      return { ...ctx, youtubeUrl: "dry-run://youtube" }
    }

    const { prefs, date, videoPath, thumbnailPath, scenesJsonPath, pageUrl, audioUrl } = ctx

    // Refresh access token
    const youtubeAccessToken = await refreshAccessToken(
      prefs.youtubeRefreshToken,
      prefs.youtubeClientId,
      prefs.youtubeClientSecret,
    )

    // Read scenes.json to extract headlines and youtube title
    const scenes: ScenesJson = JSON.parse(fs.readFileSync(scenesJsonPath!, "utf-8"))

    // Extract headlines from scenes for description
    const headlines = scenes.scenes.filter((s) => s.type === "news" && s.title).map((s) => s.title!)

    const description = buildVideoDescription(date, headlines, pageUrl!, audioUrl!)

    // Use channel YouTube config when available
    const defaultTitle = scenes.youtubeTitle || `YOMOO 每日AI快送 — ${date}`
    const title = ctx.channel?.youtube?.titleTemplate
      ? substituteTemplate(ctx.channel.youtube.titleTemplate, ctx.channel, { date })
      : defaultTitle

    const tags = ctx.channel?.youtube?.tags ?? ["AI", "每日AI快送", "YOMOO", "科技新闻", "AI新闻"]
    const defaultLanguage = ctx.channel?.language ?? "zh-CN"

    // Upload video
    const videoId = await uploadVideo({
      accessToken: youtubeAccessToken,
      videoPath: videoPath!,
      title,
      description,
      tags,
      categoryId: "28",
      privacyStatus: "public",
      defaultLanguage,
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

    // Record upload for reflect stage analytics
    try {
      const uploadId = Math.random().toString(36).slice(2) + Date.now().toString(36)
      const now = Math.floor(Date.now() / 1000)
      execute(
        "INSERT INTO video_uploads (id, video_id, type, title, date, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [uploadId, videoId, "video", title, date, ctx.groupId || null, now],
      )
      saveDatabase()
    } catch (err) {
      console.info("[youtube] Failed to record upload (non-fatal):", err)
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
    console.info("[youtube] Upload complete:", youtubeUrl)
    callbacks.onStatus(`YouTube upload complete: ${youtubeUrl}`)

    return { ...ctx, youtubeUrl, youtubeAccessToken }
  },
}
