import { spawn } from "node:child_process"
import os from "node:os"

import type { DeepgramWord } from "./deepgram"

export interface AlignedSegment {
  text: string
  start: number
  end: number
}

export interface ScenePoint {
  text: string
  showAt: number
}

export interface Scene {
  type: "intro" | "overview" | "news" | "outro"
  start: number
  end: number
  headlines?: string[]
  index?: number
  total?: number
  title?: string
  source?: string
  sourceUrl?: string
  ogImage?: string
  points?: ScenePoint[]
}

export interface ScenesJson {
  date: string
  title: string
  audioDuration: number
  fps: number
  scenes: Scene[]
  thumbnailTitle?: string
  youtubeTitle?: string
}

/**
 * Normalize text for fuzzy matching: remove punctuation, lowercase, collapse whitespace.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[\s\p{P}]/gu, "")
    .trim()
}

/**
 * Align Deepgram word-level timestamps with the original script paragraphs.
 *
 * Algorithm: For each paragraph of the original script, use sliding window
 * fuzzy matching against the concatenated Deepgram words to find the best
 * matching position, then extract the time range from those words.
 *
 * Text content uses the original script (ground truth); timestamps use Deepgram.
 */
export function alignTranscriptWithScript(
  deepgramWords: DeepgramWord[],
  originalScript: string,
): AlignedSegment[] {
  // Split script into non-empty paragraphs
  const paragraphs = originalScript
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  if (paragraphs.length === 0) {
    return []
  }

  // Handle empty words: return paragraphs with zero timestamps
  if (deepgramWords.length === 0) {
    return paragraphs.map((text) => ({ text, start: 0, end: 0 }))
  }

  // Build normalized word array for matching
  const normalizedWords = deepgramWords.map((w) => normalizeText(w.word))
  const segments: AlignedSegment[] = []

  // Track search start position to maintain order
  let searchStart = 0

  for (const paragraph of paragraphs) {
    const normalizedParagraph = normalizeText(paragraph)

    if (normalizedParagraph.length === 0) {
      continue
    }

    // Find best matching window in Deepgram words starting from searchStart
    const match = findBestMatch(normalizedWords, normalizedParagraph, searchStart)

    if (match) {
      const startWord = deepgramWords[match.start]!
      const endWord = deepgramWords[match.end]!

      segments.push({
        text: paragraph,
        start: startWord.start,
        end: endWord.end,
      })

      // Advance search start past this match
      searchStart = match.end + 1
    } else {
      // Fallback: estimate based on position
      const lastEnd = segments.length > 0 ? segments.at(-1)!.end : 0
      const totalDuration = deepgramWords.length > 0 ? deepgramWords.at(-1)!.end : 0

      segments.push({
        text: paragraph,
        start: lastEnd,
        end: Math.min(lastEnd + (totalDuration - lastEnd) * 0.3, totalDuration),
      })
    }
  }

  return segments
}

interface MatchResult {
  start: number
  end: number
  score: number
}

/**
 * Find the best matching window of Deepgram words for a paragraph.
 * Uses character-level overlap scoring with a sliding window.
 * Tries multiple window sizes at each start position to find the tightest fit.
 */
function findBestMatch(
  normalizedWords: string[],
  normalizedParagraph: string,
  searchStart: number,
): MatchResult | null {
  if (searchStart >= normalizedWords.length) {
    return null
  }

  let bestScore = -1
  let bestMatch: MatchResult | null = null
  const targetLen = normalizedParagraph.length

  // Try different window start positions
  for (let start = searchStart; start < normalizedWords.length; start++) {
    // Grow the window word by word, scoring at each size
    let windowText = ""

    for (let end = start; end < normalizedWords.length; end++) {
      windowText += normalizedWords[end]

      // Don't bother scoring if window is way too small
      if (windowText.length < targetLen * 0.5) {
        continue
      }

      // Stop growing if window is much larger than target
      if (windowText.length > targetLen * 2) {
        break
      }

      const overlap = computeOverlapScore(normalizedParagraph, windowText)
      // Penalize windows that are much larger than the target (prefer tighter fit)
      const sizePenalty = Math.abs(windowText.length - targetLen) / targetLen
      const score = overlap - sizePenalty * 0.2

      if (score > bestScore) {
        bestScore = score
        bestMatch = { start, end, score: overlap }
      }
    }

    // Early exit if we found a very good match
    if (bestMatch && bestMatch.score > 0.8) {
      break
    }
  }

  // Only accept matches above a minimum threshold
  if (bestMatch && bestMatch.score >= 0.3) {
    return bestMatch
  }

  return null
}

