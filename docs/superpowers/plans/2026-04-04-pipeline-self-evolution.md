# Pipeline Self-Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `reflect` stage that analyzes YouTube performance data and auto-updates a content strategy skill file, closing the feedback loop for content quality improvement.

**Architecture:** New `reflect` pipeline stage runs after `verify`, fetches YouTube data (long videos + Shorts), correlates with historical topics, uses Claude to generate/update a `content-strategy.md` skill file that all downstream generation stages automatically load via existing `loadAllSkills()`.

**Tech Stack:** TypeScript, sql.js, YouTube Data API v3, Claude CLI, existing skill system

**Spec:** `docs/superpowers/specs/2026-04-04-pipeline-self-evolution-design.md`

---

### Task 1: Add `video_uploads` DB Table and Interface

**Files:**

- Modify: `apps/simple-reader/main/database.ts:49-62` (add interface)
- Modify: `apps/simple-reader/main/database.ts:81-166` (add CREATE TABLE)

- [ ] **Step 1: Add `VideoUpload` interface**

In `apps/simple-reader/main/database.ts`, after the `TopicEntry` interface (line 62), add:

```typescript
export interface VideoUpload {
  id: string
  video_id: string
  type: string // 'video' | 'shorts'
  title: string | null
  date: string
  group_id: string | null
  created_at: number
}
```

- [ ] **Step 2: Add CREATE TABLE to `initDatabase`**

In `apps/simple-reader/main/database.ts`, inside the `db.run()` template literal (before the closing backtick+`)` at line 166), add:

```sql

    CREATE TABLE IF NOT EXISTS video_uploads (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      date TEXT NOT NULL,
      group_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_video_uploads_video_id ON video_uploads(video_id);
    CREATE INDEX IF NOT EXISTS idx_video_uploads_date ON video_uploads(date);
```

- [ ] **Step 3: Commit**

```bash
cd apps/simple-reader && git add main/database.ts && git commit -m "feat(pipeline): add video_uploads table for Shorts/video tracking"
```

---

### Task 2: Enhance `listChannelVideos` with Duration

**Files:**

- Modify: `apps/simple-reader/main/youtube.ts:224-288`

- [ ] **Step 1: Add `duration` to `ChannelVideo` interface**

In `apps/simple-reader/main/youtube.ts`, update the `ChannelVideo` interface at line 224:

```typescript
export interface ChannelVideo {
  videoId: string
  title: string
  publishedAt: string
  description: string
  viewCount: number
  likeCount: number
  commentCount: number
  duration: string // ISO 8601 e.g. "PT5M30S"
}
```

- [ ] **Step 2: Add `contentDetails` to the API request**

In `apps/simple-reader/main/youtube.ts`, change line 269 from:

```typescript
  const videosResp = await fetch(`${VIDEOS_URL}?part=snippet,statistics&id=${videoIds.join(",")}`, {
```

to:

```typescript
  const videosResp = await fetch(`${VIDEOS_URL}?part=snippet,statistics,contentDetails&id=${videoIds.join(",")}`, {
```

- [ ] **Step 3: Map `duration` in the return**

In `apps/simple-reader/main/youtube.ts`, update the return mapping at line 279 to include duration:

```typescript
return (videosData.items || []).map((item: any) => ({
  videoId: item.id as string,
  title: item.snippet.title as string,
  publishedAt: item.snippet.publishedAt as string,
  description: item.snippet.description as string,
  viewCount: Number(item.statistics.viewCount || 0),
  likeCount: Number(item.statistics.likeCount || 0),
  commentCount: Number(item.statistics.commentCount || 0),
  duration: (item.contentDetails?.duration as string) || "PT0S",
}))
```

- [ ] **Step 4: Add `parseDuration` helper**

At the end of `apps/simple-reader/main/youtube.ts` (after the `buildVideoDescription` function), add:

```typescript
/**
 * Parse ISO 8601 duration (e.g. "PT5M30S", "PT45S") to total seconds.
 */
export function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  const hours = Number(match[1] || 0)
  const minutes = Number(match[2] || 0)
  const seconds = Number(match[3] || 0)
  return hours * 3600 + minutes * 60 + seconds
}
```

- [ ] **Step 5: Write test for `parseDuration`**

Create `apps/simple-reader/main/__tests__/youtube.test.ts`:

