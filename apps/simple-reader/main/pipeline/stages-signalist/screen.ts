import { spawn } from "node:child_process"
import os from "node:os"

import path from "pathe"

import type { PipelineContext } from "../context"
import { loadPrompt } from "../prompt-loader"
import type { ScreenedVideo } from "../signalist-types"
import type { StageCallbacks, StageDefinition } from "../types"

// ── Claude CLI helper ───────────────────────────────────────────────

function getClaudePath(): string {
  const home = os.homedir()
  return path.join(home, ".local", "bin", "claude")
}

function callClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const claudePath = getClaudePath()
    const child = spawn(claudePath, ["--print", "--model", "sonnet", "-p", prompt], {
      env: { ...process.env },
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`))
      } else {
        resolve(stdout)
      }
    })

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`))
    })
  })
}

// ── YouTube video ID extractor ──────────────────────────────────────

function extractVideoId(url: string): string | null {
  // youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/[?&]v=([\w-]{11})/)
  if (watchMatch) return watchMatch[1]

  // youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([\w-]{11})/)
  if (shortMatch) return shortMatch[1]

  // youtube.com/embed/VIDEO_ID
  const embedMatch = url.match(/youtube\.com\/embed\/([\w-]{11})/)
  if (embedMatch) return embedMatch[1]

  return null
}

// ── Default screening prompt ────────────────────────────────────────

const DEFAULT_SCREENING_PROMPT = `You are a content screening assistant. Evaluate whether the following video is worth creating short-form clips from.

Video Title: {{videoTitle}}
Channel: {{channelName}}
Duration: {{videoDuration}} seconds
Topics of interest: {{topics}}

Description:
{{videoDescription}}

Respond with a JSON object containing:
- "pass": boolean — true if this video is worth screening for clips
- "reason": string — brief explanation (1-2 sentences)

Respond with ONLY valid JSON, no other text.`

// ── Screen stage ────────────────────────────────────────────────────

export const screenStage: StageDefinition = {
  name: "screen",
  label: "Screen Videos",

  shouldRun: (ctx: PipelineContext) => ctx.channel?.pipelineType === "signalist",

  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    const candidates = ctx.candidateVideos ?? []
    const minDuration = ctx.channel?.signalist?.minVideoDuration ?? 600
    const topics = ctx.channel?.signalist?.topics ?? []

    callbacks.onStatus(`Screening ${candidates.length} candidate videos...`)

    // Load prompt template once (shared across all videos)
    let promptTemplate: string
    try {
      promptTemplate = loadPrompt(ctx.channel!, "screening.md")
    } catch {
      console.info("[screen] screening.md not found, using default prompt")
      promptTemplate = DEFAULT_SCREENING_PROMPT
    }

    const screenedVideos: ScreenedVideo[] = []

    for (const video of candidates) {
      // Skip videos shorter than minVideoDuration
      if (video.duration < minDuration) {
        callbacks.onStatus(
          `Skipping "${video.title}" — too short (${video.duration}s < ${minDuration}s)`,
        )
        screenedVideos.push({
          video,
          pass: false,
          reason: `Duration too short (${video.duration}s)`,
        })
        continue
      }

      callbacks.onStatus(`Screening: ${video.title}`)

      // Substitute per-video variables into the prompt template
      const prompt = promptTemplate
        .replaceAll("{{videoTitle}}", video.title)
        .replaceAll("{{channelName}}", video.channelName)
        .replaceAll("{{videoDescription}}", video.description)
        .replaceAll("{{videoDuration}}", String(video.duration))
        .replaceAll("{{topics}}", topics.join(", "))

      let pass = false
      let reason = "Claude screening failed"

      try {
        const response = await callClaude(prompt)

        // Extract JSON from Claude's response
        const jsonMatch = response.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { pass?: boolean; reason?: string }
          pass = Boolean(parsed.pass)
          reason = parsed.reason ?? reason
        } else {
          reason = "Could not parse JSON from Claude response"
        }
      } catch (err) {
        console.error(`[screen] Claude error for "${video.title}":`, err)
        reason = `Screening error: ${err}`
      }

      const status = pass ? "PASS" : "SKIP"
      callbacks.onStatus(`[${status}] "${video.title}": ${reason}`)
      console.info(
        `[screen] ${status} videoId=${extractVideoId(video.url) ?? video.videoId} — ${reason}`,
      )

      screenedVideos.push({ video, pass, reason })
    }

    const passed = screenedVideos.filter((v) => v.pass).length
    callbacks.onStatus(`Screening complete: ${passed}/${candidates.length} videos passed`)

    return { ...ctx, screenedVideos }
  },
}