/**
 * Compute character overlap score between two normalized strings.
 * Returns a value between 0 and 1.
 */
function computeOverlapScore(target: string, candidate: string): number {
  if (target.length === 0 || candidate.length === 0) return 0

  // Count matching characters using subsequence matching
  let matched = 0
  let candidateIdx = 0

  for (let i = 0; i < target.length && candidateIdx < candidate.length; i++) {
    const targetChar = target[i]
    // Search forward in candidate for this character
    for (let j = candidateIdx; j < candidate.length; j++) {
      if (candidate[j] === targetChar) {
        matched++
        candidateIdx = j + 1
        break
      }
    }
  }

  return matched / target.length
}

/**
 * Generate scenes.json by calling Claude CLI to analyze aligned segments + report.
 * Claude groups segments by news topic, extracts title/source/points with showAt times.
 * Post-processes to fix overview duration and align point showAt with actual speech.
 */
export async function generateScenes(
  alignedSegments: AlignedSegment[],
  reportMarkdown: string,
  audioDuration: number,
  onStatus?: (status: string) => void,
  deepgramWords?: DeepgramWord[],
): Promise<ScenesJson> {
  onStatus?.("Generating scene timeline with Claude...")

  const today = new Date().toISOString().slice(0, 10)

  const prompt = `You are a video scene generator for a Chinese AI news show called "YOMOO 每日AI快送".

Given aligned audio segments (with timestamps) and the original news report, generate a scenes.json for video rendering.

## Rules

1. The first scene is always "intro" (0-5s)
2. The second scene is "overview" (5s to where the first news starts), listing headline titles
3. Each news topic becomes a "news" scene with: title, source, sourceUrl, and 2-3 key points with showAt timestamps
4. Extract sourceUrl from the original report markdown — look for [source](url) links associated with each news item
5. The last scene is "outro" (last 30s of audio)
5. Points' showAt times must be within the scene's start-end range
6. Group consecutive segments that discuss the same news topic into one scene
7. IMPORTANT: In all JSON string values, use 「」 instead of "" or \u201c\u201d for Chinese quotes. Never use Unicode curly quotes.
8. Generate a "thumbnailTitle" field: a short, eye-catching Chinese headline (8-15 characters) for the YouTube thumbnail. Pick the most dramatic or intriguing angle from today's news. Make it punchy and curiosity-driven, like a tabloid headline. Examples: "AI一夜干掉程序员？", "你的密码已经不安全了", "GPT-5来了 世界变了"
9. Generate a "youtubeTitle" field: a compelling Chinese YouTube title (30-60 characters) that drives clicks. Format: "<引人好奇的问题或惊人事实>丨每日AI快送". Use specific numbers, provocative questions, or dramatic statements from the news. Examples: "程序员不理解自己写的代码了？AI编程的「认知债务」正在爆发丨每日AI快送", "AI用15分钟黑掉了你的服务器丨纳斯达克暴跌5000亿丨每日AI快送"

## Input

Audio duration: ${audioDuration} seconds
Date: ${today}

### Aligned Segments (with timestamps)
${JSON.stringify(alignedSegments, null, 2)}

### Original Report (for extracting titles and sources)
${reportMarkdown}

## Output

Return ONLY valid JSON matching this structure (no markdown fences):
{
  "date": "${today}",
  "title": "YOMOO 每日AI快送",
  "audioDuration": ${audioDuration},
  "fps": 30,
  "thumbnailTitle": "<eye-catching 8-15 char Chinese headline>",
  "youtubeTitle": "<compelling 30-60 char Chinese YouTube title ending with 丨每日AI快送>",
  "scenes": [
    { "type": "intro", "start": 0, "end": 5 },
    { "type": "overview", "start": 5, "end": <number>, "headlines": [...] },
    { "type": "news", "start": <number>, "end": <number>, "index": 1, "total": <number>, "title": "...", "source": "...", "sourceUrl": "https://...", "points": [{ "text": "...", "showAt": <number> }] },
    ...
    { "type": "outro", "start": <number>, "end": ${audioDuration} }
  ]
}`

  const result = await runClaude(prompt)

  // Parse JSON from Claude's response
  const jsonMatch = result.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error("Claude did not return valid JSON for scenes")
  }

  // Fix Chinese curly quotes that break JSON.parse
  let jsonStr = jsonMatch[0]
  jsonStr = jsonStr.replaceAll("\u201c", "\u300c") // " → 「
  jsonStr = jsonStr.replaceAll("\u201d", "\u300d") // " → 」
  jsonStr = jsonStr.replaceAll("\u2018", "\u300e") // ' → 『
  jsonStr = jsonStr.replaceAll("\u2019", "\u300f") // ' → 』
  // Remove trailing commas
  jsonStr = jsonStr.replaceAll(/,(\s*[}\]])/g, "$1")

  const scenes = JSON.parse(jsonStr) as ScenesJson

  // Post-process: fix overview duration (minimum 10s)
  postProcessOverviewDuration(scenes)

  // Post-process: align point showAt times with actual Deepgram word timestamps
  if (deepgramWords && deepgramWords.length > 0) {
    postProcessPointTimings(scenes, deepgramWords)
  }

  console.info("[scene-generator] Generated", scenes.scenes.length, "scenes")
  onStatus?.(`Generated ${scenes.scenes.length} scenes`)

  return scenes
}

