import { generateReportToString, generateSeoDescription } from "../../ai-report"
import type { PipelineContext } from "../context"
import { loadPrompt } from "../prompt-loader"
import type { StageCallbacks, StageDefinition } from "../types"

export const reportStage: StageDefinition = {
  name: "report",
  label: "Generate AI Report",
  shouldRun: (_ctx: PipelineContext) => true,
  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    callbacks.onStatus("Generating AI report...")

    // Load channel prompt overrides when available
    let promptOverrides: { screeningPrompt?: string; reportPrompt?: string } | undefined
    if (ctx.channel) {
      try {
        const screeningPrompt = loadPrompt(ctx.channel, "screening.md", { date: ctx.date })
        const reportPrompt = loadPrompt(ctx.channel, "report.md", { date: ctx.date })
        promptOverrides = { screeningPrompt, reportPrompt }
        console.info("[report] Using channel prompt overrides")
      } catch (err) {
        console.info("[report] Channel prompt not found, using defaults:", err)
      }
    }

    let reportContent: string
    try {
      reportContent = await generateReportToString(
        (status) => {
          callbacks.onStatus(status)
        },
        ctx.groupId,
        ctx.youtubeInsights,
        ctx.dryRun,
        promptOverrides,
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