```typescript
import { describe, expect, it } from "vitest"

import { parseDuration } from "../youtube"

describe("parseDuration", () => {
  it("parses minutes and seconds", () => {
    expect(parseDuration("PT5M30S")).toBe(330)
  })

  it("parses seconds only", () => {
    expect(parseDuration("PT45S")).toBe(45)
  })

  it("parses hours, minutes, seconds", () => {
    expect(parseDuration("PT1H2M3S")).toBe(3723)
  })

  it("returns 0 for empty or invalid", () => {
    expect(parseDuration("PT0S")).toBe(0)
    expect(parseDuration("")).toBe(0)
  })
})
```

- [ ] **Step 6: Run test**

Run: `cd apps/simple-reader && npx vitest run main/__tests__/youtube.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 7: Commit**

```bash
cd apps/simple-reader && git add main/youtube.ts main/__tests__/youtube.test.ts && git commit -m "feat(youtube): add duration field and parseDuration helper"
```

---

### Task 3: Save `youtubeAccessToken` in Verify Stage

**Files:**

- Modify: `apps/simple-reader/main/pipeline/stages/verify.ts:44-54`

- [ ] **Step 1: Persist accessToken on context**

In `apps/simple-reader/main/pipeline/stages/verify.ts`, the verify stage currently creates a local `accessToken` variable inside the YouTube insights block (around line 48-53) but doesn't save it. Update the block to persist it:

Replace lines 44-63:

```typescript
// Pre-fetch YouTube audience insights (non-fatal)
let { youtubeInsights } = ctx
let youtubeAccessToken: string | undefined
if (!youtubeInsights && prefs.youtubeEnabled && prefs.youtubeRefreshToken) {
  try {
    callbacks.onStatus("Fetching YouTube audience insights...")
    youtubeAccessToken = await refreshAccessToken(
      prefs.youtubeRefreshToken,
      prefs.youtubeClientId,
      prefs.youtubeClientSecret,
    )
    const videos = await listChannelVideos(youtubeAccessToken)
    youtubeInsights = formatYouTubeInsights(videos) || undefined
    if (youtubeInsights) {
      console.info("[verify] YouTube insights loaded:", videos.length, "videos analyzed")
      callbacks.onStatus(`YouTube insights loaded: ${videos.length} videos analyzed`)
    }
  } catch (err) {
    console.info("[verify] YouTube insights fetch failed (non-fatal):", err)
  }
}

return { ...ctx, owner, groupName, youtubeInsights, youtubeAccessToken }
```

- [ ] **Step 2: Commit**

```bash
cd apps/simple-reader && git add main/pipeline/stages/verify.ts && git commit -m "feat(pipeline): persist youtubeAccessToken from verify stage"
```

---

### Task 4: Record Uploads in YouTube Stage

**Files:**

- Modify: `apps/simple-reader/main/pipeline/stages/youtube.ts`

- [ ] **Step 1: Add DB imports**

In `apps/simple-reader/main/pipeline/stages/youtube.ts`, add to the imports at the top:

```typescript
import { execute, saveDatabase } from "../../database"
```

- [ ] **Step 2: Insert record after successful upload**

In `apps/simple-reader/main/pipeline/stages/youtube.ts`, after the `setThumbnail` try/catch block and before the `const youtubeUrl` line (around line 55), add:

```typescript
// Record upload for reflect stage analytics
try {
  const uploadId = Math.random().toString(36).slice(2) + Date.now().toString(36)
  const now = Math.floor(Date.now() / 1000)
  execute(
    "INSERT INTO video_uploads (id, video_id, type, title, date, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      uploadId,
      videoId,
      "video",
      scenes.youtubeTitle || `YOMOO 每日AI快送 — ${date}`,
      date,
      ctx.groupId || null,
      now,
    ],
  )
  saveDatabase()
} catch (err) {
  console.info("[youtube] Failed to record upload (non-fatal):", err)
}
```

- [ ] **Step 3: Commit**

```bash
cd apps/simple-reader && git add main/pipeline/stages/youtube.ts && git commit -m "feat(pipeline): record video uploads for analytics"
```

---

### Task 5: Record Uploads in Shorts Stage

**Files:**

- Modify: `apps/simple-reader/main/pipeline/stages/shorts.ts`

- [ ] **Step 1: Add DB imports**

In `apps/simple-reader/main/pipeline/stages/shorts.ts`, add to the imports:

```typescript
import { execute, saveDatabase } from "../../database"
```

- [ ] **Step 2: Insert record after successful Shorts upload**

In `apps/simple-reader/main/pipeline/stages/shorts.ts`, inside the `generateOneShorts` function, after the `uploadVideo` call and the `const url` line (around line 157-158), before the final `return`, add:

```typescript
// Record upload for reflect stage analytics
try {
  const uploadId = Math.random().toString(36).slice(2) + Date.now().toString(36)
  const now = Math.floor(Date.now() / 1000)
  execute(
    "INSERT INTO video_uploads (id, video_id, type, title, date, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [uploadId, videoId, "shorts", shortsScript.title, ctx.date, ctx.groupId || null, now],
  )
  saveDatabase()
} catch (err) {
  console.info("[shorts] Failed to record upload (non-fatal):", err)
}
```

Note: This is inside the `if (!ctx.skipUpload)` path, so it only records actual uploads.

- [ ] **Step 3: Commit**

```bash
cd apps/simple-reader && git add main/pipeline/stages/shorts.ts && git commit -m "feat(pipeline): record Shorts uploads for analytics"
```

---

### Task 6: Add `"reflect"` to StageName

**Files:**

- Modify: `apps/simple-reader/main/pipeline/types.ts:3-12`

- [ ] **Step 1: Add reflect to StageName union**

In `apps/simple-reader/main/pipeline/types.ts`, update the `StageName` type to add `"reflect"` after `"verify"`:

```typescript
export type StageName =
  | "verify"
  | "reflect"
  | "report"
  | "podcast"
  | "audio"
  | "upload"
  | "publish"
  | "video"
  | "youtube"
  | "shorts"