/**
 * Ensure overview scene has at least 10s duration.
 * If too short, steal time from the first news scene.
 */
function postProcessOverviewDuration(scenes: ScenesJson): void {
  const MIN_OVERVIEW_DURATION = 10

  const overview = scenes.scenes.find((s) => s.type === "overview")
  const firstNews = scenes.scenes.find((s) => s.type === "news")
  if (!overview || !firstNews) return

  const overviewDuration = overview.end - overview.start
  if (overviewDuration < MIN_OVERVIEW_DURATION) {
    const newEnd = overview.start + MIN_OVERVIEW_DURATION
    // Don't extend past the first news scene's end
    overview.end = Math.min(newEnd, firstNews.end - 5)
    // Adjust first news start to match
    firstNews.start = overview.end
    console.info(
      `[scene-generator] Extended overview to ${overview.start.toFixed(1)}s-${overview.end.toFixed(1)}s`,
    )
  }
}

/**
 * Align point showAt times with actual Deepgram word timestamps.
 * For each point, search the Deepgram words to find when the point's
 * key content is actually spoken, and set showAt to that time.
 */
function postProcessPointTimings(scenes: ScenesJson, words: DeepgramWord[]): void {
  for (const scene of scenes.scenes) {
    if (scene.type !== "news" || !scene.points) continue

    for (const point of scene.points) {
      const matchTime = findSpeechTimeForText(point.text, words, scene.start, scene.end)
      if (matchTime !== null) {
        const old = point.showAt
        point.showAt = matchTime
        console.info(
          `[scene-generator] Point "${point.text.slice(0, 30)}..." showAt: ${old.toFixed(1)}s → ${matchTime.toFixed(1)}s`,
        )
      }
    }
  }
}

/**
 * Find the time when a point's content is spoken in the Deepgram words.
 * Extracts key phrases from the point text and searches for them in the word stream.
 */
