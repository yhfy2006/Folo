import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"

import { app } from "electron"
import path from "pathe"

import type { Entry, FeedGroup } from "./database"
import { execute, queryAll, queryOne, saveDatabase } from "./database"
import type { UserPreferences } from "./preferences"
import { loadPreferences } from "./preferences"
import { fetchArticleContent } from "./readability"
import { formatSkillsPrompt, loadAllSkills } from "./skills"
import { getWorkspacePath } from "./workspace"
import type { ChannelVideo } from "./youtube"

// Resolve the full path to claude CLI since Electron GUI apps
// don't inherit the shell PATH on macOS
function getClaudePath(): string {
  const home = os.homedir()
  return path.join(home, ".local", "bin", "claude")
}

interface EntryWithFeed extends Entry {
  feed_title: string | null
  feed_category: string | null
}

/**
 * Generate an AI report using Claude CLI in two stages:
 * 1. Screening: Send titles + descriptions, ask Claude to pick valuable entries
 * 2. Deep read: For selected entries, send full content (+ fetched original), generate report
 *
 * Streams output via onChunk callback.
 */
export async function generateReport(
  onChunk: (text: string) => void,
  onStatus: (status: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  groupId?: string,
  youtubeInsights?: string,
): Promise<void> {
  const prefs = loadPreferences()
  console.info("[ai-report] Preferences:", JSON.stringify(prefs))

  // Resolve group-specific config
  const effectivePrefs = { ...prefs }
  let groupName: string | undefined
  if (groupId) {
    const group = queryOne<FeedGroup>(`SELECT * FROM feed_groups WHERE id = ?`, [groupId])
    if (group) {
      groupName = group.name
      if (group.language) effectivePrefs.language = group.language
      if (group.report_style) effectivePrefs.reportStyle = group.report_style as any
      if (group.interests) effectivePrefs.interests = JSON.parse(group.interests)
      if (group.time_range) effectivePrefs.timeRange = group.time_range
    }
  }

  // Query entries within the time range
  const cutoffMs = Date.now() - effectivePrefs.timeRange * 60 * 60 * 1000
  const cutoffSec = Math.floor(cutoffMs / 1000)
  console.info("[ai-report] Cutoff timestamp:", cutoffSec, `(${new Date(cutoffMs).toISOString()})`)

  let entries: EntryWithFeed[]
  if (groupId) {
    entries = queryAll<EntryWithFeed>(
      `SELECT e.*, f.title as feed_title, f.category as feed_category
       FROM entries e
       LEFT JOIN feeds f ON e.feed_id = f.id
       INNER JOIN feed_group_feeds gf ON f.id = gf.feed_id
       WHERE gf.group_id = ?
         AND (e.published_at > ? OR e.inserted_at > ?)
         AND e.id NOT IN (SELECT entry_id FROM report_entries)
       ORDER BY e.published_at DESC`,
      [groupId, cutoffSec, cutoffSec],
    )
  } else {
    entries = queryAll<EntryWithFeed>(
      `SELECT e.*, f.title as feed_title, f.category as feed_category
       FROM entries e
       LEFT JOIN feeds f ON e.feed_id = f.id
       WHERE (e.published_at > ? OR e.inserted_at > ?)
         AND e.id NOT IN (SELECT entry_id FROM report_entries)
       ORDER BY e.published_at DESC`,
      [cutoffSec, cutoffSec],
    )
  }

  if (entries.length === 0) {
    onChunk(`No entries found in the last ${effectivePrefs.timeRange} hours.`)
    onDone()
    return
  }

  console.info("[ai-report] Found", entries.length, "entries in time range")

  // Limit entries to avoid exceeding Claude's context window
  const maxScreeningEntries = 500
  const entriesToScreen = entries.slice(0, maxScreeningEntries)
  if (entries.length > maxScreeningEntries) {
    console.info(
      `[ai-report] Trimmed from ${entries.length} to ${maxScreeningEntries} entries for screening`,
    )
  }

  onStatus(
    `Screening ${entriesToScreen.length} entries from the last ${effectivePrefs.timeRange}h...`,
  )

  // Stage 1: Screening - use the "screening" skill
  const screeningPrompt = buildScreeningPrompt(entriesToScreen, effectivePrefs, youtubeInsights)
  console.info("[ai-report] Screening prompt length:", screeningPrompt.length, "chars")
  let screeningResult: string

  try {
    screeningResult = await runClaude(screeningPrompt)
    console.info("[ai-report] Screening result length:", screeningResult.length)
  } catch (err) {
    onError(`Claude CLI error during screening: ${err}`)
    return
  }

  // Parse selected entry IDs from screening result
  const screening = parseScreeningResult(screeningResult, entriesToScreen)
  const { selectedIds } = screening

  if (selectedIds.length === 0) {
    onChunk("AI found no particularly noteworthy entries in this time period.")
    onDone()
    return
  }

  // Limit deep-read entries to keep prompt manageable
  const maxDeepRead = 30
  const limitedIds = selectedIds.slice(0, maxDeepRead)
  console.info(
    "[ai-report] Deep reading",
    limitedIds.length,
    "of",
    selectedIds.length,
    "selected entries",
  )

  onStatus(`Deep reading ${limitedIds.length} selected entries...`)

  // Stage 2: Fetch full content for selected entries
  const selectedEntries = entries.filter((e) => limitedIds.includes(e.id))
  const enrichedEntries = await enrichWithOriginalContent(selectedEntries, onStatus)

  // Stage 2.5: Historical topic retrieval
  onStatus("Retrieving historical topic context...")
  const historicalTopics = findRelevantTopics(enrichedEntries, groupId)

  // Stage 2.7: Hot topic deep dive
  let deepDiveContext = ""
  if (screening.hotTopicIds.length > 0) {
    deepDiveContext = await deepDiveHotTopics(
      enrichedEntries,
      screening.hotTopicIds,
      screening.hotTopicReasons,
      onStatus,
    )
  }

  // Stage 3: Generate final report with streaming
  onStatus(`Generating report from ${enrichedEntries.length} articles...`)
  const reportPrompt = buildReportPrompt(
    enrichedEntries,
    effectivePrefs,
    historicalTopics,
    deepDiveContext,
  )
  console.info("[ai-report] Report prompt length:", reportPrompt.length, "chars")

  let fullContent = ""
  try {
    await runClaudeStreaming(reportPrompt, (chunk) => {
      fullContent += chunk
      onChunk(chunk)
    })

    // Save report to database
    const reportId = Math.random().toString(36).slice(2) + Date.now().toString(36)
    const now = Math.floor(Date.now() / 1000)
    const title = generateReportTitle(effectivePrefs, groupName)
    execute(
      "INSERT INTO reports (id, title, content, language, time_range, entry_count, type, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        reportId,
        title,
        fullContent,
        effectivePrefs.language,
        effectivePrefs.timeRange,
        enrichedEntries.length,
        "report",
        groupId || null,
        now,
      ],
    )

    // Record which entries were used so they won't be selected again
    for (const entry of enrichedEntries) {
      execute("INSERT OR IGNORE INTO report_entries (report_id, entry_id) VALUES (?, ?)", [
        reportId,
        entry.id,
      ])
    }
    saveDatabase()
    console.info(
      "[ai-report] Report saved:",
      reportId,
      "with",
      enrichedEntries.length,
      "entries recorded",
    )

    // Stage 3.5: Extract topics (errors are non-blocking)
    onStatus("Extracting topic digest...")
    await extractAndSaveTopics(fullContent, reportId, groupId).catch((err) => {
      console.warn("[ai-report] Topic extraction failed:", err)
    })

    onDone()
  } catch (err) {
    onError(`Claude CLI error during report generation: ${err}`)
  }
}

