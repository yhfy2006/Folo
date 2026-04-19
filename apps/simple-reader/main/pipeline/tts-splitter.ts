import type { SubtitleSegment } from "../tts"

const ZH_MAX_CHARS = 20
const DEFAULT_MAX_CHARS = 150

/** Chinese punctuation plus ASCII equivalents commonly used in Chinese text */
const ZH_PUNCTUATION_RE = /(?<=[，。、；：！？,;:!?])/
/** Sentence boundaries for English/Latin text: punctuation followed by whitespace */
const EN_SENTENCE_RE = /(?<=[.!?])\s+/

/**
 * Split subtitle segments into shorter lines appropriate for the given language.
 *
 * - Chinese (language starts with "zh"): split at Chinese punctuation, max ~20 chars
 * - English/others: split at sentence boundaries (.!? + whitespace), max ~150 chars
 *
 * Segments already under the limit pass through unchanged.
 * Oversized segments are split at punctuation first, then force-split at max chars.
 * Timestamps are distributed proportionally by character count.
 */
export function splitSubtitlesForLanguage(
  segments: SubtitleSegment[],
  language: string,
): SubtitleSegment[] {
  const isChinese = language.toLowerCase().startsWith("zh")
  const maxChars = isChinese ? ZH_MAX_CHARS : DEFAULT_MAX_CHARS
  const splitRe = isChinese ? ZH_PUNCTUATION_RE : EN_SENTENCE_RE

  const result: SubtitleSegment[] = []

  for (const seg of segments) {
    if (seg.text.length <= maxChars) {
      result.push(seg)
      continue
    }

    // Phase 1: split at natural punctuation / sentence boundaries
    const parts = seg.text.split(splitRe).filter((p) => p.trim().length > 0)

    // Phase 2: force-split any parts still exceeding the limit
    const chunks: string[] = []
    for (const part of parts) {
      if (part.length <= maxChars) {
        chunks.push(part)
      } else {
        for (let i = 0; i < part.length; i += maxChars) {
          chunks.push(part.slice(i, i + maxChars))
        }
      }
    }

    // Distribute timestamps proportionally by character count
    const totalChars = chunks.reduce((sum, c) => sum + c.length, 0)
    const duration = seg.end - seg.start
    let currentTime = seg.start

    for (const chunk of chunks) {
      const chunkDuration = (chunk.length / totalChars) * duration
      result.push({
        text: chunk.trim(),
        start: currentTime,
        end: currentTime + chunkDuration,
      })
      currentTime += chunkDuration
    }
  }

  return result
}