```

- [ ] **Step 2: Commit**

```bash
cd apps/simple-reader && git add main/pipeline/types.ts && git commit -m "feat(pipeline): add reflect to StageName"
```

---

### Task 7: Create Reflect Stage

**Files:**

- Create: `apps/simple-reader/main/pipeline/stages/reflect.ts`
- Create: `apps/simple-reader/main/pipeline/__tests__/reflect.test.ts`

- [ ] **Step 1: Write the test file**

Create `apps/simple-reader/main/pipeline/__tests__/reflect.test.ts`:

```typescript
import fs from "node:fs"
import os from "node:os"

import { describe, expect, it, vi } from "vitest"

import { createContext } from "../context"
import { reflectStage } from "../stages/reflect"

vi.mock("electron", () => ({
  app: { getPath: () => os.tmpdir(), getAppPath: () => "/tmp" },
}))

vi.mock("../../preferences", () => ({
  loadPreferences: vi.fn(() => ({
    language: "zh-CN",
    interests: [],
    reportStyle: "detailed",
    timeRange: 24,
    minimaxApiKey: "",
    ttsVoiceId: "",
    ttsModel: "",
    githubToken: "ghp_test",
    githubOwner: "test",
    pipelineSchedule: "",
    workerUrl: "",
    workerSecret: "",
    deepgramApiKey: "",
    youtubeClientId: "yt-client",
    youtubeClientSecret: "yt-secret",
    youtubeRefreshToken: "yt-refresh",
    youtubeEnabled: true,
    youtubeShortsEnabled: true,
    youtubeShortsCount: 1,
    shortsBgmPath: "",
  })),
}))

vi.mock("../../youtube", () => ({
  listChannelVideos: vi.fn(async () => [
    {
      videoId: "vid1",
      title: "YOMOO 每日AI快送 — 2026-04-01",
      publishedAt: "2026-04-01T08:00:00Z",
      description: "1. OpenAI发布GPT-5\n2. Google推出Gemini Pro",
      viewCount: 1200,
      likeCount: 45,
      commentCount: 8,
      duration: "PT8M30S",
    },
    {
      videoId: "shorts1",
      title: "3个你必须知道的AI更新",
      publishedAt: "2026-04-01T09:00:00Z",
      description: "AI快送 #shorts",
      viewCount: 5000,
      likeCount: 200,
      commentCount: 15,
      duration: "PT42S",
    },
  ]),
  parseDuration: vi.fn((iso: string) => {
    if (iso === "PT8M30S") return 510
    if (iso === "PT42S") return 42
    return 0
  }),
}))