function generateReportTitle(_prefs: UserPreferences, groupName?: string): string {
  const now = new Date()
  const date = now.toLocaleDateString("en-CA") // YYYY-MM-DD
  const hour = now.getHours()
  const period = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening"
  const prefix = groupName ? `${groupName} ` : ""
  return `${prefix}${period} Report - ${date}`
}

export function buildScreeningPrompt(
  entries: EntryWithFeed[],
  prefs: UserPreferences,
  youtubeInsights?: string,
): string {
  const entryList = entries
    .map((e, i) => {
      const desc = e.description ? stripHtml(e.description).slice(0, 150) : ""
      return `[${i}] ${e.title || "Untitled"} | ${e.feed_title || "?"} | ${desc}`
    })
    .join("\n")

  const interestsStr =
    prefs.interests.length > 0 ? `User interests: ${prefs.interests.join(", ")}` : ""

  const skillsSection = formatSkillsPrompt(loadAllSkills())

  const youtubeSection = youtubeInsights ? `\n${youtubeInsights}\n` : ""

  return `${skillsSection}

Your task: Screen RSS entries and select valuable ones, and identify 1-2 "hot topics" that deserve deeper investigation.

${interestsStr}
${youtubeSection}
## Output Format

Return a JSON object (no markdown fencing, no extra text):
{
  "selected": [0, 3, 5, ...],
  "hot_topics": [
    { "index": 3, "reason": "Brief reason why this is a breakthrough or major development" }
  ]
}

- "selected": array of entry indices worth including in today's report
- "hot_topics": 1-2 entries that are groundbreaking, first-of-their-kind, major announcements, paradigm shifts, or especially controversial. These will receive deeper research and more detailed coverage. If nothing qualifies, use an empty array.

${entries.length} entries to review:
${entryList}`
}

