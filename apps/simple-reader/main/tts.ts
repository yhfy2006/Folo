import fs from "node:fs"

import { app } from "electron"
import path from "pathe"

import { loadPreferences } from "./preferences"

const API_BASE = "https://api.minimax.io/v1"
const SYNC_CHAR_LIMIT = 10_000

/**
 * Preprocess text for optimal TTS output.
 * Converts special characters that TTS engines skip or misread
 * into pause markers or natural speech equivalents.
 */
function preprocessTextForTts(text: string): string {
  let result = text

  // Chinese em dash (——) → pause 0.5s
  // Often used for parenthetical remarks or dramatic pauses
  result = result.replaceAll("——", "<#0.3#>")
  // Single em dash (—) → short pause
  result = result.replaceAll("—", "<#0.3#>")

  // Chinese ellipsis (……) → pause 0.8s (trailing off effect)
  result = result.replaceAll("……", "<#0.8#>")
  // Western ellipsis (...) → pause 0.6s
  result = result.replaceAll(/\.{3,}/g, "<#0.6#>")
  // Unicode ellipsis (…) → pause 0.5s
  result = result.replaceAll("…", "<#0.3#>")

  // En dash (–) → short pause
  result = result.replaceAll("–", "<#0.2#>")

  // Multiple exclamation/question marks → single + pause for emphasis
  result = result.replaceAll(/！{2,}/g, "！<#0.3#>")
  result = result.replaceAll(/？{2,}/g, "？<#0.3#>")
  result = result.replaceAll(/!{2,}/g, "!<#0.3#>")
  result = result.replaceAll(/\?{2,}/g, "?<#0.3#>")

  // Asterisks used for emphasis (*text* or **text**) → remove markers
  result = result.replaceAll(/\*{1,2}([^*]+)\*{1,2}/g, "$1")

  // Markdown remnants that might slip through
  result = result.replaceAll(/^#{1,6}\s+/gm, "")
  result = result.replaceAll(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → text
  result = result.replaceAll(/`([^`]+)`/g, "$1") // `code` → code

  // Bullet points → slight pause
  result = result.replaceAll(/^\s*[-•]\s+/gm, "<#0.2#>")

  // Numbered lists → slight pause
  result = result.replaceAll(/^\s*\d+[.)]\s+/gm, "<#0.2#>")

  // Slash used as "or" (AI/ML) — keep as is, TTS handles it
  // Parentheses — keep, TTS reads them as asides

  // Clean up any consecutive pause markers (not allowed by MiniMax)
  result = result.replaceAll(/<#[\d.]+#>\s*<#[\d.]+#>/g, (match) => {
    // Merge consecutive pauses: take the longer one
    const pauses = [...match.matchAll(/<#([\d.]+)#>/g)].map((m) => Number.parseFloat(m[1]!))
    const maxPause = Math.min(Math.max(...pauses), 3)
    return `<#${maxPause.toFixed(1)}#>`
  })

  // Clean up pause markers at the very start or end
  result = result.replace(/^(?:\s*<#[\d.]+#>)+\s*/, "")
  result = result.replace(/\s*(?:<#[\d.]+#>\s*)+$/, "")

  // Add paragraph pauses: double newlines → pause 0.5s
  result = result.replaceAll(/\n{2,}/g, "\n<#0.5#>\n")
  // Single newlines within paragraphs → short pause
  result = result.replaceAll("\n", "<#0.3#>")

  // Clean up consecutive pauses again after newline processing
  result = result.replaceAll(/<#[\d.]+#>\s*<#[\d.]+#>/g, (match) => {
    const pauses = [...match.matchAll(/<#([\d.]+)#>/g)].map((m) => Number.parseFloat(m[1]!))
    const maxPause = Math.min(Math.max(...pauses), 3)
    return `<#${maxPause.toFixed(1)}#>`
  })

  return result.trim()
}

function getAudioDir(): string {
  const dir = path.join(app.getPath("userData"), "audio")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export interface SubtitleSegment {
  text: string
  start: number // seconds
  end: number // seconds
}

export interface TtsResult {
  filePath: string
  subtitles?: SubtitleSegment[]
}

interface TtsCallbacks {
  onStatus: (status: string) => void
  onDone: (filePath: string, subtitles?: SubtitleSegment[]) => void
  onError: (error: string) => void
}

/**
 * Convert text to audio using MiniMax TTS API.
 * Automatically uses sync API for short text, async API for long text.
 */
export async function generateAudio(text: string, callbacks: TtsCallbacks): Promise<void> {
  const prefs = loadPreferences()

  if (!prefs.minimaxApiKey) {
    callbacks.onError("MiniMax API Key not configured. Please set it in Preferences.")
    return
  }

  const headers = {
    Authorization: `Bearer ${prefs.minimaxApiKey}`,
    "Content-Type": "application/json",
  }

  const voiceSetting = {
    voice_id: prefs.ttsVoiceId || "English_Graceful_Lady",
    speed: 1,
    vol: 1,
    pitch: 0,
    text_normalization: true,
  }

  const audioSetting = {
    sample_rate: 32000,
    bitrate: 128000,
    format: "mp3",
    channel: 1,
  }

  const processedText = preprocessTextForTts(text)
  console.info("[tts] Original text length:", text.length, "Processed:", processedText.length)

  if (processedText.length <= SYNC_CHAR_LIMIT) {
    await generateSync(
      processedText,
      prefs.ttsModel,
      voiceSetting,
      audioSetting,
      headers,
      callbacks,
    )
  } else {
    await generateAsync(
      processedText,
      prefs.ttsModel,
      voiceSetting,
      audioSetting,
      headers,
      callbacks,
    )
  }
}

async function generateSync(
  text: string,
  model: string,
  voiceSetting: object,
  audioSetting: object,
  headers: Record<string, string>,
  callbacks: TtsCallbacks,
): Promise<void> {
  callbacks.onStatus("Generating audio (sync)...")

  try {
    const resp = await fetch(`${API_BASE}/t2a_v2`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        text,
        stream: false,
        subtitle_enable: true,
        voice_setting: voiceSetting,
        audio_setting: audioSetting,
        language_boost: "auto",
      }),
    })

    if (!resp.ok) {
      callbacks.onError(`MiniMax API error: HTTP ${resp.status} ${resp.statusText}`)
      return
    }

    const data = await resp.json()

    if (data.base_resp?.status_code !== 0) {
      callbacks.onError(`MiniMax API error: ${data.base_resp?.status_msg || "Unknown error"}`)
      return
    }

    // data.data.audio is hex-encoded audio
    const audioHex = data.data?.audio
    if (!audioHex) {
      callbacks.onError("No audio data in response")
      return
    }

    const audioBuffer = Buffer.from(audioHex, "hex")
    const fileName = `podcast-${Date.now()}.mp3`
    const filePath = path.join(getAudioDir(), fileName)
    fs.writeFileSync(filePath, audioBuffer)

    console.info("[tts] Audio saved:", filePath, `(${audioBuffer.length} bytes)`)

    // Fetch subtitles if available (non-blocking, errors are swallowed)
    let subtitles: SubtitleSegment[] | undefined
    try {
      const subtitleUrl = data.data?.subtitle_file
      if (subtitleUrl && typeof subtitleUrl === "string") {
        subtitles = await fetchAndParseSubtitles(subtitleUrl, headers)
        console.info("[tts] Subtitles fetched:", subtitles.length, "segments")

        // Save subtitles as SRT file alongside the audio
        const srtFileName = fileName.replace(/\.mp3$/, ".srt")
        const srtPath = path.join(getAudioDir(), srtFileName)
        fs.writeFileSync(srtPath, subtitlesToSrt(subtitles), "utf-8")
        console.info("[tts] SRT saved:", srtPath)
      }
    } catch (err) {
      console.warn("[tts] Failed to fetch subtitles (non-blocking):", String(err))
      subtitles = undefined
    }

    callbacks.onDone(filePath, subtitles)
  } catch (err) {
    callbacks.onError(`TTS request failed: ${err}`)
  }
}

async function generateAsync(
  text: string,
  model: string,
  voiceSetting: object,
  audioSetting: object,
  headers: Record<string, string>,
  callbacks: TtsCallbacks,
): Promise<void> {
  callbacks.onStatus(`Submitting long text (${text.length} chars) for async generation...`)

  // Step 1: Submit async task
  let taskId: number
  try {
    const resp = await fetch(`${API_BASE}/t2a_async_v2`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        text,
        voice_setting: voiceSetting,
        audio_setting: audioSetting,
        language_boost: "auto",
      }),
    })

    if (!resp.ok) {
      callbacks.onError(`MiniMax API error: HTTP ${resp.status} ${resp.statusText}`)
      return
    }

    const data = await resp.json()
    if (data.base_resp?.status_code !== 0) {
      callbacks.onError(`MiniMax API error: ${data.base_resp?.status_msg || "Unknown error"}`)
      return
    }

    taskId = data.task_id
    if (!taskId) {
      callbacks.onError("No task_id in async response")
      return
    }

    console.info("[tts] Async task submitted:", taskId)
  } catch (err) {
    callbacks.onError(`Failed to submit async TTS task: ${err}`)
    return
  }

  // Step 2: Poll for completion
  callbacks.onStatus("Audio generation in progress...")
  let fileId: number | null = null
  const maxAttempts = 200 // ~10 minutes at 3s intervals
  pollLoop: for (let i = 0; i < maxAttempts; i++) {
    await sleep(3000)

    try {
      const resp = await fetch(`${API_BASE}/query/t2a_async_query_v2?task_id=${taskId}`, {
        headers: { Authorization: headers.Authorization },
      })

      if (!resp.ok) {
        console.warn("[tts] Poll error:", resp.status)
        continue
      }

      const data = await resp.json()
      const status = (data.status || "").toLowerCase()

      switch (status) {
        case "success": {
          fileId = data.file_id
          break pollLoop
        }
        case "failed": {
          callbacks.onError("Audio generation failed on MiniMax server")
          return
        }
        case "expired": {
          callbacks.onError("Audio generation task expired")
          return
        }
        default: {
          break
        }
      }

      // Still processing
      callbacks.onStatus(`Audio generation in progress... (${i * 3}s)`)
    } catch (err) {
      console.warn("[tts] Poll request error:", err)
    }
  }

  if (!fileId) {
    callbacks.onError("Audio generation timed out")
    return
  }

  // Step 3: Download audio file
  callbacks.onStatus("Downloading audio file...")
  try {
    const resp = await fetch(`${API_BASE}/files/retrieve_content?file_id=${fileId}`, {
      headers: { Authorization: headers.Authorization },
    })

    if (!resp.ok) {
      callbacks.onError(`Failed to download audio: HTTP ${resp.status}`)
      return
    }

    const arrayBuffer = await resp.arrayBuffer()
    const audioBuffer = Buffer.from(arrayBuffer)
    const fileName = `podcast-${Date.now()}.mp3`
    const filePath = path.join(getAudioDir(), fileName)
    fs.writeFileSync(filePath, audioBuffer)

    console.info("[tts] Async audio saved:", filePath, `(${audioBuffer.length} bytes)`)
    callbacks.onDone(filePath)
  } catch (err) {
    callbacks.onError(`Failed to download audio: ${err}`)
  }
}

