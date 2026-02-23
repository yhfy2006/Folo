import fs from "node:fs"

const API_BASE = "https://api.deepgram.com/v1/listen"

export interface DeepgramWord {
  word: string
  start: number
  end: number
  confidence: number
}

export interface DeepgramResult {
  words: DeepgramWord[]
  transcript: string
}

interface TranscribeOptions {
  onStatus?: (status: string) => void
}

/**
 * Transcribe an audio file using Deepgram Nova-3 API.
 * Returns word-level timestamps for timeline alignment.
 */
export async function transcribeAudio(
  audioPath: string,
  apiKey: string,
  options: TranscribeOptions = {},
): Promise<DeepgramResult> {
  const { onStatus } = options

  onStatus?.("Reading audio file...")
  const audioBuffer = fs.readFileSync(audioPath)

  const params = new URLSearchParams({
    model: "nova-2",
    language: "zh",
    punctuate: "true",
    utterances: "true",
    smart_format: "true",
  })

  const url = `${API_BASE}?${params.toString()}`

  onStatus?.("Sending audio to Deepgram for transcription...")
  console.info("[deepgram] Sending audio:", audioPath, `(${audioBuffer.length} bytes)`)

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "audio/mpeg",
    },
    body: audioBuffer,
  })

  if (!resp.ok) {
    throw new Error(`Deepgram API error: HTTP ${resp.status} ${resp.statusText}`)
  }

  const data = await resp.json()

  const alternative = data.results?.channels?.[0]?.alternatives?.[0]
  if (!alternative) {
    console.info("[deepgram] No transcription results")
    return { words: [], transcript: "" }
  }

  const words: DeepgramWord[] = (alternative.words || []).map(
    (w: { word: string; start: number; end: number; confidence: number }) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: w.confidence,
    }),
  )

  const transcript = alternative.transcript || ""

  console.info("[deepgram] Transcription complete:", words.length, "words")
  onStatus?.(`Transcription complete: ${words.length} words`)

  return { words, transcript }
}