function findSpeechTimeForText(
  pointText: string,
  words: DeepgramWord[],
  sceneStart: number,
  sceneEnd: number,
): number | null {
  // Normalize point text for matching
  const normPoint = normalizeText(pointText)
  if (normPoint.length === 0) return null

  // Extract key phrases: first ~8 meaningful characters
  const keyPhrase = normPoint.slice(0, 8)

  // Build sliding window over words within scene range
  const sceneWords = words.filter((w) => w.start >= sceneStart - 1 && w.end <= sceneEnd + 1)
  if (sceneWords.length === 0) return null

  let bestScore = 0
  let bestTime = sceneWords[0]!.start

  for (let i = 0; i < sceneWords.length; i++) {
    // Build a window of ~20 chars from position i
    let windowText = ""
    for (let j = i; j < sceneWords.length && windowText.length < 30; j++) {
      windowText += normalizeText(sceneWords[j]!.word)
    }

    // Check if key phrase appears in this window
    const idx = windowText.indexOf(keyPhrase)
    if (idx !== -1) {
      // Found! Return the start time of this word
      return sceneWords[i]!.start
    }

    // Also try a looser subsequence match
    const score = computeOverlapScore(keyPhrase, windowText.slice(0, keyPhrase.length + 4))
    if (score > bestScore) {
      bestScore = score
      bestTime = sceneWords[i]!.start
    }
  }

  // If we found a decent fuzzy match (>70%), use it
  if (bestScore > 0.7) {
    return bestTime
  }

  return null
}

export interface SubtitleLine {
  text: string
  start: number
  end: number
}

/**
 * Timestamp for each character in the original script, derived from
 * LCS alignment with Deepgram word-level timestamps.
 */
interface CharTimestamp {
  char: string
  start: number
  end: number
}

/**
 * Generate subtitle lines from original script text, using LCS alignment
 * with Deepgram words to get precise per-character timestamps.
 *
 * Algorithm:
 * 1. For each aligned segment, collect the Deepgram words in its time range
 * 2. Strip punctuation from both original text and Deepgram text
 * 3. Use LCS to align characters, transferring Deepgram timestamps to original chars
 * 4. Interpolate timestamps for unmatched characters (punctuation, STT gaps)
 * 5. Split into subtitle lines at natural punctuation breaks
 */
export function generateSubtitles(
  alignedSegments: AlignedSegment[],
  deepgramWords: DeepgramWord[],
): SubtitleLine[] {
  const allCharTimestamps: CharTimestamp[] = []

  for (const segment of alignedSegments) {
    const text = segment.text.trim()
    if (text.length === 0) continue

    // Collect Deepgram words in this segment's time range
    const segWords = deepgramWords.filter(
      (w) => w.start >= segment.start - 0.2 && w.end <= segment.end + 0.2,
    )

    // Align and get per-character timestamps
    const charTs = alignCharTimestamps(text, segWords, segment.start, segment.end)
    allCharTimestamps.push(...charTs)
  }

  // Split into subtitle lines at punctuation breaks
  return splitIntoSubtitleLines(allCharTimestamps)
}

/**
 * Align original text characters with Deepgram word timestamps using LCS.
 * Returns a timestamp for every character in the original text.
 */
