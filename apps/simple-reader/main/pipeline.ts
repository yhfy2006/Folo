import fs from "node:fs"
import os from "node:os"

import path from "pathe"

import {
  formatYouTubeInsights,
  generatePodcastScriptToString,
  generateReportToString,
  generateSeoDescription,
} from "./ai-report"
import { queryOne } from "./database"
import { transcribeAudio } from "./deepgram"
import {
  commitFile,
  createReleaseWithAudio,
  ensureRepo,
  ensureRobotsTxt,
  getGitHubPagesUrl,
  updateRootIndex,
  updateSitemap,
  verifyToken,
} from "./github"
import { generateEmailHtml, generateHtmlPage } from "./html-generator"
import { fetchOGImages } from "./og-image"
import { loadPreferences } from "./preferences"
import {
  alignTranscriptWithScript,
  generateScenes,
  generateSubtitlesWithLLM,
} from "./scene-generator"
import type { SubtitleSegment } from "./tts"
import { generateAudioToFile } from "./tts"
import { downloadOGImages, renderThumbnail, renderVideo } from "./video-render"
import {
  buildVideoDescription,
  listChannelVideos,
  refreshAccessToken,
  setThumbnail,
  uploadVideo,
} from "./youtube"

export interface PipelineResult {
  pageUrl: string
  audioUrl: string
  date: string
  youtubeUrl?: string
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
 * 1. Verify GitHub token
 * 2. Generate AI report
 * 3. Generate podcast script
 * 4. Generate audio
 * 5. Upload audio to GitHub Release
 * 6. Generate HTML + commit to GitHub
 * 7. Audio alignment (if Deepgram configured)
 * 8. Video render (if alignment succeeded)
 * 9. YouTube upload (if YouTube configured)
 */
export async function runPipeline(callbacks: PipelineCallbacks, groupId?: string): Promise<void> {
  const prefs = loadPreferences()
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  // Resolve group name for publishing paths
  let groupName: string | undefined
  if (groupId) {
    const group = queryOne<{ name: string }>(`SELECT name FROM feed_groups WHERE id = ?`, [groupId])
    groupName = group?.name
  }

  // Determine which optional stages are enabled
  // Video is enabled if Deepgram key is configured (MiniMax subtitles may also be used as primary source)
  const videoEnabled = !!prefs.deepgramApiKey
  const youtubeEnabled = videoEnabled && prefs.youtubeEnabled && !!prefs.youtubeRefreshToken

  // Base stages: verify, report, podcast, audio, upload, publish = 6
  // Optional: video (alignment + render) = +1, youtube = +1
  let total = 6
  if (videoEnabled) total += 1
  if (youtubeEnabled) total += 1

  let step = 0

  // Stage 0: Verify GitHub token
  callbacks.onStage("verify")
  callbacks.onProgress(step, total)
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

  // Pre-stage: Fetch YouTube audience insights (non-fatal)
  let youtubeInsights: string | undefined
  if (prefs.youtubeEnabled && prefs.youtubeRefreshToken) {
    try {
      callbacks.onStatus("Fetching YouTube audience insights...")
      const accessToken = await refreshAccessToken(
        prefs.youtubeRefreshToken,
        prefs.youtubeClientId,
        prefs.youtubeClientSecret,
      )
      const videos = await listChannelVideos(accessToken)
      youtubeInsights = formatYouTubeInsights(videos) || undefined
      if (youtubeInsights) {
        console.info("[pipeline] YouTube insights loaded:", videos.length, "videos analyzed")
        callbacks.onStatus(`YouTube insights loaded: ${videos.length} videos analyzed`)
      }
    } catch (err) {
      console.info("[pipeline] YouTube insights fetch failed (non-fatal):", err)
    }
  }

  // Stage 1: Generate AI Report
  step++
  callbacks.onStage("report")
  callbacks.onProgress(step, total)
  callbacks.onStatus("Generating AI report...")

  let reportContent: string
  try {
    reportContent = await generateReportToString(
      (status) => {
        callbacks.onStatus(status)
      },
      groupId,
      youtubeInsights,
    )
  } catch (err) {
    callbacks.onError("report", `Report generation failed: ${err}`)
    return
  }

  if (!reportContent || reportContent.length < 50) {
    callbacks.onError("report", "Report generation produced no content")
    return
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

  // Stage 2: Generate Podcast Script
  step++
  callbacks.onStage("podcast")
  callbacks.onProgress(step, total)
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
  step++
  callbacks.onStage("audio")
  callbacks.onProgress(step, total)
  callbacks.onStatus("Generating audio...")

  if (!prefs.minimaxApiKey) {
    callbacks.onError("audio", "MiniMax API Key not configured. Please set it in Preferences.")
    return
  }

  let audioFilePath: string
  let ttsSubtitles: import("./tts").SubtitleSegment[] | undefined
  try {
    const ttsResult = await generateAudioToFile(podcastScript, (status) => {
      callbacks.onStatus(status)
    })
    audioFilePath = ttsResult.filePath
    ttsSubtitles = ttsResult.subtitles
    if (ttsSubtitles) {
      console.info(`[pipeline] MiniMax returned ${ttsSubtitles.length} subtitle segments`)
    }
  } catch (err) {
    callbacks.onError("audio", `Audio generation failed: ${err}`)
    return
  }

  // Stage 4: Upload audio to GitHub Release
  step++
  callbacks.onStage("upload")
  callbacks.onProgress(step, total)
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
  step++
  callbacks.onStage("publish")
  callbacks.onProgress(step, total)
  callbacks.onStatus("Publishing branded page...")

  try {
    const html = generateHtmlPage(reportContent, audioUrl, date, podcastScript, seoDescription)
    const htmlBase64 = Buffer.from(html).toString("base64")

    const episodePath = groupName ? `episodes/${groupName}/${date}` : `episodes/${date}`

    await commitFile(
      prefs.githubToken,
      owner,
      "yomoo-daily",
      `${episodePath}/index.html`,
      htmlBase64,
      `feat: add episode ${date}${groupName ? ` (${groupName})` : ""}`,
    )

    // Update root index
    const episodeTitle = groupName
      ? `${groupName} - YOMOO 每日AI快送 - ${date}`
      : `YOMOO 每日AI快送 - ${date}`
    await updateRootIndex(prefs.githubToken, owner, date, episodeTitle)

    // Commit email-safe HTML (triggers GitHub Action to send newsletter)
    callbacks.onStatus("Committing email version...")
    const emailHtml = await generateEmailHtml(reportContent, audioUrl, date)
    const emailBase64 = Buffer.from(emailHtml).toString("base64")

    await commitFile(
      prefs.githubToken,
      owner,
      "yomoo-daily",
      `${episodePath}/email.html`,
      emailBase64,
      `feat: add email version for ${date}${groupName ? ` (${groupName})` : ""}`,
    )

    // Update sitemap and ensure robots.txt
    callbacks.onStatus("Updating sitemap and robots.txt...")
    await updateSitemap(prefs.githubToken, owner, date)
    await ensureRobotsTxt(prefs.githubToken, owner)
  } catch (err) {
    callbacks.onError("publish", `Publishing failed: ${err}`)
    return
  }

  const pageUrl = getGitHubPagesUrl(owner, date)
  let youtubeUrl: string | undefined

  // Stage 6: Audio Alignment + Scene Generation (if Deepgram configured)
  let scenesJsonPath: string | undefined
  let audioDuration = 0

  if (videoEnabled) {
    step++
    callbacks.onStage("video")
    callbacks.onProgress(step, total)

    try {
      let alignedSegments: import("./scene-generator").AlignedSegment[]
      let deepgramWords: import("./deepgram").DeepgramWord[] = []
      let subtitles: import("./scene-generator").SubtitleLine[]

      if (ttsSubtitles && ttsSubtitles.length > 0) {
        // Use MiniMax TTS subtitles directly — skip Deepgram transcription
        callbacks.onStatus("Using MiniMax TTS subtitles (skipping Deepgram)...")
        console.info("[pipeline] Using MiniMax subtitles, skipping Deepgram")

        // Convert TTS subtitles to aligned segments for scene generation
        alignedSegments = ttsSubtitles.map((s) => ({
          text: s.text,
          start: s.start,
          end: s.end,
        }))

        // Get audio duration from last subtitle
        audioDuration = ttsSubtitles.at(-1)?.end || 0

        // TTS subtitles are already sentence-level, use directly as video subtitles
        subtitles = ttsSubtitles.map((s) => ({
          text: s.text,
          start: s.start,
          end: s.end,
        }))
      } else {
        // Fallback: use Deepgram for transcription + alignment
        callbacks.onStatus("Transcribing audio with Deepgram...")
        const deepgramResult = await transcribeAudio(audioFilePath, prefs.deepgramApiKey, {
          onStatus: (status) => callbacks.onStatus(status),
        })
        deepgramWords = deepgramResult.words

        callbacks.onStatus("Aligning transcript with script...")
        alignedSegments = alignTranscriptWithScript(deepgramWords, podcastScript)

        if (deepgramWords.length > 0) {
          audioDuration = deepgramWords.at(-1)!.end
        }

        // Generate subtitles using LLM
        callbacks.onStatus("Generating subtitles with LLM...")
        subtitles = await generateSubtitlesWithLLM(alignedSegments, deepgramWords, (s) =>
          callbacks.onStatus(s),
        )
      }

      // Generate scenes
      const scenes = await generateScenes(
        alignedSegments,
        reportContent,
        audioDuration,
        (status) => callbacks.onStatus(status),
        deepgramWords,
      )

      scenes.subtitles = subtitles
      console.info(`[pipeline] Generated ${subtitles.length} subtitle lines`)

      // Fetch OG images for news scenes
      callbacks.onStatus("Fetching news images...")
      await fetchOGImages(scenes, (s) => callbacks.onStatus(s))

      // Write scenes.json to temp dir
      const tmpDir = path.join(os.tmpdir(), `yomoo-video-${date}`)
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true })
      }
      scenesJsonPath = path.join(tmpDir, "scenes.json")
      fs.writeFileSync(scenesJsonPath, JSON.stringify(scenes, null, 2), "utf-8")
      console.info("[pipeline] Scenes written to:", scenesJsonPath)
      callbacks.onStatus(`Scene generation complete: ${scenes.scenes.length} scenes`)

      // Download OG images to Remotion public/ dir
      await downloadOGImages(scenes, scenesJsonPath, (s) => callbacks.onStatus(s))

      // Stage 7: Video Render
      callbacks.onStatus("Rendering video...")
      const outputVideoPath = path.join(tmpDir, "video.mp4")
      const thumbnailOutputPath = path.join(tmpDir, "thumbnail.png")

      await renderVideo(scenesJsonPath, audioFilePath, outputVideoPath, {
        onProgress: (pct) => callbacks.onStatus(`Rendering video: ${pct}%`),
        onStatus: (status) => callbacks.onStatus(status),
      })

      // Render thumbnail
      await renderThumbnail(scenesJsonPath, thumbnailOutputPath, {
        onStatus: (status) => callbacks.onStatus(status),
      })

      console.info("[pipeline] Video rendered:", outputVideoPath)
      console.info("[pipeline] Thumbnail rendered:", thumbnailOutputPath)

      // Stage 8: YouTube Upload (if enabled)
      if (youtubeEnabled) {
        step++
        callbacks.onStage("youtube")
        callbacks.onProgress(step, total)
        callbacks.onStatus("Uploading to YouTube...")

        try {
          // Refresh access token
          const accessToken = await refreshAccessToken(
            prefs.youtubeRefreshToken,
            prefs.youtubeClientId,
            prefs.youtubeClientSecret,
          )

          // Extract headlines from scenes for description
          const headlines = scenes.scenes
            .filter((s) => s.type === "news" && s.title)
            .map((s) => s.title!)

          const description = buildVideoDescription(date, headlines, pageUrl, audioUrl)

          // Upload video
          const videoId = await uploadVideo({
            accessToken,
            videoPath: outputVideoPath,
            title: scenes.youtubeTitle || `YOMOO 每日AI快送 — ${date}`,
            description,
            tags: ["AI", "每日AI快送", "YOMOO", "科技新闻", "AI新闻"],
            categoryId: "28",
            privacyStatus: "public",
            onProgress: (pct) => callbacks.onStatus(`Uploading to YouTube: ${pct}%`),
          })

          // Set thumbnail
          try {
            await setThumbnail(videoId, thumbnailOutputPath, accessToken)
            callbacks.onStatus("Thumbnail set successfully")
          } catch (thumbErr) {
            // Non-fatal: YouTube will auto-select a frame
            console.info("[pipeline] Thumbnail set failed (non-fatal):", thumbErr)
            callbacks.onStatus("Thumbnail set failed, YouTube will auto-select a frame")
          }

          youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
          console.info("[pipeline] YouTube upload complete:", youtubeUrl)
          callbacks.onStatus(`YouTube upload complete: ${youtubeUrl}`)
        } catch (err) {
          // YouTube upload failure is non-fatal for the overall pipeline
          console.info("[pipeline] YouTube upload failed (non-fatal):", err)
          callbacks.onStatus(`YouTube upload failed: ${err}`)
        }
      }
    } catch (err) {
      // Video generation failure is non-fatal for the overall pipeline
      console.info("[pipeline] Video generation failed (non-fatal):", err)
      callbacks.onStatus(`Video generation skipped: ${err}`)
    }
  }

  callbacks.onProgress(total, total)
  callbacks.onDone({ pageUrl, audioUrl, date, youtubeUrl })
}