interface EnrichedEntry extends EntryWithFeed {
  original_content?: string | null
}

async function enrichWithOriginalContent(
  entries: EntryWithFeed[],
  onStatus: (status: string) => void,
): Promise<EnrichedEntry[]> {
  const enriched: EnrichedEntry[] = []

  for (const entry of entries) {
    const enrichedEntry: EnrichedEntry = { ...entry }

    // If entry has a URL and content seems short, try to fetch original
    const existingContent = entry.content || entry.description || ""
    const hasShortContent = stripHtml(existingContent).length < 500

    if (entry.url && hasShortContent) {
      onStatus(`Fetching original: ${entry.title || entry.url}`)
      enrichedEntry.original_content = await fetchArticleContent(entry.url)
    }

    enriched.push(enrichedEntry)
  }

  return enriched
}

interface HistoricalTopic {
  reportDate: string
  name: string
  keywords: string[]
  summary: string
}

function extractKeywordsFromEntries(entries: EnrichedEntry[]): string[] {
  const keywords: string[] = []
  for (const entry of entries) {
    const title = (entry.title || "").toLowerCase()
    // Split on common delimiters and filter short/stop words
    const words = title.split(/[\s,.:;|/\-—–]+/).filter((w) => w.length > 2)
    keywords.push(...words)
  }
  // Deduplicate
  return [...new Set(keywords)]
}

function queryRecentTopics(
  limit: number,
  groupId?: string,
): Array<{
  reportDate: string
  topics: import("./database").TopicEntry[]
}> {
  const rows = groupId
    ? queryAll<{ topics_json: string; created_at: number }>(
        `SELECT topics_json, created_at FROM report_topics
         WHERE group_id = ? ORDER BY created_at DESC LIMIT ?`,
        [groupId, limit],
      )
    : queryAll<{ topics_json: string; created_at: number }>(
        `SELECT topics_json, created_at FROM report_topics
         WHERE group_id IS NULL ORDER BY created_at DESC LIMIT ?`,
        [limit],
      )

  return rows.map((r) => ({
    reportDate: new Date(r.created_at * 1000).toLocaleDateString("en-CA"),
    topics: JSON.parse(r.topics_json) as import("./database").TopicEntry[],
  }))
}

function findRelevantTopics(currentEntries: EnrichedEntry[], groupId?: string): HistoricalTopic[] {
  const currentKeywords = extractKeywordsFromEntries(currentEntries)
  if (currentKeywords.length === 0) return []

  // Query recent 7 reports' topics
  const recentReports = queryRecentTopics(7, groupId)
  const matched: HistoricalTopic[] = []
  const matchedKeywords = new Set<string>()

  for (const report of recentReports) {
    for (const topic of report.topics) {
      const overlap = topic.keywords.filter((kw) =>
        currentKeywords.some((ck) => ck.includes(kw) || kw.includes(ck)),
      )
      if (overlap.length > 0) {
        matched.push({
          reportDate: report.reportDate,
          name: topic.name,
          keywords: topic.keywords,
          summary: topic.summary,
        })
        overlap.forEach((kw) => matchedKeywords.add(kw))
      }
    }
  }

  // If we found matches, look deeper (up to 30 reports) for the same keywords
  if (matchedKeywords.size > 0) {
    const deepReports = queryRecentTopics(30, groupId)
    for (const report of deepReports.slice(7)) {
      for (const topic of report.topics) {
        const overlap = topic.keywords.filter((kw) => matchedKeywords.has(kw))
        if (overlap.length > 0) {
          const alreadyExists = matched.some(
            (m) => m.name === topic.name && m.reportDate === report.reportDate,
          )
          if (!alreadyExists) {
            matched.push({
              reportDate: report.reportDate,
              name: topic.name,
              keywords: topic.keywords,
              summary: topic.summary,
            })
          }
        }
      }
    }
  }

  console.info("[ai-report] Found", matched.length, "relevant historical topics")
  return matched
}

