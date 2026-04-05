import { generateReportToString, generateSeoDescription } from "../../ai-report"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

export const reportStage: StageDefinition = {
  name: "report",
  label: "Generate AI Report",
  shouldRun: (_ctx: PipelineContext) => true,
  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    callbacks.onStatus("Generating AI report...")

    let reportContent: string
    try {
      reportContent = await generateReportToString(
        (status) => {
          callbacks.onStatus(status)
        },
        ctx.groupId,
        ctx.youtubeInsights,
        ctx.dryRun,
      )
    } catch (err) {
      throw new Error(`Report generation failed: ${err}`)
    }

    if (!reportContent || reportContent.length < 50) {
      throw new Error("Report generation produced no content")
    }

    // Generate SEO description (non-blocking, fallback to plain text extract)
    callbacks.onStatus("Generating SEO description...")
    let seoDescription: string
    try {
      seoDescription = await generateSeoDescription(reportContent)
    } catch {
      seoDescription = reportContent
        .replaceAll(/[#*\n]/g, " ")
        .replaceAll(/\s+/g, " ")
        .trim()
        .slice(0, 150)
    }

    return { ...ctx, reportContent, seoDescription }
  },
}
