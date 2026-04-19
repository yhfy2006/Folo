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
  subtitles?: SubtitleLine[]
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
  promptOverride?: string,
): Promise<ScenesJson> {
  onStatus?.("Generating scene timeline with Claude...")

  const today = new Date().toISOString().slice(0, 10)

  // Use channel-provided prompt when available, otherwise use built-in prompt
  const prompt =
    promptOverride ||
    `You are a video scene generator for a Chinese AI news show called "YOMOO 每日AI快送".

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

  // Post-process: correct scene start/end boundaries using Deepgram-aligned segments
  postProcessSceneBoundaries(scenes, alignedSegments)

  // Post-process: fix overview duration (minimum 10s)
  postProcessOverviewDuration(scenes)

  // Post-process: align point showAt times with actual Deepgram word timestamps
  if (deepgramWords && deepgramWords.length > 0) {
    postProcessPointTimings(scenes, deepgramWords)
  }

  // Final safety: ensure all scenes have positive duration (minimum 1 second)
  for (const scene of scenes.scenes) {
    if (scene.end <= scene.start) {
      scene.end = scene.start + 1
    }
  }

  console.info("[scene-generator] Generated", scenes.scenes.length, "scenes")
  onStatus?.(`Generated ${scenes.scenes.length} scenes`)

  return scenes
}

/**
 * Correct scene start/end boundaries using Deepgram-aligned segment timestamps.
 *
 * Claude generates scene start/end times by "guessing" from the aligned segments,
 * but its timing can drift significantly from the actual audio. This function
 * finds the closest aligned segment for each scene boundary and snaps it to the
 * precise Deepgram timestamp.
 *
 * Strategy: For each scene (in order), find the aligned segment whose time is
 * closest to the scene's Claude-estimated start time, then set the scene's
 * start to that segment's start. The previous scene's end is set to the same
 * value to keep scenes contiguous. This preserves Claude's scene ordering while
 * correcting the actual timestamps.
 */
function postProcessSceneBoundaries(scenes: ScenesJson, segments: AlignedSegment[]): void {
  if (segments.length === 0) return

  const { audioDuration } = scenes

  // Sort segments by start time (should already be sorted, but be safe)
  const sortedSegs = [...segments].sort((a, b) => a.start - b.start)

  // Keep scenes in their original order (Claude's topic ordering)
  // Only correct news/overview scenes; intro/outro are fixed anchors
  for (const scene of scenes.scenes) {
    if (scene.type === "intro") {
      scene.start = 0
      continue
    }
    if (scene.type === "outro") {
      scene.end = audioDuration
      continue
    }

    // Find the segment closest to this scene's start time
    const closestStart = findClosestSegment(sortedSegs, scene.start)
    // Find the segment closest to this scene's end time
    const closestEnd = findClosestSegment(sortedSegs, scene.end)

    if (closestStart && closestEnd) {
      const oldStart = scene.start
      const oldEnd = scene.end
      scene.start = closestStart.start
      scene.end = closestEnd.end

      console.info(
        `[scene-generator] Scene "${(scene.title || scene.type).slice(0, 30)}" boundary: ${oldStart.toFixed(1)}s-${oldEnd.toFixed(1)}s → ${scene.start.toFixed(1)}s-${scene.end.toFixed(1)}s`,
      )
    }
  }

  // Ensure scenes are contiguous: each scene's start = previous scene's end
  // This avoids gaps and overlaps without the risky midpoint split
  const ordered = scenes.scenes // already in Claude's original order
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]!
    const curr = ordered[i]!

    // Snap: current scene starts where previous ends
    curr.start = prev.end
  }

  // Safety: ensure no scene has end <= start (minimum 1 second)
  for (const scene of scenes.scenes) {
    if (scene.end <= scene.start) {
      scene.end = scene.start + 1
    }
  }

  // Final scene extends to audio end
  const last = scenes.scenes.at(-1)
  if (last) {
    last.end = audioDuration
  }
}

/**
 * Find the aligned segment whose start time is closest to the target time.
 */
function findClosestSegment(
  sortedSegments: AlignedSegment[],
  targetTime: number,
): AlignedSegment | null {
  if (sortedSegments.length === 0) return null

  let best = sortedSegments[0]!
  let bestDist = Math.abs(best.start - targetTime)

  for (const seg of sortedSegments) {
    const dist = Math.abs(seg.start - targetTime)
    if (dist < bestDist) {
      bestDist = dist
      best = seg
    }
  }

  return best
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
    // Don't extend past the first news scene's end, but never go below overview.start + 1s
    overview.end = Math.max(overview.start + 1, Math.min(newEnd, firstNews.end - 5))
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
 * Generate subtitle lines using Claude CLI with subtasks to correct Deepgram STT errors.
 *
 * Uses a single `claude -p` call with `--agents` to define a subtitle-processor subagent.
 * Claude dispatches each batch as a parallel subtask via the Task tool internally,
 * then combines and returns all subtitle lines.
 */
export async function generateSubtitlesWithLLM(
  alignedSegments: AlignedSegment[],
  deepgramWords: DeepgramWord[],
  onStatus?: (status: string) => void,
): Promise<SubtitleLine[]> {
  if (alignedSegments.length === 0 || deepgramWords.length === 0) {
    return []
  }

  onStatus?.("Generating subtitles with Claude subtasks...")

  // Step 1: Collect Deepgram words for each segment, group into batches
  const BATCH_SIZE = 4
  const batches: { paragraphs: string[]; words: { word: string; start: number; end: number }[] }[] =
    []

  for (let i = 0; i < alignedSegments.length; i += BATCH_SIZE) {
    const slice = alignedSegments.slice(i, i + BATCH_SIZE)
    const paragraphs: string[] = []
    const words: { word: string; start: number; end: number }[] = []

    for (const seg of slice) {
      paragraphs.push(seg.text)
      for (const w of deepgramWords.filter(
        (w) => w.start >= seg.start - 0.3 && w.end <= seg.end + 0.3,
      )) {
        words.push({ word: w.word, start: w.start, end: w.end })
      }
    }

    batches.push({ paragraphs, words })
  }

  // Step 2: Define subtitle-processor subagent
  const agents = {
    "subtitle-processor": {
      description:
        "Processes a batch of podcast segments: corrects STT errors against original script text and outputs subtitle lines with timestamps as JSON.",
      prompt: `你是字幕校对专家。用户会给你一段播客的原始台词和语音识别（STT）词时间戳。
STT 有精确时间但文字可能有错（同音字、英文名乱码等）。
请参考原始台词校正文字，分割成字幕行。

规则：
1. 每行字幕 8-16 个字符，在自然语句或标点符号处断句
2. 每行 start/end 时间从 STT 词时间戳中取得
3. 字幕文本使用原始台词的正确文字（修正 STT 错误）
4. STT 丢失词时，根据前后时间戳估算
5. 中文引号用「」不用""
6. 只输出纯 JSON 数组，不要 markdown 代码块

输出格式：[{"text": "字幕文本", "start": 0.88, "end": 2.4}, ...]`,
      model: "sonnet",
    },
  }

  // Step 3: Build main orchestration prompt
  const batchDescriptions = batches
    .map(
      (b, i) =>
        `--- BATCH ${i + 1} ---\n原始台词：\n${b.paragraphs.join("\n\n")}\n\nSTT 词时间戳：\n${JSON.stringify(b.words)}`,
    )
    .join("\n\n")

  const prompt = `你是字幕生成调度器。我有 ${batches.length} 批播客字幕数据需要处理。

请为每一批数据使用 subtitle-processor 子任务（通过 Task 工具）并行处理。每批发给 subtitle-processor 时，把该批的「原始台词」和「STT 词时间戳」作为 prompt 传入。

所有子任务完成后，把所有批次返回的 JSON 数组合并为一个大数组，按 start 时间排序，输出最终的纯 JSON 数组（不要 markdown 代码块）。

数据如下：

${batchDescriptions}

最终输出格式：[{"text": "...", "start": 0.88, "end": 2.4}, ...]`

  try {
    const result = await runClaude(prompt, [
      "--agents",
      JSON.stringify(agents),
      "--dangerously-skip-permissions",
    ])

    // Parse the combined JSON array from Claude's response
    const allSubtitles = parseSubtitleJson(result)
    console.info(`[subtitles] Got ${allSubtitles.length} subtitle lines from Claude subtasks`)

    // Step 4: Post-process
    return postProcessSubtitles(allSubtitles)
  } catch (err) {
    console.info("[subtitles] Claude subtask orchestration failed:", err)
    return []
  }
}

/**
 * Parse subtitle JSON from Claude's response text.
 * Tries JSON.parse first, falls back to line-by-line extraction.
 */
function parseSubtitleJson(text: string): SubtitleLine[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    console.info("[subtitles] No JSON array found in response")
    return []
  }

  let jsonStr = jsonMatch[0]
  // Replace Chinese curly quotes with 「」
  jsonStr = jsonStr.replaceAll("\u201c", "\u300c")
  jsonStr = jsonStr.replaceAll("\u201d", "\u300d")
  jsonStr = jsonStr.replaceAll("\u2018", "\u300e")
  jsonStr = jsonStr.replaceAll("\u2019", "\u300f")
  // Remove trailing commas
  jsonStr = jsonStr.replaceAll(/,(\s*[}\]])/g, "$1")

  try {
    return JSON.parse(jsonStr) as SubtitleLine[]
  } catch {
    // Fallback: line-by-line extraction
    console.info("[subtitles] JSON.parse failed, using line-by-line extraction")
    const lines: SubtitleLine[] = []
    for (const line of jsonStr.split("\n")) {
      const startMatch = line.match(/"start"\s*:\s*([\d.]+)/)
      const endMatch = line.match(/"end"\s*:\s*([\d.]+)/)
      const textMatch = line.match(/"text"\s*:\s*"(.*)"/)
      if (startMatch && endMatch && textMatch) {
        let t = textMatch[1]!
        t = t.replace(/"\s*,\s*"(start|end)"\s*:\s*[\d.]+\s*(?:[,}]+\s*)?$/, "")
        t = t.replace(/"\s*[}\]]\s*$/, "")
        t = t.replaceAll('\\"', '"').replaceAll("\\n", "")
        if (t.length > 0) {
          lines.push({
            text: t,
            start: Number.parseFloat(startMatch[1]!),
            end: Number.parseFloat(endMatch[1]!),
          })
        }
      }
    }
    console.info(`[subtitles] Extracted ${lines.length} lines from line-by-line parsing`)
    return lines
  }
}

/**
 * Post-process LLM-generated subtitles:
 * - Remove empty/duplicate lines
 * - Fix time overlaps
 * - Ensure monotonically increasing timestamps
 * - Enforce minimum duration per line
 */
function postProcessSubtitles(lines: SubtitleLine[]): SubtitleLine[] {
  const MIN_DURATION = 0.5

  // Filter out empty lines and ensure valid numbers
  let result = lines.filter(
    (line) =>
      line.text &&
      line.text.trim().length > 0 &&
      typeof line.start === "number" &&
      typeof line.end === "number" &&
      !Number.isNaN(line.start) &&
      !Number.isNaN(line.end),
  )

  // Sort by start time
  result.sort((a, b) => a.start - b.start)

  // Remove duplicates (same text within 1s)
  result = result.filter((line, idx) => {
    if (idx === 0) return true
    const prev = result[idx - 1]!
    return !(line.text === prev.text && Math.abs(line.start - prev.start) < 1)
  })

  // Fix timestamps
  for (let i = 0; i < result.length; i++) {
    const line = result[i]!

    // Ensure end > start with minimum duration
    if (line.end <= line.start) {
      line.end = line.start + MIN_DURATION
    }
    if (line.end - line.start < MIN_DURATION) {
      line.end = line.start + MIN_DURATION
    }

    // Fix overlap with next line
    if (i + 1 < result.length) {
      const next = result[i + 1]!
      if (next.start < line.end) {
        next.start = line.end
      }
      if (next.end <= next.start) {
        next.end = next.start + MIN_DURATION
      }
    }
  }

  console.info(`[subtitles] Post-processed ${result.length} subtitle lines`)
  return result
}

function runClaude(prompt: string, extraArgs?: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const home = os.homedir()

    const env = {
      ...process.env,
      PATH: `${home}/.local/bin:/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ""}`,
    }
    delete env.CLAUDECODE

    console.info("[scene-generator] Running Claude CLI...")

    const args = ["-p", ...(extraArgs || [])]
    const proc = spawn("claude", args, {
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