function alignCharTimestamps(
  originalText: string,
  segWords: DeepgramWord[],
  segStart: number,
  segEnd: number,
): CharTimestamp[] {
  // Build flat array of Deepgram characters with timestamps
  const dgChars: { char: string; start: number; end: number }[] = []
  for (const word of segWords) {
    // Each Deepgram "word" is usually a single Chinese character
    // Distribute the word's time across its characters
    const chars = [...word.word.toLowerCase()]
    const charDuration = (word.end - word.start) / chars.length
    for (const [i, char] of chars.entries()) {
      dgChars.push({
        char: char!,
        start: word.start + i * charDuration,
        end: word.start + (i + 1) * charDuration,
      })
    }
  }

  // Strip punctuation/whitespace from original to get matchable characters
  const origChars = [...originalText]
  const origClean: { idx: number; char: string }[] = []
  for (const [i, origChar] of origChars.entries()) {
    const c = origChar!.toLowerCase()
    if (!/[\s，！？；："'（）·\u200b-\u200f\u2010-\u206f\u3001-\u303f]/.test(c)) {
      origClean.push({ idx: i, char: c })
    }
  }

  const dgClean = dgChars.map((d) => d.char)

  // LCS alignment: find which original chars match which Deepgram chars
  const matches = lcsAlign(
    origClean.map((c) => c.char),
    dgClean,
  )

  // Build timestamp map: original char index → Deepgram timestamp
  const tsMap = new Map<number, { start: number; end: number }>()
  for (const [origIdx, dgIdx] of matches) {
    const origCharIdx = origClean[origIdx]!.idx
    tsMap.set(origCharIdx, { start: dgChars[dgIdx]!.start, end: dgChars[dgIdx]!.end })
  }

  // Build result: every original character gets a timestamp
  // Matched chars use Deepgram timing; unmatched chars are interpolated
  const result: CharTimestamp[] = []
  for (const [i, origChar] of origChars.entries()) {
    const ts = tsMap.get(i)
    if (ts) {
      result.push({ char: origChar!, start: ts.start, end: ts.end })
    } else {
      // Placeholder — will be interpolated
      result.push({ char: origChar!, start: -1, end: -1 })
    }
  }

  // Interpolate unmatched characters from neighbors
  interpolateTimestamps(result, segStart, segEnd)

  return result
}

/**
 * LCS-based alignment: returns pairs of [origIdx, dgIdx] for matching chars.
 * Uses space-optimized LCS with backtracking.
 */
function lcsAlign(a: string[], b: string[]): [number, number][] {
  const m = a.length
  const n = b.length

  // For very long sequences, use a greedy approach to avoid O(m*n) memory
  if (m * n > 500_000) {
    return greedyAlign(a, b)
  }

  // Standard LCS DP
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
      }
    }
  }

  // Backtrack to find alignment pairs
  const pairs: [number, number][] = []
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      pairs.push([i - 1, j - 1])
      i--
      j--
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      i--
    } else {
      j--
    }
  }

  return pairs.reverse()
}

/**
 * Greedy sequential alignment for large sequences.
 * For each char in a, find the next matching char in b.
 */
function greedyAlign(a: string[], b: string[]): [number, number][] {
  const pairs: [number, number][] = []
  let bStart = 0

  for (const [i, element] of a.entries()) {
    for (let j = bStart; j < b.length; j++) {
      if (element === b[j]) {
        pairs.push([i, j])
        bStart = j + 1
        break
      }
    }
  }

  return pairs
}

/**
 * Fill in timestamps for unmatched characters by interpolating
 * from the nearest matched neighbors.
 *
 * For runs of unmatched chars, distributes them evenly in the gap between
 * surrounding matched chars, with a minimum duration of 0.15s per char
 * (Chinese speech is ~4-6 chars/sec). Then enforces monotonic ordering.
 */
function interpolateTimestamps(chars: CharTimestamp[], segStart: number, segEnd: number): void {
  // Mark which chars have real timestamps (matched via LCS)
  const matched = chars.map((c) => c.start >= 0 && c.end >= 0)

  // Process runs of unmatched chars: distribute evenly with minimum duration
  let i = 0
  while (i < chars.length) {
    if (matched[i]) {
      i++
      continue
    }

    // Find the run of unmatched chars
    const runStart = i
    while (i < chars.length && !matched[i]) i++
    const runEnd = i // exclusive

    // Get bounding timestamps
    const leftEnd = runStart > 0 ? chars[runStart - 1]!.end : segStart
    const rightStart = runEnd < chars.length ? chars[runEnd]!.start : segEnd
    const runLen = runEnd - runStart
    const gap = rightStart - leftEnd

    // Chinese speech is ~4-6 chars/sec. Enforce minimum 0.15s per char.
    const minDuration = runLen * 0.15
    const effectiveGap = Math.max(gap, minDuration)

    // Distribute evenly over the effective gap
    for (let j = 0; j < runLen; j++) {
      chars[runStart + j]!.start = leftEnd + (effectiveGap * j) / runLen
      chars[runStart + j]!.end = leftEnd + (effectiveGap * (j + 1)) / runLen
    }
  }

  // Monotonic pass: ensure timestamps never go backward
  for (let k = 1; k < chars.length; k++) {
    if (chars[k]!.start < chars[k - 1]!.start) {
      chars[k]!.start = chars[k - 1]!.start
    }
    if (chars[k]!.end < chars[k]!.start) {
      chars[k]!.end = chars[k]!.start + 0.05
    }
    if (chars[k]!.end < chars[k - 1]!.end) {
      chars[k]!.end = chars[k - 1]!.end
    }
  }
}

