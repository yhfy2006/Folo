import { spawn } from "node:child_process"
import os from "node:os"

import type { PipelineContext } from "../context"
import { loadPrompt } from "../prompt-loader"
import type { ExtractedClip, ShortsScript } from "../signalist-types"
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

// ── Default script prompt ───────────────────────────────────────────

export const DEFAULT_SCRIPT_PROMPT = `You are an expert cinematic scriptwriter specializing in YouTube Shorts text card scripts for interview clips.

For each interview clip provided, create a cinematic text card script that will overlay the video footage.

Guidelines:
- Opening card: bold, movie-tagline style hook that grabs attention immediately, max 15 words
- Segments: split the clip into 2-4 sub-segments; each segment gets a transition text card summarizing or teasing that moment, max 10 words each
- Closing card: a thought-provoking question or memorable summary that lingers after viewing, max 15 words
- suggestedTitle: a compelling YouTube Shorts title optimized for discovery, max 100 characters
- suggestedTags: 5-8 relevant tags without the # symbol

Return ONLY a valid JSON array with this exact structure (no other text):
[
  {
    "clipId": 1,
    "openingCard": "Bold cinematic hook text here",
    "segments": [
      {
        "textCard": "Brief transition card text",
        "clipStart": "HH:MM:SS,mmm",
        "clipEnd": "HH:MM:SS,mmm"
      }
    ],
    "closingCard": "Thought-provoking question or summary",
    "suggestedTitle": "YouTube Shorts title here",
    "suggestedTags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
  }
]

Clips to process:
`

// ── Raw AI response shape ───────────────────────────────────────────

interface RawScriptSegment {
  textCard?: string
  clipStart?: string
  clipEnd?: string
}

interface RawScript {
  clipId?: number
  openingCard?: string
  segments?: RawScriptSegment[]
  closingCard?: string
  suggestedTitle?: string
  suggestedTags?: string[]
}

// ── Core script generation function ────────────────────────────────

export async function generateScripts(
  clips: ExtractedClip[],
  channel: NonNullable<PipelineContext["channel"]>,
  onStatus: (msg: string) => void,
): Promise<ShortsScript[]> {
  // Load prompt template (falls back to DEFAULT_SCRIPT_PROMPT)
  let prompt: string
  try {
    prompt = loadPrompt(channel, "script.md")
  } catch {
    console.info("[script] script.md not found, using default prompt")
    prompt = DEFAULT_SCRIPT_PROMPT
  }

  // Serialize clips to JSON (only the fields the AI needs)
  const clipsPayload = clips.map((clip) => ({
    id: clip.id,
    topic: clip.topic,
    transcript: clip.transcript,
    duration: clip.durationSeconds,
    reason: clip.reason,
  }))

  const fullPrompt = prompt + JSON.stringify(clipsPayload, null, 2)

  onStatus(`Calling Claude to generate scripts for ${clips.length} clip(s)...`)

  const response = await callClaude(fullPrompt)

  // Extract JSON array from response
  const jsonMatch = response.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    console.warn("[script] No JSON array found in Claude response")
    return []
  }

  let rawScripts: RawScript[]
  try {
    rawScripts = JSON.parse(jsonMatch[0]) as RawScript[]
  } catch (err) {
    console.error("[script] Failed to parse JSON from Claude response:", err)
    return []
  }

  if (!Array.isArray(rawScripts)) {
    console.warn("[script] Parsed result is not an array")
    return []
  }

  // Map raw objects → ShortsScript[] with defaults for missing fields
  const scripts: ShortsScript[] = rawScripts.map((raw, index): ShortsScript => {
    const segments = Array.isArray(raw.segments)
      ? raw.segments.map((seg) => ({
          textCard: seg.textCard ?? "",
          clipStart: seg.clipStart ?? "00:00:00,000",
          clipEnd: seg.clipEnd ?? "00:00:00,000",
        }))
      : []

    return {
      clipId: raw.clipId ?? index + 1,
      openingCard: raw.openingCard ?? "",
      segments,
      closingCard: raw.closingCard ?? "",
      suggestedTitle: raw.suggestedTitle ?? "",
      suggestedTags: Array.isArray(raw.suggestedTags) ? raw.suggestedTags : [],
    }
  })

  onStatus(`Generated ${scripts.length} script(s)`)

  return scripts
}

// ── Stage definition ────────────────────────────────────────────────

export const scriptStage: StageDefinition = {
  name: "script",
  label: "Generate Scripts",

  shouldRun: (ctx: PipelineContext) => ctx.channel?.pipelineType === "signalist",

  run: async (ctx: PipelineContext, _callbacks: StageCallbacks): Promise<PipelineContext> => {
    // Actual per-video script generation happens in the orchestrator's per-video loop
    // via the exported generateScripts() function.
    return ctx
  },
}
