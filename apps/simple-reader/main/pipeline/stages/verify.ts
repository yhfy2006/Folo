import { formatYouTubeInsights } from "../../ai-report"
import { queryOne } from "../../database"
import { ensureRepo, verifyToken } from "../../github"
import { listChannelVideos, refreshAccessToken } from "../../youtube"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

export const verifyStage: StageDefinition = {
  name: "verify",
  label: "Verify GitHub Token",
  shouldRun: (_ctx: PipelineContext) => true,
  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    const { prefs } = ctx

    if (!prefs.githubToken) {
      throw new Error("GitHub PAT not configured. Please set it in Preferences.")
    }

    let owner: string
    try {
      const tokenUser = await verifyToken(prefs.githubToken)
      owner = prefs.githubOwner || tokenUser
      callbacks.onStatus(`Authenticated as ${tokenUser}, repo owner: ${owner}`)
    } catch (err) {
      throw new Error(`GitHub authentication failed: ${err}`)
    }

    try {
      await ensureRepo(prefs.githubToken, owner)
    } catch (err) {
      throw new Error(`Failed to ensure repo: ${err}`)
    }

    // Resolve group name from DB if groupId is set
    let { groupName } = ctx
    if (ctx.groupId && !groupName) {
      const group = queryOne<{ name: string }>(`SELECT name FROM feed_groups WHERE id = ?`, [
        ctx.groupId,
      ])
      groupName = group?.name
    }

    // Pre-fetch YouTube audience insights (non-fatal)
    let { youtubeInsights } = ctx
    let youtubeAccessToken: string | undefined
    if (!youtubeInsights && prefs.youtubeEnabled && prefs.youtubeRefreshToken) {
      try {
        callbacks.onStatus("Fetching YouTube audience insights...")
        youtubeAccessToken = await refreshAccessToken(
          prefs.youtubeRefreshToken,
          prefs.youtubeClientId,
          prefs.youtubeClientSecret,
        )
        const videos = await listChannelVideos(youtubeAccessToken)
        youtubeInsights = formatYouTubeInsights(videos) || undefined
        if (youtubeInsights) {
          console.info("[verify] YouTube insights loaded:", videos.length, "videos analyzed")
          callbacks.onStatus(`YouTube insights loaded: ${videos.length} videos analyzed`)
        }
      } catch (err) {
        console.info("[verify] YouTube insights fetch failed (non-fatal):", err)
      }
    }

    return { ...ctx, owner, groupName, youtubeInsights, youtubeAccessToken }
  },
}
