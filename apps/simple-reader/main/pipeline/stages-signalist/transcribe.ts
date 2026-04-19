import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"

import path from "pathe"

import type { PipelineContext } from "../context"
import type { TranscriptData } from "../signalist-types"
import type { StageCallbacks, StageDefinition } from "../types"

// ── yt-dlp path resolution ───────────────────────────────────────────

export function findYtDlp(): string {
  const candidates = [
    "/opt/homebrew/bin/yt-dlp",
    "/usr/local/bin/yt-dlp",
    path.join(os.homedir(), ".local", "bin", "yt-dlp"),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return "yt-dlp"
}

// ── execFile wrapper ─────────────────────────────────────────────────

export function exec(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} failed: ${stderr || err.message}`))
      } else {
        resolve(stdout)
      }
    })
  })
}

// ── Subtitle download via yt-dlp ─────────────────────────────────────

export async function downloadSubtitles(
  videoUrl: string,
  videoId: string,
  workDir: string,
): Promise<string | null> {
  const ytDlp = findYtDlp()

  try {
    await exec(
      ytDlp,
      [
        "--write-sub",
        "--write-auto-sub",
        "--sub-lang",
        "en",
        "--sub-format",
        "srt",
        "--skip-download",
        "-o",
        path.join(workDir, `${videoId}.%(ext)s`),
        videoUrl,
      ],
      workDir,
    )
  } catch (err) {
    console.info(`[transcribe] yt-dlp subtitle download failed for ${videoId}:`, err)
    return null
  }

  // Search for the resulting .srt file
  let entries: string[]
  try {
    entries = fs.readdirSync(workDir)
  } catch {
    return null
  }

  const srtFile = entries.find((f) => f.startsWith(videoId) && f.endsWith(".srt"))
  if (!srtFile) return null

  return path.join(workDir, srtFile)
}

// ── Whisper transcription fallback ───────────────────────────────────

export async function whisperTranscribe(
  videoUrl: string,
  videoId: string,
  workDir: string,
  onStatus: (status: string) => void,
): Promise<string | null> {
  // Check if whisper is installed
  try {
    await exec("which", ["whisper"])
  } catch {
    onStatus("[transcribe] whisper not found — skipping Whisper fallback")
    return null
  }

  const ytDlp = findYtDlp()
  const audioPath = path.join(workDir, `${videoId}.wav`)

  onStatus(`Downloading audio for Whisper: ${videoId}`)
  try {
    await exec(ytDlp, ["-x", "--audio-format", "wav", "-o", audioPath, videoUrl], workDir)
  } catch (err) {
    console.error(`[transcribe] yt-dlp audio download failed for ${videoId}:`, err)
    return null
  }

  if (!fs.existsSync(audioPath)) {
    console.error(`[transcribe] Audio file not found after download: ${audioPath}`)
    return null
  }

  onStatus(`Running Whisper on: ${videoId}`)
  try {
    await exec("whisper", [audioPath, "--output_format", "srt", "--output_dir", workDir], workDir)
  } catch (err) {
    console.error(`[transcribe] Whisper failed for ${videoId}:`, err)
    return null
  }

  // Whisper writes <basename>.srt
  const expectedSrt = path.join(workDir, `${videoId}.srt`)
  if (fs.existsSync(expectedSrt)) return expectedSrt

  // Fallback: search for any newly created .srt
  let entries: string[]
  try {
    entries = fs.readdirSync(workDir)
  } catch {
    return null
  }

  const srtFile = entries.find((f) => f.endsWith(".srt"))
  return srtFile ? path.join(workDir, srtFile) : null
}

// ── Transcribe a single video ────────────────────────────────────────

export async function transcribeVideo(
  video: { videoId: string; url: string },
  workDir: string,
  onStatus: (status: string) => void,
): Promise<TranscriptData | null> {
  const { videoId, url } = video

  // Try YouTube captions first
  onStatus(`Downloading subtitles for: ${videoId}`)
  let srtPath = await downloadSubtitles(url, videoId, workDir)
  let source: "youtube" | "whisper" = "youtube"

  if (!srtPath) {
    onStatus(`No subtitles found — falling back to Whisper for: ${videoId}`)
    srtPath = await whisperTranscribe(url, videoId, workDir, onStatus)
    source = "whisper"
  }

  if (!srtPath) {
    console.error(`[transcribe] No transcript available for ${videoId}`)
    return null
  }

  let srtContent: string
  try {
    srtContent = fs.readFileSync(srtPath, "utf-8")
  } catch (err) {
    console.error(`[transcribe] Failed to read SRT file ${srtPath}:`, err)
    return null
  }

  if (srtContent.length < 100) {
    console.info(
      `[transcribe] SRT content too short (${srtContent.length} chars), skipping ${videoId}`,
    )
    return null
  }

  return {
    videoId,
    srtPath,
    srtContent,
    source,
    language: "en",
  }
}

// ── Stage definition ─────────────────────────────────────────────────

export const transcribeStage: StageDefinition = {
  name: "transcribe",
  label: "Transcribe Videos",

  shouldRun: (ctx: PipelineContext): boolean => {
    if (ctx.channel?.pipelineType !== "signalist") return false
    const passed = (ctx.screenedVideos ?? []).filter((v) => v.pass)
    return passed.length > 0
  },

  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    // Validate yt-dlp is available
    const ytDlp = findYtDlp()
    try {
      await exec(ytDlp, ["--version"])
    } catch {
      throw new Error(
        `yt-dlp not found. Please install it (e.g. brew install yt-dlp) and try again.`,
      )
    }

    const passed = (ctx.screenedVideos ?? []).filter((v) => v.pass)
    callbacks.onStatus(
      `Transcribe stage ready — ${passed.length} video(s) to process. Transcription runs per-video in the orchestrator.`,
    )

    return ctx
  },
}
