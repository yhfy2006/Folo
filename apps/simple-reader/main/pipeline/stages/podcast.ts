import { generatePodcastScriptToString } from "../../ai-report"
import type { PipelineContext } from "../context"
import { loadPrompt } from "../prompt-loader"
import type { StageCallbacks, StageDefinition } from "../types"

export const podcastStage: StageDefinition = {
  name: "podcast",
  label: "Generate Podcast Script",
  shouldRun: (_ctx: PipelineContext) => true,
  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    callbacks.onStatus("Generating podcast script...")

    // Load channel prompt override when available
    let promptOverride: string | undefined
    if (ctx.channel) {
      try {
        promptOverride = loadPrompt(ctx.channel, "podcast.md", {
          date: ctx.date,
          reportContent: ctx.reportContent!,
        })
        console.info("[podcast] Using channel prompt override")
      } catch (err) {
        console.info("[podcast] Channel prompt not found, using defaults:", err)
      }
    }

    let podcastScript: string
    try {
      podcastScript = await generatePodcastScriptToString(
        ctx.reportContent!,
        (status) => {
          callbacks.onStatus(status)
        },
        promptOverride,
      )
    } catch (err) {
      throw new Error(`Podcast script generation failed: ${err}`)
    }

    return { ...ctx, podcastScript }
  },
}