/**
 * Run only the video generation + YouTube upload stages,
 * reusing today's existing report, podcast script, and audio file.
 */
export async function runVideoOnly(callbacks: PipelineCallbacks): Promise<void> {
  const prefs = loadPreferences()
  const date = new Date().toISOString().slice(0, 10)

  const total = 3 // video, youtube, done
  let step = 0

  // Validate required config (Deepgram needed unless SRT file exists)
  // We check for SRT later, but still need Deepgram as fallback
  const hasDeegramKey = !!prefs.deepgramApiKey

  // Load report and podcast script from database
  callbacks.onStage("video")
  callbacks.onProgress(step, total)
  callbacks.onStatus("Loading today's report and podcast script...")

  const report = queryOne<{ content: string }>(
    "SELECT content FROM reports WHERE type = 'report' AND title LIKE ? ORDER BY created_at DESC LIMIT 1",
    [`%${date}%`],
  )
  const podcast = queryOne<{ content: string }>(
    "SELECT content FROM reports WHERE type = 'podcast' AND title LIKE ? ORDER BY created_at DESC LIMIT 1",
    [`%${date}%`],
  )

  if (!report?.content) {
    callbacks.onError("video", `No report found for ${date}. Run full pipeline first.`)
    return
  }
  if (!podcast?.content) {
    callbacks.onError("video", `No podcast script found for ${date}. Run full pipeline first.`)
    return
  }

  const reportContent = report.content
  const podcastScript = podcast.content

  // Find today's audio file (most recent mp3)
  const audioDir = path.join(
    process.env.HOME || os.homedir(),
    "Library",
    "Application Support",
    "simple-reader",
    "audio",
  )
  const audioFiles = fs.existsSync(audioDir)
    ? fs
        .readdirSync(audioDir)
        .filter((f) => f.endsWith(".mp3"))
        .sort()
        .reverse()
    : []

  if (audioFiles.length === 0) {
    callbacks.onError("video", "No audio file found. Run full pipeline first.")
    return
  }

  const audioFilePath = path.join(audioDir, audioFiles[0]!)
  callbacks.onStatus(`Using audio: ${audioFiles[0]}`)

  // Derive URLs from today's date
  const owner = prefs.githubOwner || "YOMOO-LLC"
  const pageUrl = getGitHubPagesUrl(owner, date)
  const audioUrl = `https://github.com/${owner}/yomoo-daily/releases/download/v${date}/yomoo-${date}.mp3`

  let youtubeUrl: string | undefined

  // Stage 1: Scene Generation + Video Render
  step++
  callbacks.onProgress(step, total)

  try {
    let alignedSegments: import("./scene-generator").AlignedSegment[]
    let deepgramWords: import("./deepgram").DeepgramWord[] = []
    let subtitles: import("./scene-generator").SubtitleLine[]
    let audioDuration = 0

    // Check for existing SRT file alongside the audio (from MiniMax TTS)
    const srtPath = audioFilePath.replace(/\.mp3$/, ".srt")
    if (fs.existsSync(srtPath)) {
      callbacks.onStatus("Found SRT subtitle file, skipping Deepgram...")
      console.info("[pipeline-video] Using existing SRT:", srtPath)

      const srtSubtitles = parseSrtFile(srtPath)
      alignedSegments = srtSubtitles.map((s) => ({ text: s.text, start: s.start, end: s.end }))
      subtitles = srtSubtitles.map((s) => ({ text: s.text, start: s.start, end: s.end }))
      audioDuration = srtSubtitles.at(-1)?.end || 0

      console.info("[pipeline-video] Loaded", srtSubtitles.length, "subtitle segments from SRT")
    } else if (hasDeegramKey) {
      // Fallback: Deepgram transcription
      callbacks.onStatus("Transcribing audio with Deepgram...")
      const deepgramResult = await transcribeAudio(audioFilePath, prefs.deepgramApiKey, {
        onStatus: (status) => callbacks.onStatus(status),
      })
      deepgramWords = deepgramResult.words

      callbacks.onStatus("Aligning transcript with script...")
      alignedSegments = alignTranscriptWithScript(deepgramWords, podcastScript)

      if (deepgramWords.length > 0) {
        audioDuration = deepgramWords.at(-1)!.end
      }

      callbacks.onStatus("Generating subtitles with LLM...")
      subtitles = await generateSubtitlesWithLLM(alignedSegments, deepgramWords, (s) =>
        callbacks.onStatus(s),
      )
    } else {
      callbacks.onError("video", "No SRT file found and Deepgram API Key not configured.")
      return
    }

    const scenes = await generateScenes(
      alignedSegments,
      reportContent,
      audioDuration,
      (status) => callbacks.onStatus(status),
      deepgramWords,
    )

    scenes.subtitles = subtitles
    console.info(`[pipeline-video] Generated ${subtitles.length} subtitle lines`)

    callbacks.onStatus("Fetching news images...")
    await fetchOGImages(scenes, (s) => callbacks.onStatus(s))

    const tmpDir = path.join(os.tmpdir(), `yomoo-video-${date}`)
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }
    const scenesJsonPath = path.join(tmpDir, "scenes.json")
    fs.writeFileSync(scenesJsonPath, JSON.stringify(scenes, null, 2), "utf-8")
    callbacks.onStatus(`Scene generation complete: ${scenes.scenes.length} scenes`)

    await downloadOGImages(scenes, scenesJsonPath, (s) => callbacks.onStatus(s))

    callbacks.onStatus("Rendering video...")
    const outputVideoPath = path.join(tmpDir, "video.mp4")
    const thumbnailOutputPath = path.join(tmpDir, "thumbnail.png")

    await renderVideo(scenesJsonPath, audioFilePath, outputVideoPath, {
      onProgress: (pct) => callbacks.onStatus(`Rendering video: ${pct}%`),
      onStatus: (status) => callbacks.onStatus(status),
    })

    await renderThumbnail(scenesJsonPath, thumbnailOutputPath, {
      onStatus: (status) => callbacks.onStatus(status),
    })

    console.info("[pipeline-video] Video rendered:", outputVideoPath)

    // Stage 2: YouTube Upload
    if (prefs.youtubeEnabled && prefs.youtubeRefreshToken) {
      step++
      callbacks.onStage("youtube")
      callbacks.onProgress(step, total)
      callbacks.onStatus("Uploading to YouTube...")

      try {
        const accessToken = await refreshAccessToken(
          prefs.youtubeRefreshToken,
          prefs.youtubeClientId,
          prefs.youtubeClientSecret,
        )

        const headlines = scenes.scenes
          .filter((s) => s.type === "news" && s.title)
          .map((s) => s.title!)

        const description = buildVideoDescription(date, headlines, pageUrl, audioUrl)

        const videoId = await uploadVideo({
          accessToken,
          videoPath: outputVideoPath,
          title: scenes.youtubeTitle || `YOMOO 每日AI快送 — ${date}`,
          description,
          tags: ["AI", "每日AI快送", "YOMOO", "科技新闻", "AI新闻"],
          categoryId: "28",
          privacyStatus: "public",
          onProgress: (pct) => callbacks.onStatus(`Uploading to YouTube: ${pct}%`),
        })

        try {
          await setThumbnail(videoId, thumbnailOutputPath, accessToken)
          callbacks.onStatus("Thumbnail set successfully")
        } catch (thumbErr) {
          console.info("[pipeline-video] Thumbnail set failed (non-fatal):", thumbErr)
        }

        youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
        console.info("[pipeline-video] YouTube upload complete:", youtubeUrl)
        callbacks.onStatus(`YouTube upload complete: ${youtubeUrl}`)
      } catch (err) {
        console.info("[pipeline-video] YouTube upload failed:", err)
        callbacks.onStatus(`YouTube upload failed: ${err}`)
      }
    }
  } catch (err) {
    callbacks.onError("video", `Video generation failed: ${err}`)
    return
  }

  callbacks.onProgress(total, total)
  callbacks.onDone({ pageUrl, audioUrl, date, youtubeUrl })
}

/**
 * Parse an SRT file into SubtitleSegment[].
 */
function parseSrtFile(srtPath: string): SubtitleSegment[] {
  const content = fs.readFileSync(srtPath, "utf-8")
  const blocks = content.split(/\n{2,}/).filter((b) => b.trim().length > 0)
  const segments: SubtitleSegment[] = []

  for (const block of blocks) {
    const lines = block.trim().split("\n")
    if (lines.length < 3) continue

    const timeMatch = lines[1]!.match(
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/,
    )
    if (!timeMatch) continue

    const start =
      Number(timeMatch[1]) * 3600 +
      Number(timeMatch[2]) * 60 +
      Number(timeMatch[3]) +
      Number(timeMatch[4]) / 1000
    const end =
      Number(timeMatch[5]) * 3600 +
      Number(timeMatch[6]) * 60 +
      Number(timeMatch[7]) +
      Number(timeMatch[8]) / 1000
    const text = lines.slice(2).join("\n").trim()

    if (text.length > 0) {
      segments.push({ text, start, end })
    }
  }

  return segments
}
