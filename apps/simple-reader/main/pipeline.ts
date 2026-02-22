import fs from "node:fs"

import { generatePodcastScriptToString, generateReportToString } from "./ai-report"
import {
  commitFile,
  createReleaseWithAudio,
  ensureRepo,
  getGitHubPagesUrl,
  updateRootIndex,
  verifyToken,
} from "./github"
import { generateEmailHtml, generateHtmlPage } from "./html-generator"
import { loadPreferences } from "./preferences"
import { generateAudioToFile } from "./tts"

export interface PipelineResult {
  pageUrl: string
  audioUrl: string
  date: string
}

export interface PipelineCallbacks {
  onStage: (stage: string) => void
  onStatus: (status: string) => void
  onProgress: (step: number, total: number) => void
  onDone: (result: PipelineResult) => void
  onError: (stage: string, error: string) => void
}

/**
 * Run the full YOMOO pipeline:
 * 1. Generate AI report
 * 2. Generate podcast script + audio
 * 3. Upload audio to GitHub Release
 * 4. Generate branded HTML + commit to GitHub repo
 */
export async function runPipeline(callbacks: PipelineCallbacks): Promise<void> {
  const prefs = loadPreferences()
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const total = 5

  // Stage 0: Verify GitHub token
  callbacks.onStage("verify")
  callbacks.onProgress(0, total)
  callbacks.onStatus("Verifying GitHub token...")

  if (!prefs.githubToken) {
    callbacks.onError("verify", "GitHub PAT not configured. Please set it in Preferences.")
    return
  }

  let owner: string
  try {
    const tokenUser = await verifyToken(prefs.githubToken)
    owner = prefs.githubOwner || tokenUser
    callbacks.onStatus(`Authenticated as ${tokenUser}, repo owner: ${owner}`)
  } catch (err) {
    callbacks.onError("verify", `GitHub authentication failed: ${err}`)
    return
  }

  // Ensure repo exists
  try {
    await ensureRepo(prefs.githubToken, owner)
  } catch (err) {
    callbacks.onError("verify", `Failed to ensure repo: ${err}`)
    return
  }

  // Stage 1: Generate AI Report
  callbacks.onStage("report")
  callbacks.onProgress(1, total)
  callbacks.onStatus("Generating AI report...")

  let reportContent: string
  try {
    reportContent = await generateReportToString((status) => {
      callbacks.onStatus(status)
    })
  } catch (err) {
    callbacks.onError("report", `Report generation failed: ${err}`)
    return
  }

  if (!reportContent || reportContent.length < 50) {
    callbacks.onError("report", "Report generation produced no content")
    return
  }

  // Stage 2: Generate Podcast Script
  callbacks.onStage("podcast")
  callbacks.onProgress(2, total)
  callbacks.onStatus("Generating podcast script...")

  let podcastScript: string
  try {
    podcastScript = await generatePodcastScriptToString(reportContent, (status) => {
      callbacks.onStatus(status)
    })
  } catch (err) {
    callbacks.onError("podcast", `Podcast script generation failed: ${err}`)
    return
  }

  // Stage 3: Generate Audio
  callbacks.onStage("audio")
  callbacks.onProgress(3, total)
  callbacks.onStatus("Generating audio...")

  if (!prefs.minimaxApiKey) {
    callbacks.onError("audio", "MiniMax API Key not configured. Please set it in Preferences.")
    return
  }

  let audioFilePath: string
  try {
    audioFilePath = await generateAudioToFile(podcastScript, (status) => {
      callbacks.onStatus(status)
    })
  } catch (err) {
    callbacks.onError("audio", `Audio generation failed: ${err}`)
    return
  }

  // Stage 4: Upload audio to GitHub Release
  callbacks.onStage("upload")
  callbacks.onProgress(4, total)
  callbacks.onStatus("Uploading audio to GitHub...")

  let audioUrl: string
  try {
    const audioBuffer = fs.readFileSync(audioFilePath)
    const fileName = `yomoo-${date}.mp3`
    const tag = `v${date}`
    const title = `YOMOO 每日AI快送 - ${date}`

    audioUrl = await createReleaseWithAudio(
      prefs.githubToken,
      owner,
      tag,
      title,
      audioBuffer,
      fileName,
    )
  } catch (err) {
    callbacks.onError("upload", `Audio upload failed: ${err}`)
    return
  }

  // Stage 5: Generate HTML + commit to GitHub
  callbacks.onStage("publish")
  callbacks.onProgress(5, total)
  callbacks.onStatus("Publishing branded page...")

  try {
    const html = generateHtmlPage(reportContent, audioUrl, date, podcastScript)
    const htmlBase64 = Buffer.from(html).toString("base64")

    await commitFile(
      prefs.githubToken,
      owner,
      "yomoo-daily",
      `episodes/${date}/index.html`,
      htmlBase64,
      `feat: add episode ${date}`,
    )

    // Update root index
    await updateRootIndex(prefs.githubToken, owner, date, `YOMOO 每日AI快送 - ${date}`)

    // Commit email-safe HTML (triggers GitHub Action to send newsletter)
    callbacks.onStatus("Committing email version...")
    const emailHtml = generateEmailHtml(reportContent, audioUrl, date)
    const emailBase64 = Buffer.from(emailHtml).toString("base64")

    await commitFile(
      prefs.githubToken,
      owner,
      "yomoo-daily",
      `episodes/${date}/email.html`,
      emailBase64,
      `feat: add email version for ${date}`,
    )
  } catch (err) {
    callbacks.onError("publish", `Publishing failed: ${err}`)
    return
  }

  const pageUrl = getGitHubPagesUrl(owner, date)

  callbacks.onProgress(total, total)
  callbacks.onDone({ pageUrl, audioUrl, date })
}
