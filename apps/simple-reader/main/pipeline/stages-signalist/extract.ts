import { spawn } from "node:child_process"
import os from "node:os"

import type { PipelineContext } from "../context"
import { loadPrompt } from "../prompt-loader"
import type { ExtractedClip, TranscriptData } from "../signalist-types"
import type { StageCallbacks, StageDefinition } from "../types"

// ── Claude CLI helper ───────────────────────────────────────────────

function getClaudePath(): string {
  const home = os.homedir()
  return `${home}/.local/bin/claude`
}

export function callClaude(prompt: string): Promise<string> {
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

// ── SRT time parser ─────────────────────────────────────────────────

/**
 * Parse an SRT timestamp ("HH:MM:SS,mmm") to total seconds.
 * Example: "00:12:34,567" → 754.567
 */
export function srtTimeToSeconds(time: string): number {
  // Support both "HH:MM:SS,mmm" and "HH:MM:SS.mmm"
  const match = time.match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/)
  if (!match) return 0

  const hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)
  const seconds = Number.parseInt(match[3], 10)
  const millis = Number.parseInt(match[4], 10)

  return hours * 3600 + minutes * 60 + seconds + millis / 1000
}

// ── Default extract prompt ──────────────────────────────────────────

export const DEFAULT_EXTRACT_PROMPT = `You are an expert content analyst specializing in identifying viral short-form video moments.

Analyze the following SRT transcript and identify the most compelling moments that would work as standalone YouTube Shorts (30-60 seconds each).

Look for moments with high viral potential such as:
- Controversial or surprising statements
- Highly quotable one-liners or memorable phrases
- Emotionally resonant moments (humor, inspiration, shock, empathy)
- Self-contained insights or explanations that make sense without context
- Hot takes, bold claims, or counterintuitive ideas

Requirements:
- Each clip must be 30-60 seconds long
- Align clip boundaries to sentence boundaries (do not cut mid-sentence)
- Only include clips with a viral score of {{viralScoreThreshold}} or higher (on a 0-10 scale)
- Return at most {{maxClips}} clips
- Target duration per clip: approximately {{targetDuration}} seconds
- You may return an empty array if no moments meet the quality bar

Return ONLY a valid JSON array with this structure (no other text):
[
  {
    "id": 1,
    "start_time": "HH:MM:SS,mmm",
    "end_time": "HH:MM:SS,mmm",
    "topic": "Brief topic label (3-6 words)",
    "transcript": "The exact transcript text for this clip",
    "viral_score": 8.5,
    "reason": "Why this moment has viral potential (1-2 sentences)"
  }
]

SRT Transcript:
`

// ── Raw AI response shape ───────────────────────────────────────────

interface RawClip {
  id?: number
  // snake_case (preferred by prompt)
  start_time?: string
  end_time?: string
  viral_score?: number
  // camelCase fallbacks
  startTime?: string
  endTime?: string
  viralScore?: number
  topic?: string
  transcript?: string
  reason?: string
}

// ── Core extraction function ────────────────────────────────────────

export async function extractHighlights(
  transcript: TranscriptData,
  channel: NonNullable<PipelineContext["channel"]>,
  onStatus: (msg: string) => void,
): Promise<ExtractedClip[]> {
  const config = channel.signalist!

  // Load prompt template (falls back to DEFAULT_EXTRACT_PROMPT)
  let prompt: string
  try {
    prompt = loadPrompt(channel, "extract.md", {
      viralScoreThreshold: String(config.viralScoreThreshold),
      maxClips: String(config.maxShortsPerVideo),
      targetDuration: String(config.shortsTargetDuration),
    })
  } catch {
    console.info("[extract] extract.md not found, using default prompt")
    prompt = DEFAULT_EXTRACT_PROMPT.replaceAll(
      "{{viralScoreThreshold}}",
      String(config.viralScoreThreshold),
    )
      .replaceAll("{{maxClips}}", String(config.maxShortsPerVideo))
      .replaceAll("{{targetDuration}}", String(config.shortsTargetDuration))
  }

  // Append the SRT content
  const fullPrompt = prompt + transcript.srtContent

  onStatus(
    `Calling Claude to extract highlights from transcript (videoId=${transcript.videoId})...`,
  )

  const response = await callClaude(fullPrompt)

  // Extract JSON array from response
  const jsonMatch = response.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    console.warn("[extract] No JSON array found in Claude response")
    return []
  }

  let rawClips: RawClip[]
  try {
    rawClips = JSON.parse(jsonMatch[0]) as RawClip[]
  } catch (err) {
    console.error("[extract] Failed to parse JSON from Claude response:", err)
    return []
  }

  if (!Array.isArray(rawClips)) {
    console.warn("[extract] Parsed result is not an array")
    return []
  }

  // Map raw objects → ExtractedClip[], handling both snake_case and camelCase
  const clips: ExtractedClip[] = rawClips
    .map((raw, index): ExtractedClip => {
      const startTime = raw.start_time ?? raw.startTime ?? "00:00:00,000"
      const endTime = raw.end_time ?? raw.endTime ?? "00:00:00,000"
      const viralScore = raw.viral_score ?? raw.viralScore ?? 0
      const startSeconds = srtTimeToSeconds(startTime)
      const endSeconds = srtTimeToSeconds(endTime)
      const durationSeconds = Math.max(0, endSeconds - startSeconds)

      return {
        id: raw.id ?? index + 1,
        startTime,
        endTime,
        durationSeconds,
        topic: raw.topic ?? "",
        transcript: raw.transcript ?? "",
        viralScore,
        reason: raw.reason ?? "",
      }
    })
    // Filter: minimum 10 seconds duration AND meets viral score threshold
    .filter((clip) => clip.durationSeconds >= 10 && clip.viralScore >= config.viralScoreThreshold)
    // Cap to maxShortsPerVideo
    .slice(0, config.maxShortsPerVideo)

  onStatus(`Extracted ${clips.length} qualifying highlight clips`)

  return clips
}

// ── Stage definition ────────────────────────────────────────────────

export const extractStage: StageDefinition = {
  name: "extract",
  label: "Extract Highlights",

  shouldRun: (ctx: PipelineContext) => ctx.channel?.pipelineType === "signalist",

  run: async (ctx: PipelineContext, _callbacks: StageCallbacks): Promise<PipelineContext> => {
    // Actual per-video extraction happens in the orchestrator's per-video loop
    // via the exported extractHighlights() function.
    return ctx
  },
}
