# AI快送 Quality Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cross-report topic continuity, hot topic deep dive, audience-friendly writing, and 15-minute length control to AI快送 report generation.

**Architecture:** Extend the existing 3-stage report pipeline with new stages (topic retrieval, deep dive, topic extraction). Store topic digests in a new `report_topics` table. Enhance prompts with historical context, writing guidelines, and length constraints. Modify `runClaude` to support configurable `--max-turns` for deep dive research.

**Tech Stack:** TypeScript, sql.js (SQLite), Claude CLI, Electron IPC (existing stack, no new dependencies)

---

### Task 1: Add `report_topics` table to database

**Files:**

- Modify: `apps/simple-reader/main/database.ts:53-156` (initDatabase function)

**Step 1: Add the new table creation SQL**

In `apps/simple-reader/main/database.ts`, add to the `db.run(...)` block (after `feed_group_feeds` table, before the closing backtick at line 138):

```sql
CREATE TABLE IF NOT EXISTS report_topics (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  group_id TEXT,
  topics_json TEXT NOT NULL,
  digest TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_topics_report ON report_topics(report_id);
CREATE INDEX IF NOT EXISTS idx_report_topics_group ON report_topics(group_id);
CREATE INDEX IF NOT EXISTS idx_report_topics_created ON report_topics(created_at);
```

**Step 2: Add the ReportTopics TypeScript interface**

After the `FeedGroup` interface (line 47), add:

```typescript
export interface ReportTopics {
  id: string
  report_id: string
  group_id: string | null
  topics_json: string // JSON string of TopicEntry[]
  digest: string
  created_at: number
}

export interface TopicEntry {
  name: string
  keywords: string[]
  summary: string
}
```

**Step 3: Verify the app starts without errors**

Run: `cd apps/simple-reader && pnpm run dev`
Expected: App starts, database initializes without errors. Check console for no SQL errors.

**Step 4: Commit**

```bash
git add apps/simple-reader/main/database.ts
git commit -m "feat(simple-reader): add report_topics table for cross-report topic continuity"
```

---

### Task 2: Refactor `runClaude` to support configurable max-turns

**Files:**

- Modify: `apps/simple-reader/main/ai-report.ts:322-375` (runClaude function)
- Modify: `apps/simple-reader/main/ai-report.ts:377-432` (runClaudeStreaming function)

**Step 1: Update `runClaude` to accept maxTurns parameter**

Currently line 335 hardcodes `--max-turns 1`. Change the function signature and args construction:

```typescript
export function runClaude(prompt: string, extraArgs?: string[], maxTurns?: number): Promise<string> {
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
    const args = ["-p", "--dangerously-skip-permissions", "--max-turns", String(turns), ...(extraArgs || [])]
    // ... rest unchanged
```

Do the same for `runClaudeStreaming`:

```typescript
function runClaudeStreaming(
  prompt: string,
  onChunk: (text: string) => void,
  extraArgs?: string[],
  maxTurns?: number,
): Promise<void> {
  // ... same pattern, use maxTurns ?? 1
```

**Step 2: Verify existing callers still work**

All existing callers pass no `maxTurns`, so they default to 1. No behavior change.

**Step 3: Commit**

```bash
git add apps/simple-reader/main/ai-report.ts
git commit -m "refactor(simple-reader): add maxTurns parameter to runClaude functions"
```

---

### Task 3: Enhance screening prompt to identify hot topics

**Files:**

- Modify: `apps/simple-reader/main/ai-report.ts:210-231` (buildScreeningPrompt)
- Modify: `apps/simple-reader/main/ai-report.ts:434-449` (parseSelectedIds)

**Step 1: Update `buildScreeningPrompt` to request hot topics**

Replace the return statement in `buildScreeningPrompt` (lines 223-231):