function formatHistoricalContext(topics: HistoricalTopic[]): string {
  if (topics.length === 0) return ""

  const lines = topics.map((t) => `- [${t.reportDate}] ${t.name}: ${t.summary}`)
  return `## Historical Topic Context

The following topics were discussed in previous reports. If current articles
continue or relate to these topics, naturally reference the connection
(e.g., "Previously we reported...", "This is the latest development in...").
Only reference when genuinely relevant; do not force connections.

${lines.join("\n")}
`
}

async function deepDiveHotTopics(
  entries: EnrichedEntry[],
  hotTopicIds: string[],
  hotTopicReasons: Map<string, string>,
  onStatus: (status: string) => void,
): Promise<string> {
  const hotEntries = entries.filter((e) => hotTopicIds.includes(e.id))
  if (hotEntries.length === 0) return ""

  const results: string[] = []

  for (const entry of hotEntries) {
    const content = entry.original_content || entry.content || entry.description || ""
    const reason = hotTopicReasons.get(entry.id) || "Notable development"
    onStatus(`Deep diving: ${entry.title || "hot topic"}...`)

    const prompt = `You are a tech journalist researching a breaking story. Analyze this article in depth and provide:
1. Why this matters (broader context and implications)
2. Key technical details explained accessibly
3. How this compares to or builds on previous developments in this space
4. What this might mean going forward

Article title: ${entry.title}
Source: ${entry.feed_title || "Unknown"}
Why this is notable: ${reason}

Article content:
${typeof content === "string" ? stripHtml(content).slice(0, 8000) : content}

Output your analysis as flowing paragraphs (no bullet points or headers). Be vivid and engaging. Keep it under 800 characters.`

    try {
      const result = await runClaude(prompt, [], 5)
      results.push(`### ${entry.title}\n${result.trim()}`)
      console.info("[ai-report] Deep dive completed for:", entry.title)
    } catch (err) {
      console.warn("[ai-report] Deep dive failed for:", entry.title, err)
    }
  }

  if (results.length === 0) return ""

  return `## Deep Dive Research Results

The following in-depth research was conducted on today's key topics.
Use this material to provide richer, more vivid coverage in the report.

${results.join("\n\n")}
`
}

async function extractAndSaveTopics(
  reportContent: string,
  reportId: string,
  groupId?: string,
): Promise<void> {
  const prompt = `Extract the main topics discussed in the following report. For each topic provide:
- name: short topic name (max 10 characters)
- keywords: related keywords array (lowercase English, 3-8 items)
- summary: one-sentence summary (30-50 characters)

Also generate an overall digest (100-200 characters) summarizing this report.

Output strict JSON only, no markdown fencing:
{
  "topics": [
    { "name": "...", "keywords": ["..."], "summary": "..." }
  ],
  "digest": "..."
}

Report content:
${reportContent.slice(0, 5000)}`

  try {
    const result = await runClaude(prompt)
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn("[ai-report] Topic extraction: no JSON found in result")
      return
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      topics: Array<{ name: string; keywords: string[]; summary: string }>
      digest: string
    }

    if (!parsed.topics || !parsed.digest) {
      console.warn("[ai-report] Topic extraction: missing fields in result")
      return
    }

    const topicId = Math.random().toString(36).slice(2) + Date.now().toString(36)
    const now = Math.floor(Date.now() / 1000)
    execute(
      "INSERT INTO report_topics (id, report_id, group_id, topics_json, digest, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [topicId, reportId, groupId || null, JSON.stringify(parsed.topics), parsed.digest, now],
    )
    saveDatabase()
    console.info("[ai-report] Topics extracted and saved:", parsed.topics.length, "topics")
  } catch (err) {
    console.warn("[ai-report] Topic extraction failed (non-blocking):", err)
  }
}