/**
 * Split character timestamps into subtitle lines (~12-18 chars),
 * breaking at Chinese punctuation when possible.
 */
function splitIntoSubtitleLines(chars: CharTimestamp[]): SubtitleLine[] {
  const MAX_LEN = 18
  const MIN_LEN = 6
  const lines: SubtitleLine[] = []

  let lineChars: CharTimestamp[] = []

  for (const c of chars) {
    lineChars.push(c)

    const text = lineChars.map((lc) => lc.char).join("")
    const isPunct = /[，。！？、；：]/.test(c.char)
    const isNewline = c.char === "\n"

    const shouldFlush = isNewline || (isPunct && text.length >= MIN_LEN) || text.length >= MAX_LEN

    if (shouldFlush && lineChars.length > 0) {
      flushLine(lineChars, lines)
      lineChars = []
    }
  }

  // Flush remaining
  if (lineChars.length > 0) {
    flushLine(lineChars, lines)
  }

  // Post-process: split long lines, enforce min duration, fix overlaps
  const MAX_LINE_DUR = 6
  const MIN_LINE_DUR = 0.8

  // Split any lines that are too long
  const splitLines: SubtitleLine[] = []
  for (const line of lines) {
    const dur = line.end - line.start
    if (dur > MAX_LINE_DUR) {
      // Split into chunks of ~MAX_LINE_DUR
      const numParts = Math.ceil(dur / MAX_LINE_DUR)
      const textChars = [...line.text]
      const charsPerPart = Math.ceil(textChars.length / numParts)
      for (let p = 0; p < numParts; p++) {
        const partChars = textChars.slice(p * charsPerPart, (p + 1) * charsPerPart)
        const partText = partChars.join("").trim()
        if (partText.length === 0) continue
        splitLines.push({
          text: partText,
          start: line.start + (dur * p) / numParts,
          end: line.start + (dur * (p + 1)) / numParts,
        })
      }
    } else {
      splitLines.push(line)
    }
  }

  // Enforce minimum duration and fix overlaps
  for (let idx = 0; idx < splitLines.length; idx++) {
    const line = splitLines[idx]!
    if (line.end - line.start < MIN_LINE_DUR) {
      line.end = line.start + MIN_LINE_DUR
    }
    if (idx + 1 < splitLines.length && splitLines[idx + 1]!.start < line.end) {
      splitLines[idx + 1]!.start = line.end
      if (splitLines[idx + 1]!.end <= splitLines[idx + 1]!.start) {
        splitLines[idx + 1]!.end = splitLines[idx + 1]!.start + MIN_LINE_DUR
      }
    }
  }

  return splitLines
}

function flushLine(lineChars: CharTimestamp[], lines: SubtitleLine[]): void {
  const text = lineChars
    .map((c) => c.char)
    .join("")
    .trim()
  if (text.length === 0) return

  lines.push({
    text,
    start: lineChars[0]!.start,
    end: lineChars.at(-1)!.end,
  })
}

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const home = os.homedir()

    const env = {
      ...process.env,
      PATH: `${home}/.local/bin:/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ""}`,
    }
    delete env.CLAUDECODE

    console.info("[scene-generator] Running Claude CLI...")

    const proc = spawn("claude", ["-p"], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    })

    proc.stdin.on("error", (err) => {
      console.error("[scene-generator] stdin error:", err.message)
    })

    proc.stdin.write(prompt, () => {
      proc.stdin.end()
    })

    let stdout = ""
    let stderr = ""

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(`Claude exited with code ${code}: ${stderr}`))
      }
    })

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn Claude: ${err.message}`))
    })
  })
}
