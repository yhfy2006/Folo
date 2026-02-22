import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"

import { app } from "electron"
import path from "pathe"

import type { Entry } from "./database"
import { execute, queryAll } from "./database"
import type { UserPreferences } from "./preferences"
import { loadPreferences } from "./preferences"
import { fetchArticleContent } from "./readability"
import { getWorkspacePath } from "./workspace"

/**
 * Read a skill file from the workspace and return its content (without frontmatter).
 */
function readSkill(skillName: string): string {
  const skillPath = path.join(getWorkspacePath(), ".claude", "skills", `${skillName}.md`)
  try {
    const content = fs.readFileSync(skillPath, "utf-8")
    // Strip YAML frontmatter
    return content.replace(/^---[\s\S]*?---\n*/, "").trim()
  } catch {
    console.warn("[ai-report] Could not read skill:", skillName)
    return ""
  }
}

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
): Promise<void> {
  const prefs = loadPreferences()
  console.info("[ai-report] Preferences:", JSON.stringify(prefs))

  // Query entries within the time range
  const cutoffMs = Date.now() - prefs.timeRange * 60 * 60 * 1000
  const cutoffSec = Math.floor(cutoffMs / 1000)
  console.info("[ai-report] Cutoff timestamp:", cutoffSec, `(${new Date(cutoffMs).toISOString()})`)

  const entries = queryAll<EntryWithFeed>(
    `SELECT e.*, f.title as feed_title, f.category as feed_category
     FROM entries e
     LEFT JOIN feeds f ON e.feed_id = f.id
     WHERE (e.published_at > ? OR e.inserted_at > ?)
       AND e.id NOT IN (SELECT entry_id FROM report_entries)
     ORDER BY e.published_at DESC`,
    [cutoffSec, cutoffSec],
  )

  if (entries.length === 0) {
    onChunk(`No entries found in the last ${prefs.timeRange} hours.`)
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

  onStatus(`Screening ${entriesToScreen.length} entries from the last ${prefs.timeRange}h...`)

  // Stage 1: Screening - use the "screening" skill
  const screeningPrompt = buildScreeningPrompt(entriesToScreen, prefs)
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
  const selectedIds = parseSelectedIds(screeningResult, entriesToScreen)

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

  // Stage 3: Generate final report with streaming - use the "daily-report" skill
  onStatus(`Generating report from ${enrichedEntries.length} articles...`)
  const reportPrompt = buildReportPrompt(enrichedEntries, prefs)
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
    const title = generateReportTitle(prefs)
    execute(
      "INSERT INTO reports (id, title, content, language, time_range, entry_count, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        reportId,
        title,
        fullContent,
        prefs.language,
        prefs.timeRange,
        enrichedEntries.length,
        "report",
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
    console.info(
      "[ai-report] Report saved:",
      reportId,
      "with",
      enrichedEntries.length,
      "entries recorded",
    )

    onDone()
  } catch (err) {
    onError(`Claude CLI error during report generation: ${err}`)
  }
}

function generateReportTitle(_prefs: UserPreferences): string {
  const now = new Date()
  const date = now.toLocaleDateString("en-CA") // YYYY-MM-DD
  const hour = now.getHours()
  const period = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening"
  return `${period} Report - ${date}`
}

function buildScreeningPrompt(entries: EntryWithFeed[], prefs: UserPreferences): string {
  const entryList = entries
    .map((e, i) => {
      const desc = e.description ? stripHtml(e.description).slice(0, 150) : ""
      return `[${i}] ${e.title || "Untitled"} | ${e.feed_title || "?"} | ${desc}`
    })
    .join("\n")

  const interestsStr =
    prefs.interests.length > 0 ? `User interests: ${prefs.interests.join(", ")}` : ""

  const skillContent = readSkill("screening")

  return `${skillContent}

${interestsStr}

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

function buildReportPrompt(entries: EnrichedEntry[], prefs: UserPreferences): string {
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

  const skillContent = readSkill("daily-report")

  return `${skillContent}

${langInstruction}
${styleInstruction}
${interestsStr}

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

function runClaude(prompt: string): Promise<string> {
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

    const proc = spawn(claudePath, ["-p"], {
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

function runClaudeStreaming(prompt: string, onChunk: (text: string) => void): Promise<void> {
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

    const proc = spawn(claudePath, ["-p"], {
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

function parseSelectedIds(result: string, entries: EntryWithFeed[]): string[] {
  try {
    const match = result.match(/\[[\s\S]*?\]/)
    if (!match) {
      console.info("[ai-report] No JSON array found in screening result, using all entries")
      return entries.map((e) => e.id)
    }

    const indices = JSON.parse(match[0]) as number[]
    console.info("[ai-report] Selected", indices.length, "entries from screening")
    return indices.filter((i) => i >= 0 && i < entries.length).map((i) => entries[i]!.id)
  } catch (err) {
    console.info("[ai-report] Failed to parse screening result:", err)
    return entries.map((e) => e.id)
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

  const skillContent = readSkill("podcast-script")

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

  const prompt = `${skillContent}

${methodology ? `## Reference Methodology\n\n${methodology}\n\n` : ""}${langInstruction}

## Podcast Branding

Show name: YOMOO 每日AI快送
Date: ${spokenDate}

The script MUST begin with a greeting to the audience, for example:
"大家好，欢迎来到${spokenDate}的 YOMOO 每日AI快送。"

The script MUST end with:
1. A call-to-action encouraging sharing: ask listeners to share or forward the show if they find it helpful, and mention they can reply to the email with suggestions or feedback.
2. A sign-off that invites listeners back tomorrow.

Example ending:
"如果您觉得我们的节目对您有帮助，请帮忙分享、转发给您的朋友，也欢迎直接回复邮件给我们提建议。好了，今天就到这里，我们明天见！"

## Source Report to Convert

${reportContent}

IMPORTANT: Output ONLY the podcast script as plain spoken text. No markdown formatting, no headings, no bullet points. Just natural flowing speech paragraphs separated by blank lines.`

  console.info("[ai-report] Podcast prompt length:", prompt.length, "chars")

  let fullContent = ""
  try {
    await runClaudeStreaming(prompt, (chunk) => {
      fullContent += chunk
      onChunk(chunk)
    })

    // Save podcast script to database
    const scriptId = Math.random().toString(36).slice(2) + Date.now().toString(36)
    const now = Math.floor(Date.now() / 1000)
    const title = `Podcast Script - ${new Date().toLocaleDateString("en-CA")}`
    execute(
      "INSERT INTO reports (id, title, content, language, time_range, entry_count, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [scriptId, title, fullContent, prefs.language, 0, 0, "podcast", now],
    )
    console.info("[ai-report] Podcast script saved:", scriptId)

    onDone()
  } catch (err) {
    onError(`Claude CLI error during podcast script generation: ${err}`)
  }
}

/**
 * Promise-based wrapper: generates report and returns the full content as a string.
 */
export async function generateReportToString(onStatus: (status: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullContent = ""
    generateReport(
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