function buildReportPrompt(
  entries: EnrichedEntry[],
  prefs: UserPreferences,
  historicalTopics?: HistoricalTopic[],
  deepDiveContext?: string,
): string {
  const entryBlocks = entries
    .map((e) => {
      const content = e.original_content || e.content || e.description || "No content available"
      const publishedAt = e.published_at
        ? new Date(e.published_at * 1000).toISOString()
        : "Unknown time"

      return `---
Title: ${e.title || "Untitled"}
Source: ${e.feed_title || "Unknown"} (${e.feed_category || "Uncategorized"})
Author: ${e.author || "Unknown"}
Published: ${publishedAt}
URL: ${e.url || "N/A"}
Content:
${typeof content === "string" ? stripHtml(content) : content}
---`
    })
    .join("\n\n")

  const langInstruction = getLanguageInstruction(prefs.language)
  const styleInstruction =
    prefs.reportStyle === "concise"
      ? "Style: concise and scannable. Use bullet points. 1-2 sentences per entry."
      : "Style: detailed analysis with key quotes, context, and significance assessment."

  const interestsStr =
    prefs.interests.length > 0
      ? `User interests: ${prefs.interests.join(", ")}. Prioritize these topics.`
      : ""

  const skillsSection = formatSkillsPrompt(loadAllSkills())

  const historicalSection = historicalTopics ? formatHistoricalContext(historicalTopics) : ""
  const deepDiveSection = deepDiveContext || ""

  return `${skillsSection}

Your task: Generate a daily briefing report from the curated articles below.
Output the full report directly as Markdown text. Do NOT write to any files. Do NOT reference file paths. Just output the report content.

${langInstruction}
${styleInstruction}
${interestsStr}

## Writing Requirements

- Provide brief, accessible explanations for technical terms and concepts. Assume readers are professionals interested in tech but not necessarily with deep technical backgrounds.
- Example: Don't just say "RAG"; say "RAG (Retrieval-Augmented Generation, a technique that lets AI look up reference material before answering)"
- First occurrence of a technical concept must be explained; subsequent mentions can use the abbreviation.

## Length Requirements

- Total report: max ~3500 Chinese characters (~15 minutes podcast audio)
- Hot/explosive topics: 40-50% of total length for in-depth, vivid analysis
- Other topics: concise, 100-200 characters each
- Prefer depth on key topics over breadth of coverage

${historicalSection}
${deepDiveSection}
${entries.length} curated articles:

${entryBlocks}`
}

function getLanguageInstruction(lang: string): string {
  const langMap: Record<string, string> = {
    en: "Language: English",
    "zh-CN": "Language: Simplified Chinese (简体中文)",
    "zh-TW": "Language: Traditional Chinese (繁體中文)",
    ja: "Language: Japanese (日本語)",
    ko: "Language: Korean (한국어)",
    fr: "Language: French (Français)",
    de: "Language: German (Deutsch)",
    es: "Language: Spanish (Español)",
  }
  return langMap[lang] || `Language: ${lang}`
}

export function runClaude(
  prompt: string,
  extraArgs?: string[],
  maxTurns?: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const claudePath = getClaudePath()
    const workspacePath = getWorkspacePath()
    console.info("[ai-report] Running claude (non-streaming), workspace:", workspacePath)
    console.info("[ai-report] Prompt length:", prompt.length, "chars")

    const env = {
      ...process.env,
      PATH: `${os.homedir()}/.local/bin:/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ""}`,
    }
    delete env.CLAUDECODE

    const turns = maxTurns ?? 1
    const args = [
      "-p",
      "--dangerously-skip-permissions",
      "--max-turns",
      String(turns),
      ...(extraArgs || []),
    ]
    const proc = spawn(claudePath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env,
      cwd: workspacePath,
    })

    proc.stdin.on("error", (err) => {
      console.error("[ai-report] stdin error:", err.message)
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
      console.info("[ai-report] claude exited with code:", code)
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(`claude exited with code ${code}: ${stderr}`))
      }
    })

    proc.on("error", (err) => {
      console.error("[ai-report] Failed to spawn claude:", err)
      reject(new Error(`Failed to spawn claude: ${err.message}`))
    })
  })
}

function runClaudeStreaming(
  prompt: string,
  onChunk: (text: string) => void,
  extraArgs?: string[],
  maxTurns?: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const claudePath = getClaudePath()
    const workspacePath = getWorkspacePath()
    console.info("[ai-report] Running claude (streaming), workspace:", workspacePath)
    console.info("[ai-report] Prompt length:", prompt.length, "chars")

    const env = {
      ...process.env,
      PATH: `${os.homedir()}/.local/bin:/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ""}`,
    }
    delete env.CLAUDECODE

    const turns = maxTurns ?? 1
    const args = [
      "-p",
      "--dangerously-skip-permissions",
      "--max-turns",
      String(turns),
      ...(extraArgs || []),
    ]
    const proc = spawn(claudePath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env,
      cwd: workspacePath,
    })

    proc.stdin.on("error", (err) => {
      console.error("[ai-report] stdin error:", err.message)
    })

    proc.stdin.write(prompt, () => {
      proc.stdin.end()
    })

    proc.stdout.on("data", (data: Buffer) => {
      onChunk(data.toString())
    })

    let stderr = ""
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on("close", (code) => {
      console.info("[ai-report] claude streaming exited with code:", code)
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`claude exited with code ${code}: ${stderr}`))
      }
    })

    proc.on("error", (err) => {
      console.error("[ai-report] Failed to spawn claude:", err)
      reject(new Error(`Failed to spawn claude: ${err.message}`))
    })
  })
}

