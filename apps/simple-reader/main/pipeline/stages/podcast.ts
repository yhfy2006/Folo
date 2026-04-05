import { generatePodcastScriptToString } from "../../ai-report"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

export const podcastStage: StageDefinition = {
  name: "podcast",
  label: "Generate Podcast Script",
  shouldRun: (_ctx: PipelineContext) => true,
  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    callbacks.onStatus("Generating podcast script...")

    let podcastScript: string
    try {
      podcastScript = await generatePodcastScriptToString(ctx.reportContent!, (status) => {
        callbacks.onStatus(status)
      })
    } catch (err) {
      throw new Error(`Podcast script generation failed: ${err}`)
    }

    return { ...ctx, podcastScript }
  },
}