/**
 * Fetch subtitle JSON from MiniMax subtitle_file URL and convert to SubtitleSegment[].
 * MiniMax returns sentence-level subtitles with millisecond timestamps.
 */
async function fetchAndParseSubtitles(
  url: string,
  headers: Record<string, string>,
): Promise<SubtitleSegment[]> {
  const resp = await fetch(url, {
    headers: { Authorization: headers.Authorization },
  })

  if (!resp.ok) {
    throw new Error(`Subtitle fetch failed: HTTP ${resp.status}`)
  }

  const data = await resp.json()

  // MiniMax subtitle format: array of {text, begin_time, end_time} with ms timestamps
  // or {subtitles: [{text, begin_time, end_time}]}
  const items: Array<{ text: string; begin_time: number; end_time: number }> = Array.isArray(data)
    ? data
    : data.subtitles || data.data || []

  return items
    .filter((item) => item.text && item.text.trim().length > 0)
    .map((item) => ({
      text: item.text.trim(),
      start: item.begin_time / 1000, // ms → seconds
      end: item.end_time / 1000,
    }))
}

/**
 * Convert SubtitleSegment[] to SRT format string.
 */
function subtitlesToSrt(segments: SubtitleSegment[]): string {
  return segments
    .map((seg, i) => {
      const startTs = formatSrtTime(seg.start)
      const endTs = formatSrtTime(seg.end)
      return `${i + 1}\n${startTs} --> ${endTs}\n${seg.text}\n`
    })
    .join("\n")
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`
}

/**
 * Promise-based wrapper: generates audio and returns file path + optional subtitles.
 */
export async function generateAudioToFile(
  text: string,
  onStatus: (status: string) => void,
): Promise<TtsResult> {
  return new Promise((resolve, reject) => {
    generateAudio(text, {
      onStatus,
      onDone: (filePath, subtitles) => resolve({ filePath, subtitles }),
      onError: (error) => reject(new Error(error)),
    }).catch(reject)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