interface ScreeningResult {
  selectedIds: string[]
  hotTopicIds: string[]
  hotTopicReasons: Map<string, string>
}

function parseScreeningResult(result: string, entries: EntryWithFeed[]): ScreeningResult {
  try {
    // Try to parse as the new JSON object format
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        selected?: number[]
        hot_topics?: Array<{ index: number; reason: string }>
      }

      if (parsed.selected && Array.isArray(parsed.selected)) {
        const selectedIds = parsed.selected
          .filter((i) => i >= 0 && i < entries.length)
          .map((i) => entries[i]!.id)

        const hotTopicIds: string[] = []
        const hotTopicReasons = new Map<string, string>()
        if (parsed.hot_topics && Array.isArray(parsed.hot_topics)) {
          for (const ht of parsed.hot_topics) {
            if (ht.index >= 0 && ht.index < entries.length) {
              const { id } = entries[ht.index]!
              hotTopicIds.push(id)
              hotTopicReasons.set(id, ht.reason)
            }
          }
        }

        console.info(
          "[ai-report] Selected",
          selectedIds.length,
          "entries,",
          hotTopicIds.length,
          "hot topics",
        )
        return { selectedIds, hotTopicIds, hotTopicReasons }
      }
    }

    // Fallback: try old array format
    const arrayMatch = result.match(/\[[\s\S]*?\]/)
    if (arrayMatch) {
      const indices = JSON.parse(arrayMatch[0]) as number[]
      const selectedIds = indices
        .filter((i) => i >= 0 && i < entries.length)
        .map((i) => entries[i]!.id)
      console.info(
        "[ai-report] Selected",
        selectedIds.length,
        "entries (legacy format, no hot topics)",
      )
      return { selectedIds, hotTopicIds: [], hotTopicReasons: new Map() }
    }

    console.info("[ai-report] No JSON found in screening result, using all entries")
    return { selectedIds: entries.map((e) => e.id), hotTopicIds: [], hotTopicReasons: new Map() }
  } catch (err) {
    console.info("[ai-report] Failed to parse screening result:", err)
    return { selectedIds: entries.map((e) => e.id), hotTopicIds: [], hotTopicReasons: new Map() }
  }
}

/**
 * Convert an existing report into a podcast broadcast script using Claude CLI.
 * Reads the podcast-script skill and the methodology file as prompt context.
 */
