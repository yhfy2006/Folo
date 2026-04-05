import {
  commitFile,
  ensureRobotsTxt,
  getGitHubPagesUrl,
  updateRootIndex,
  updateSitemap,
} from "../../github"
import { generateEmailHtml, generateHtmlPage } from "../../html-generator"
import { substituteTemplate } from "../channel-types"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

export const publishStage: StageDefinition = {
  name: "publish",
  label: "Publish to GitHub Pages",
  shouldRun: (_ctx: PipelineContext) => true,
  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    callbacks.onStatus("Publishing branded page...")

    if (ctx.dryRun) {
      callbacks.onStatus("Dry run: skipping publish")
      return { ...ctx, pageUrl: "dry-run://page" }
    }

    const {
      prefs,
      owner,
      date,
      groupName,
      reportContent,
      audioUrl,
      podcastScript,
      seoDescription,
    } = ctx

    // Use channel config when available
    const brandName = ctx.channel?.web?.brandName ?? "YOMOO"
    const htmlLang = ctx.channel?.web?.htmlLang ?? undefined

    try {
      const html = generateHtmlPage(
        reportContent!,
        audioUrl!,
        date,
        podcastScript!,
        seoDescription!,
        htmlLang,
      )
      const htmlBase64 = Buffer.from(html).toString("base64")

      const episodePath = groupName ? `episodes/${groupName}/${date}` : `episodes/${date}`

      await commitFile(
        prefs.githubToken,
        owner!,
        "yomoo-daily",
        `${episodePath}/index.html`,
        htmlBase64,
        `feat: add episode ${date}${groupName ? ` (${groupName})` : ""}`,
      )

      // Update root index — use channel YouTube titleTemplate for episode title when available
      const defaultEpisodeTitle = groupName
        ? `${groupName} - ${brandName} 每日AI快送 - ${date}`
        : `${brandName} 每日AI快送 - ${date}`
      const episodeTitle = ctx.channel?.youtube?.titleTemplate
        ? substituteTemplate(ctx.channel.youtube.titleTemplate, ctx.channel, { date })
        : defaultEpisodeTitle
      await updateRootIndex(prefs.githubToken, owner!, date, episodeTitle)

      // Commit email-safe HTML (triggers GitHub Action to send newsletter)
      callbacks.onStatus("Committing email version...")
      const emailHtml = await generateEmailHtml(reportContent!, audioUrl!, date)
      const emailBase64 = Buffer.from(emailHtml).toString("base64")

      await commitFile(
        prefs.githubToken,
        owner!,
        "yomoo-daily",
        `${episodePath}/email.html`,
        emailBase64,
        `feat: add email version for ${date}${groupName ? ` (${groupName})` : ""}`,
      )

      // Update sitemap and ensure robots.txt
      callbacks.onStatus("Updating sitemap and robots.txt...")
      await updateSitemap(prefs.githubToken, owner!, date)
      await ensureRobotsTxt(prefs.githubToken, owner!)
    } catch (err) {
      throw new Error(`Publishing failed: ${err}`)
    }

    const pageUrl = getGitHubPagesUrl(owner!, date)

    return { ...ctx, pageUrl }
  },
}