vi.mock("../../database", () => ({
  queryAll: vi.fn(() => []),
  execute: vi.fn(),
  saveDatabase: vi.fn(),
}))

vi.mock("../../ai-report", () => ({
  runClaude: vi.fn(
    async () => `---
name: content-strategy
description: Auto-generated content strategy based on YouTube performance data
---

## 选题偏好
- OpenAI/GPT 相关话题表现好 (Views: 1200)

## Shorts 策略
- 数字类标题效果好 (Views: 5000)

## 更新日期
2026-04-04`,
  ),
}))

vi.mock("../../workspace", () => ({
  getWorkspacePath: vi.fn(() => {
    const p = os.tmpdir() + "/test-workspace"
    fs.mkdirSync(p + "/.claude/skills", { recursive: true })
    return p
  }),
}))

describe("reflect stage", () => {
  it("shouldRun returns true when youtube enabled and accessToken present", () => {
    const ctx = createContext({
      youtubeAccessToken: "test-token",
    })
    expect(reflectStage.shouldRun(ctx)).toBe(true)
  })

  it("shouldRun returns false when youtube disabled", () => {
    const ctx = createContext()
    // youtubeEnabled is true in mock but no accessToken
    expect(reflectStage.shouldRun(ctx)).toBe(false)
  })

  it("runs and writes content-strategy.md skill file", async () => {
    const ctx = createContext({
      youtubeAccessToken: "test-token",
    })

    const statuses: string[] = []
    const result = await reflectStage.run(ctx, {
      onStatus: (s) => statuses.push(s),
    })

    // Should not mutate context
    expect(result.date).toBe(ctx.date)

    // Should have written the skill file
    const skillPath = os.tmpdir() + "/test-workspace/.claude/skills/content-strategy.md"
    expect(fs.existsSync(skillPath)).toBe(true)
    const content = fs.readFileSync(skillPath, "utf-8")
    expect(content).toContain("content-strategy")
    expect(content).toContain("选题偏好")

    // Cleanup
    fs.rmSync(os.tmpdir() + "/test-workspace", { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/simple-reader && npx vitest run main/pipeline/__tests__/reflect.test.ts`
Expected: FAIL — `../stages/reflect` module not found.

- [ ] **Step 3: Write the reflect stage**

Create `apps/simple-reader/main/pipeline/stages/reflect.ts`:

```typescript
import fs from "node:fs"

import path from "pathe"

import { runClaude } from "../../ai-report"
import { queryAll } from "../../database"
import type { TopicEntry } from "../../database"
import { listChannelVideos, parseDuration } from "../../youtube"
import type { ChannelVideo } from "../../youtube"
import { getWorkspacePath } from "../../workspace"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

interface ClassifiedVideo extends ChannelVideo {
  type: "video" | "shorts"
}

/**
 * Classify a video as 'video' or 'shorts' using DB records + duration fallback.
 */
function classifyVideos(
  videos: ChannelVideo[],
  dbRecords: Array<{ video_id: string; type: string }>,
): ClassifiedVideo[] {
  const dbMap = new Map(dbRecords.map((r) => [r.video_id, r.type]))

  return videos.map((v) => {
    const dbType = dbMap.get(v.videoId)
    if (dbType === "video" || dbType === "shorts") {
      return { ...v, type: dbType }
    }
    // Fallback: duration < 60s → shorts
    const seconds = parseDuration(v.duration)
    return { ...v, type: seconds > 0 && seconds < 60 ? "shorts" : "video" }
  })
}

/**
 * Format classified videos into a prompt section for Claude analysis.
 */
function formatVideoData(
  videos: ClassifiedVideo[],
  topics: Array<{ reportDate: string; topics: TopicEntry[] }>,
): string {
  const longVideos = videos
    .filter((v) => v.type === "video")
    .sort((a, b) => b.viewCount - a.viewCount)

  const shorts = videos.filter((v) => v.type === "shorts").sort((a, b) => b.viewCount - a.viewCount)

  // Build topic lookup by date
  const topicsByDate = new Map<string, string[]>()
  for (const report of topics) {
    topicsByDate.set(
      report.reportDate,
      report.topics.map((t) => t.name),
    )
  }

  const longLines = longVideos.map((v) => {
    const date = v.publishedAt.slice(0, 10)
    const dateTopics = topicsByDate.get(date)
    const topicsStr = dateTopics ? ` | Topics: ${dateTopics.join(", ")}` : ""
    return `- ${date} | Views: ${v.viewCount} | Likes: ${v.likeCount} | Comments: ${v.commentCount}${topicsStr}`
  })

  const shortsLines = shorts.map((v) => {
    const date = v.publishedAt.slice(0, 10)
    return `- ${date} | Views: ${v.viewCount} | Likes: ${v.likeCount} | Comments: ${v.commentCount} | Title: "${v.title}"`
  })

  return `## 长视频表现 (按播放量排序, ${longLines.length} 条)

${longLines.length > 0 ? longLines.join("\n") : "暂无数据"}

## Shorts 表现 (按播放量排序, ${shortsLines.length} 条)

${shortsLines.length > 0 ? shortsLines.join("\n") : "暂无数据"}`
}

function buildReflectPrompt(videoData: string, currentSkill: string): string {
  const today = new Date().toISOString().slice(0, 10)

  return `你是一个内容策略分析师。根据以下 YouTube 数据分析内容表现，更新内容策略。

${videoData}

## 当前策略 (${currentSkill ? "已有策略如下" : "无历史策略，首次生成"})

${currentSkill || "无"}

## 输出要求

输出完整的更新后策略文件（markdown格式，包含 YAML frontmatter）。

YAML frontmatter 必须为:
\`\`\`
---
name: content-strategy
description: Auto-generated content strategy based on YouTube performance data
---
\`\`\`

正文结构必须包含:
1. 选题偏好 — 哪些话题类型表现好/差，附具体数据
2. Shorts 策略 — hook 模式、标题风格、时长偏好的效果对比
3. 播客风格建议 — 基于长视频的节奏建议
4. 注意事项 — 应避免的模式
5. 更新日期: ${today}

规则:
- 保留被数据验证的旧规则
- 修正被数据否定的旧规则
- 新增发现的模式
- 每条结论必须引用具体数据支撑
- 如果数据量太少（少于5条），注明"数据量不足，结论为初步观察"
- 只输出 markdown 文件内容，不要其他文字`
}

export const reflectStage: StageDefinition = {
  name: "reflect",
  label: "Reflect on Content Performance",
  shouldRun: (ctx: PipelineContext) => ctx.prefs.youtubeEnabled && !!ctx.youtubeAccessToken,
  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    callbacks.onStatus("Analyzing content performance...")

    // 1. Fetch videos with duration
    const videos = await listChannelVideos(ctx.youtubeAccessToken!, 50)

    // 2. Classify using DB + duration fallback
    const dbRecords = queryAll<{ video_id: string; type: string }>(
      "SELECT video_id, type FROM video_uploads",
    )
    const classified = classifyVideos(videos, dbRecords)

    const videoCount = classified.filter((v) => v.type === "video").length
    const shortsCount = classified.filter((v) => v.type === "shorts").length
    callbacks.onStatus(`Found ${videoCount} videos, ${shortsCount} Shorts`)

    // 3. Pull recent topics for correlation
    const cutoff = Math.floor(Date.now() / 1000) - 30 * 86400
    const topicRows = queryAll<{ topics_json: string; created_at: number }>(
      "SELECT topics_json, created_at FROM report_topics WHERE created_at > ? ORDER BY created_at DESC",
      [cutoff],
    )
    const topics = topicRows.map((r) => ({
      reportDate: new Date(r.created_at * 1000).toLocaleDateString("en-CA"),
      topics: JSON.parse(r.topics_json) as TopicEntry[],
    }))

    // 4. Read existing skill
    const workspacePath = getWorkspacePath()
    const skillPath = path.join(workspacePath, ".claude", "skills", "content-strategy.md")
    let currentSkill = ""
    try {
      if (fs.existsSync(skillPath)) {
        currentSkill = fs.readFileSync(skillPath, "utf-8")
      }
    } catch {
      // First run, no existing skill
    }

    // 5. Build prompt and run Claude
    const videoData = formatVideoData(classified, topics)
    const prompt = buildReflectPrompt(videoData, currentSkill)

    callbacks.onStatus("Generating updated content strategy...")
    const updatedSkill = await runClaude(prompt)

    // 6. Write updated skill
    const skillDir = path.join(workspacePath, ".claude", "skills")
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(skillPath, updatedSkill.trim() + "\n", "utf-8")

    console.info("[reflect] Content strategy updated:", skillPath)
    callbacks.onStatus("Content strategy updated")

    return ctx
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/simple-reader && npx vitest run main/pipeline/__tests__/reflect.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
cd apps/simple-reader && git add main/pipeline/stages/reflect.ts main/pipeline/__tests__/reflect.test.ts && git commit -m "feat(pipeline): add reflect stage for content self-evolution"
```

---

### Task 8: Wire Reflect into Orchestrator

**Files:**

- Modify: `apps/simple-reader/main/pipeline/orchestrator.ts:7-17,34-44,91-93`

- [ ] **Step 1: Import reflectStage**

In `apps/simple-reader/main/pipeline/orchestrator.ts`, add the import after the existing stage imports (after line 11):

```typescript
import { reflectStage } from "./stages/reflect"
```

- [ ] **Step 2: Add to ALL_STAGES**

In `apps/simple-reader/main/pipeline/orchestrator.ts`, update the `ALL_STAGES` array at line 34 to insert `reflectStage` after `verifyStage`:

```typescript
const ALL_STAGES: StageDefinition[] = [
  verifyStage,
  reflectStage,
  reportStage,
  podcastStage,
  audioStage,
  uploadStage,
  publishStage,
  videoStage,
  youtubeStage,
  shortsStage,
]
```

- [ ] **Step 3: Add `"reflect"` to nonFatal list**

In `apps/simple-reader/main/pipeline/orchestrator.ts`, update the `nonFatal` array at line 92:

```typescript
const nonFatal: StageName[] = ["reflect", "video", "youtube", "shorts"]
```

- [ ] **Step 4: Run existing orchestrator tests**

Run: `cd apps/simple-reader && npx vitest run main/pipeline/__tests__/orchestrator.test.ts`
Expected: PASS — existing tests still green.

- [ ] **Step 5: Commit**

```bash
cd apps/simple-reader && git add main/pipeline/orchestrator.ts && git commit -m "feat(pipeline): wire reflect stage into orchestrator"
```

---

### Task 9: Inject Skills into `generateShortsScript`

**Files:**

- Modify: `apps/simple-reader/main/ai-report.ts:1044-1093`

- [ ] **Step 1: Add skills injection to Shorts prompt**

In `apps/simple-reader/main/ai-report.ts`, inside `generateShortsScript` (line 1044), add the skills loading before the prompt construction. Add after the `onStatus` call at line 1049:

```typescript
const skillsSection = formatSkillsPrompt(loadAllSkills())
```

Then update the prompt string at line 1056 to prepend the skills section. Change:

```typescript
  const prompt = `You are an elite viral short-video scriptwriter for "YOMOO 每日AI快送", a Chinese AI/tech news channel on YouTube Shorts.
```

to:

```typescript
  const prompt = `${skillsSection}

You are an elite viral short-video scriptwriter for "YOMOO 每日AI快送", a Chinese AI/tech news channel on YouTube Shorts.
```

Note: `formatSkillsPrompt` and `loadAllSkills` are already imported in this file (used by `buildScreeningPrompt` and `buildReportPrompt`).

- [ ] **Step 2: Verify imports exist**

Check that these imports are already present at the top of `ai-report.ts` (they are, at line 13):

```typescript
import { formatSkillsPrompt, loadAllSkills } from "./skills"
```

No new imports needed.

- [ ] **Step 3: Commit**

```bash
cd apps/simple-reader && git add main/ai-report.ts && git commit -m "feat(shorts): inject skills into Shorts script generation"
```

---

### Task 10: Run Full Test Suite and Typecheck

**Files:** None (verification only)

- [ ] **Step 1: Run all simple-reader tests**

Run: `cd apps/simple-reader && npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/sticky-rat && pnpm run typecheck`
Expected: No type errors in changed files.

- [ ] **Step 3: Run lint**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/sticky-rat && pnpm run lint:fix`
Expected: No lint errors (auto-fix applied).

- [ ] **Step 4: Final commit if lint made changes**

```bash
git add -A && git commit -m "style: lint fixes"
```