export async function generatePodcastScript(
  reportContent: string,
  onChunk: (text: string) => void,
  onStatus: (status: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): Promise<void> {
  const prefs = loadPreferences()
  onStatus("Converting report to podcast script...")

  const skillsSection = formatSkillsPrompt(loadAllSkills())

  // Read the methodology file for additional context
  let methodology = ""
  try {
    const appPath = app.getAppPath()
    const methodologyPath = path.join(appPath, "resources", "小Lin说视频文案方法论.md")
    methodology = fs.readFileSync(methodologyPath, "utf-8")
    // Strip frontmatter
    methodology = methodology.replace(/^---[\s\S]*?---\n*/, "").trim()
  } catch {
    console.warn("[ai-report] Could not read methodology file, using skill only")
  }

  const langInstruction = getLanguageInstruction(prefs.language)

  // Format today's date in a natural spoken style (e.g. "2026年2月20日")
  const now = new Date()
  const spokenDate = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`

  const prompt = `${skillsSection}

Your task: Convert the following daily briefing report into a podcast broadcast script (口播文案).

${methodology ? `## Reference Methodology\n\n${methodology}\n\n` : ""}${langInstruction}

## Podcast Branding

Show name: YOMOO 每日AI快送
Date: ${spokenDate}

The script MUST begin with a brief greeting that includes the date, then IMMEDIATELY dive into the first news topic.
Example: "大家好，欢迎来到${spokenDate}的 YOMOO 每日AI快送。" followed directly by the first piece of news.
IMPORTANT: Do NOT add filler phrases after the greeting such as "今天的内容非常重要"、"今天有很多精彩内容"、"今天我们为大家带来了丰富的内容" or any similar hype. Just go straight into the news.

The script MUST end with:
1. A call-to-action promoting the text version mail list: mention that viewers who prefer reading can subscribe to the free mail list for a text version of the daily AI express, and the subscription link is in the video description.
2. A call-to-action encouraging sharing: ask listeners to share or forward the show if they find it helpful.
3. A sign-off that invites listeners back tomorrow.

Example ending:
"如果你想通过阅读文字版更快地获取每日的AI快送信息，欢迎免费订阅我们的mail list，地址在视频描述里。如果您觉得我们的节目对您有帮助，请帮忙分享、转发给您的朋友。好了，今天就到这里，我们明天见！"

## Source Report to Convert

${reportContent}

IMPORTANT: Output ONLY the podcast script as plain spoken text. No markdown formatting, no headings, no bullet points. Just natural flowing speech paragraphs separated by blank lines.`

  console.info("[ai-report] Podcast prompt length:", prompt.length, "chars")

  let fullContent = ""
  try {
    await runClaudeStreaming(
      prompt,
      (chunk) => {
        fullContent += chunk
        onChunk(chunk)
      },
      [],
      3,
    )

    // Save podcast script to database
    const scriptId = Math.random().toString(36).slice(2) + Date.now().toString(36)
    const now = Math.floor(Date.now() / 1000)
    const title = `Podcast Script - ${new Date().toLocaleDateString("en-CA")}`
    execute(
      "INSERT INTO reports (id, title, content, language, time_range, entry_count, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [scriptId, title, fullContent, prefs.language, 0, 0, "podcast", now],
    )
    saveDatabase()
    console.info("[ai-report] Podcast script saved:", scriptId)

    onDone()
  } catch (err) {
    onError(`Claude CLI error during podcast script generation: ${err}`)
  }
}

/**
 * Promise-based wrapper: generates report and returns the full content as a string.
 */
export async function generateReportToString(
  onStatus: (status: string) => void,
  groupId?: string,
  youtubeInsights?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullContent = ""
    generateReport(
      (chunk) => {
        fullContent += chunk
      },
      onStatus,
      () => resolve(fullContent),
      (error) => reject(new Error(error)),
      groupId,
      youtubeInsights,
    ).catch(reject)
  })
}

/**
 * Promise-based wrapper: generates podcast script and returns it as a string.
 */
export async function generatePodcastScriptToString(
  reportContent: string,
  onStatus: (status: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullContent = ""
    generatePodcastScript(
      reportContent,
      (chunk) => {
        fullContent += chunk
      },
      onStatus,
      () => resolve(fullContent),
      (error) => reject(new Error(error)),
    ).catch(reject)
  })
}

/**
 * Generate a one-sentence SEO description from a report using Claude CLI.
 * Returns a Chinese summary (80-150 chars) suitable for meta description and OG tags.
 */
export async function generateSeoDescription(reportContent: string): Promise<string> {
  const prompt = `从以下AI新闻报告中提取一句话摘要（中文，80-150字），用于网页meta description。
概括当天最重要的2-3个新闻主题，吸引点击。不要用"本文"、"本期"等开头。直接描述内容。
只输出摘要文本，不要其他内容。

${reportContent.slice(0, 3000)}`
  return (await runClaude(prompt)).trim()
}

export function parseDescriptionHeadlines(description: string): string[] {
  const lines = description.split("\n")
  const headlines: string[] = []
  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)/)
    if (match) {
      headlines.push(match[1]!.trim())
    }
  }
  return headlines
}

export function formatYouTubeInsights(videos: ChannelVideo[]): string {
  if (videos.length === 0) return ""

  const sorted = [...videos].sort((a, b) => b.viewCount - a.viewCount)
  const top = sorted.slice(0, 10)

  const lines = top.map((v) => {
    const date = v.publishedAt.slice(0, 10)
    let headlines = parseDescriptionHeadlines(v.description)

    if (headlines.length === 0) {
      headlines = getTopicsFromDatabase(date)
    }

    const topicsStr = headlines.length > 0 ? `   Topics: ${headlines.join(", ")}` : ""

    return `- ${date} | Views: ${v.viewCount} | Likes: ${v.likeCount} | Comments: ${v.commentCount}${topicsStr ? `\n${topicsStr}` : ""}`
  })

  return `## YouTube Audience Insights (recent videos, sorted by views)

${lines.join("\n\n")}

When screening entries, consider that topics similar to high-performing episodes may resonate better with the audience. This is a soft preference — news value still takes priority.`
}

function getTopicsFromDatabase(date: string): string[] {
  try {
    const dayStart = Math.floor(new Date(date).getTime() / 1000)
    const dayEnd = dayStart + 86400
    const rows = queryAll<{ topics_json: string }>(
      `SELECT topics_json FROM report_topics WHERE created_at >= ? AND created_at < ? LIMIT 1`,
      [dayStart, dayEnd],
    )
    if (rows.length === 0) return []
    const topics = JSON.parse(rows[0]!.topics_json) as import("./database").TopicEntry[]
    return topics.map((t) => t.name)
  } catch {
    return []
  }
}

export interface ShortsScript {
  title: string
  headline: string
  script: string
  newsUrl: string
  ogImageUrl?: string
  keyPoints: string[]
}

export function parseShortsScriptResult(result: string): ShortsScript {
  const jsonMatch = result.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error("No JSON found in Shorts script result")
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
  if (!parsed.title || !parsed.headline || !parsed.script || !parsed.newsUrl) {
    throw new Error("Shorts script missing required fields (title, headline, script, newsUrl)")
  }

  return {
    title: parsed.title as string,
    headline: parsed.headline as string,
    script: parsed.script as string,
    newsUrl: parsed.newsUrl as string,
    ogImageUrl: (parsed.ogImageUrl as string) || undefined,
    keyPoints: Array.isArray(parsed.keyPoints) ? (parsed.keyPoints as string[]) : [],
  }
}

export async function generateShortsScript(
  reportContent: string,
  onStatus: (status: string) => void,
  excludeTopics?: string[],
): Promise<ShortsScript> {
  onStatus("Generating Shorts script...")

  const exclusionClause =
    excludeTopics && excludeTopics.length > 0
      ? `\n\nIMPORTANT: Do NOT select any of these topics (already used):\n${excludeTopics.map((t) => `- ${t}`).join("\n")}\nPick a DIFFERENT news item.\n`
      : ""

  const prompt = `You are an elite viral short-video scriptwriter for "YOMOO 每日AI快送", a Chinese AI/tech news channel on YouTube Shorts.

From the following daily report, select the ONE news item that will get the most views. Prioritize: AI tools that non-technical users will encounter soon, major company announcements, surprising statistics, or controversial changes.
${exclusionClause}
SCRIPT RULES (40-50 seconds when read aloud at normal pace):

1. HOOK (first sentence, under 2 seconds): Use ONE of these patterns:
   - Urgency: "[公司]刚刚宣布了一个重磅消息"
   - Contrast: "AI在做X，但实际上Y"
   - Disbelief: "你可能不信，[surprising fact]"
   - Number: "[数字]% 的人不知道这件事"
   NO greeting. NO "大家好". NO "你知道吗". Jump straight to the shocking fact.

2. BODY (3-4 punchy sentences): Direct, conversational Chinese. Each sentence delivers one new fact.
   - Insert a PATTERN BREAK at ~15 seconds: a surprising stat, a rhetorical question, or "但关键是..."
   - Keep sentences short (under 25 chars each). This helps TTS pacing.

3. ENDING: Rotate between these CTA styles (pick one):
   - "你觉得呢？评论区告诉我，关注YOMOO看更多AI快送"
   - "保存这条，以后会用到。关注YOMOO不错过每日AI快送"
   - "点个关注，明天还有更劲爆的。YOMOO每日AI快送"

Output strict JSON only, no markdown fencing:
{
  "title": "YouTube title, max 35 Chinese chars, use number or superlative (e.g. '3个你必须知道的AI更新', 'AI刚刚学会了最可怕的技能')",
  "headline": "Bold on-screen headline, max 12 Chinese chars, punchy (e.g. 'AI接管电脑', 'Copilot大升级')",
  "script": "The spoken script text, 40-50 seconds when read aloud",
  "newsUrl": "URL of the source article from the report",
  "ogImageUrl": "OG image URL if mentioned in the report, or null",
  "keyPoints": ["3-4 short key facts/stats shown on screen, max 8 chars each, e.g. '速度快5倍', '免费使用', '用户破亿'"]
}

Daily report:
${reportContent.slice(0, 5000)}`

  const result = await runClaude(prompt)
  return parseShortsScriptResult(result)
}

function stripHtml(html: string): string {
  return html
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .trim()
}