```typescript
function buildScreeningPrompt(entries: EntryWithFeed[], prefs: UserPreferences): string {
  const entryList = entries
    .map((e, i) => {
      const desc = e.description ? stripHtml(e.description).slice(0, 150) : ""
      return `[${i}] ${e.title || "Untitled"} | ${e.feed_title || "?"} | ${desc}`
    })
    .join("\n")

  const interestsStr =
    prefs.interests.length > 0 ? `User interests: ${prefs.interests.join(", ")}` : ""

  const skillsSection = formatSkillsPrompt(loadAllSkills())

  return `${skillsSection}

Your task: Screen RSS entries and select valuable ones, and identify 1-2 "hot topics" that deserve deeper investigation.

${interestsStr}

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
```

**Step 2: Update parsing to handle new JSON format**

Replace `parseSelectedIds` with a new function that returns both selected IDs and hot topic info:

```typescript
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
              const id = entries[ht.index]!.id
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
```

**Step 3: Update `generateReport` to use new parsing**

In `generateReport`, replace line 124:

```typescript
const selectedIds = parseSelectedIds(screeningResult, entriesToScreen)
```

with:

```typescript
const screening = parseScreeningResult(screeningResult, entriesToScreen)
const selectedIds = screening.selectedIds
```

Also keep `screening.hotTopicIds` and `screening.hotTopicReasons` available for later stages (we'll use them in Task 5).

**Step 4: Remove old `parseSelectedIds` function**

Delete the old `parseSelectedIds` function (lines 434-449) since it's replaced by `parseScreeningResult`.

**Step 5: Verify the app works with the new screening format**

Run: `cd apps/simple-reader && pnpm run dev`
Expected: Report generation still works. The screening result may still come back as a plain array (old Claude skill), but the fallback handles it.

**Step 6: Commit**

```bash
git add apps/simple-reader/main/ai-report.ts
git commit -m "feat(simple-reader): enhance screening to identify hot topics for deep dive"
```

---

### Task 4: Add historical topic retrieval (Stage 2.5)

**Files:**

- Modify: `apps/simple-reader/main/ai-report.ts` (add new functions after `enrichWithOriginalContent`)

**Step 1: Add topic retrieval helper functions**

After the `enrichWithOriginalContent` function (after line 259), add:

```typescript
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
```

**Step 2: Verify TypeScript compiles**

Run: `cd apps/simple-reader && npx tsc --noEmit`
Expected: No type errors.

**Step 3: Commit**

```bash
git add apps/simple-reader/main/ai-report.ts
git commit -m "feat(simple-reader): add historical topic retrieval for cross-report continuity"
```

---

### Task 5: Add hot topic deep dive (Stage 2.7)

**Files:**

- Modify: `apps/simple-reader/main/ai-report.ts` (add deep dive function, wire into generateReport)

**Step 1: Add the deep dive function**

After the `formatHistoricalContext` function, add:

```typescript
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
```

**Step 2: Wire stages 2.5 and 2.7 into generateReport**

In `generateReport`, after Stage 2 (enrichWithOriginalContent, around line 147), add the new stages before Stage 3:

Replace lines 149-152:

```typescript
// Stage 3: Generate final report with streaming - use the "daily-report" skill
onStatus(`Generating report from ${enrichedEntries.length} articles...`)
const reportPrompt = buildReportPrompt(enrichedEntries, effectivePrefs)
```

With:

```typescript
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
```

**Step 3: Verify TypeScript compiles**

Run: `cd apps/simple-reader && npx tsc --noEmit`
Expected: Will fail because `buildReportPrompt` signature changed. That's fixed in Task 6.

**Step 4: Commit (combined with Task 6)**

This task's commit is combined with Task 6 since `buildReportPrompt` is updated there.

---

### Task 6: Enhance report prompt with all new context

**Files:**

- Modify: `apps/simple-reader/main/ai-report.ts:261-306` (buildReportPrompt)

**Step 1: Update `buildReportPrompt` with new parameters and prompt sections**

Replace the entire `buildReportPrompt` function:

```typescript
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
```

**Step 2: Verify TypeScript compiles**

Run: `cd apps/simple-reader && npx tsc --noEmit`
Expected: No type errors.

**Step 3: Commit**

```bash
git add apps/simple-reader/main/ai-report.ts
git commit -m "feat(simple-reader): add deep dive, historical context, and enhanced prompts to report generation"
```

---

### Task 7: Add post-generation topic extraction (Stage 3.5)

**Files:**

- Modify: `apps/simple-reader/main/ai-report.ts` (add extractTopics function, wire into generateReport)

**Step 1: Add the topic extraction function**

After the `deepDiveHotTopics` function, add:

```typescript
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
    console.info("[ai-report] Topics extracted and saved:", parsed.topics.length, "topics")
  } catch (err) {
    console.warn("[ai-report] Topic extraction failed (non-blocking):", err)
  }
}
```

**Step 2: Wire topic extraction into generateReport**

In `generateReport`, after the report is saved to the database (after the `console.info("[ai-report] Report saved:..."` line, around line 193), add the async topic extraction before `onDone()`:

```typescript
console.info(
  "[ai-report] Report saved:",
  reportId,
  "with",
  enrichedEntries.length,
  "entries recorded",
)

// Stage 3.5: Extract topics asynchronously (don't block report display)
onStatus("Extracting topic digest...")
extractAndSaveTopics(fullContent, reportId, groupId).catch((err) => {
  console.warn("[ai-report] Async topic extraction failed:", err)
})

onDone()
```

Note: We call `extractAndSaveTopics` but don't await it inside the try block — the `.catch()` ensures errors don't propagate. However, we do want it to complete before the pipeline moves on (for the pipeline use case), so we `await` it but wrap errors. Actually, let's await it so topics are available if the pipeline immediately generates the next report:

```typescript
// Stage 3.5: Extract topics (errors are non-blocking)
onStatus("Extracting topic digest...")
await extractAndSaveTopics(fullContent, reportId, groupId).catch((err) => {
  console.warn("[ai-report] Topic extraction failed:", err)
})

onDone()
```

**Step 3: Verify TypeScript compiles and app runs**

Run: `cd apps/simple-reader && npx tsc --noEmit`
Expected: No type errors.

**Step 4: Commit**

```bash
git add apps/simple-reader/main/ai-report.ts
git commit -m "feat(simple-reader): add post-generation topic extraction for cross-report continuity"
```

---

### Task 8: End-to-end manual test

**Files:** None (testing only)

**Step 1: Run the app**

Run: `cd apps/simple-reader && pnpm run dev`

**Step 2: Generate a report**

Click "Generate Report" in the UI. Observe console logs for:

- `[ai-report] Screening result` — should contain `hot_topics` in JSON
- `[ai-report] Found N relevant historical topics` — 0 on first run, which is expected
- `[ai-report] Deep dive completed for:` — if hot topics were identified
- `[ai-report] Topics extracted and saved:` — after report completes

**Step 3: Generate a second report (different time range or group)**

This tests the historical topic retrieval. On the second report:

- Console should show `Found N relevant historical topics` with N > 0
- The generated report should reference previous topics naturally

**Step 4: Verify database contents**

Open the app's DevTools console and check:

```javascript
// In Electron DevTools
require("electron").ipcRenderer.invoke("get-report-topics")
```

Or check the database file directly.

**Step 5: Commit final state if any fixes were needed**

```bash
git add -A
git commit -m "fix(simple-reader): adjustments from end-to-end testing"
```

---

## Summary of Changes

| Task | Description                      | Files        | Estimated Effort |
| ---- | -------------------------------- | ------------ | ---------------- |
| 1    | `report_topics` table + types    | database.ts  | Small            |
| 2    | `runClaude` maxTurns parameter   | ai-report.ts | Small            |
| 3    | Screening hot topics enhancement | ai-report.ts | Medium           |
| 4    | Historical topic retrieval       | ai-report.ts | Medium           |
| 5    | Hot topic deep dive              | ai-report.ts | Medium           |
| 6    | Enhanced report prompt           | ai-report.ts | Medium           |
| 7    | Post-generation topic extraction | ai-report.ts | Medium           |
| 8    | End-to-end manual test           | -            | Small            |

Total: All changes are in 2 files (`database.ts` and `ai-report.ts`).
