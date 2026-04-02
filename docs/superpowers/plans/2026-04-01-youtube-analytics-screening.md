# YouTube Analytics for Screening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch YouTube channel video statistics and inject audience preference insights into the AI screening prompt so the podcast covers topics that resonate with the audience.

**Architecture:** Add `listChannelVideos()` to `youtube.ts` to fetch video stats via YouTube Data API v3. Add `formatYouTubeInsights()` to `ai-report.ts` to parse video descriptions for headlines (with `report_topics` fallback) and format them into a screening prompt section. Wire it into `pipeline.ts` before the screening stage as a non-fatal step.

**Tech Stack:** YouTube Data API v3, Vitest, TypeScript

---

### Task 1: `listChannelVideos` — YouTube Data API fetching

**Files:**

- Modify: `apps/simple-reader/main/youtube.ts`
- Modify: `apps/simple-reader/main/__tests__/youtube.test.ts`

- [ ] **Step 1: Write failing tests for `listChannelVideos`**

Add to `apps/simple-reader/main/__tests__/youtube.test.ts`:

```typescript
import {
  buildVideoDescription,
  exchangeCode,
  getAuthUrl,
  listChannelVideos,
  refreshAccessToken,
  setThumbnail,
  uploadVideo,
} from "../youtube"

// ... existing tests ...

describe("listChannelVideos", () => {
  it("should fetch channel uploads and return video stats", async () => {
    // Step 1: channels.list → get uploads playlist ID
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{ contentDetails: { relatedPlaylists: { uploads: "UU_playlist_123" } } }],
      }),
    })

    // Step 2: playlistItems.list → get video IDs + snippets
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            snippet: {
              resourceId: { videoId: "vid-1" },
              title: "YOMOO 每日AI快送 — 2026-03-25",
              publishedAt: "2026-03-25T08:00:00Z",
            },
          },
          {
            snippet: {
              resourceId: { videoId: "vid-2" },
              title: "YOMOO 每日AI快送 — 2026-03-24",
              publishedAt: "2026-03-24T08:00:00Z",
            },
          },
        ],
      }),
    })

    // Step 3: videos.list → get statistics + full snippet (description)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "vid-1",
            snippet: {
              title: "YOMOO 每日AI快送 — 2026-03-25",
              publishedAt: "2026-03-25T08:00:00Z",
              description:
                "YOMOO 每日AI快送 — 2026-03-25\n\n今日快送：3条重点新闻\n1. GPT-5 released\n2. Apple AI chip\n3. Anthropic funding\n\n🔗 网页版: https://example.com",
            },
            statistics: { viewCount: "12500", likeCount: "340", commentCount: "28" },
          },
          {
            id: "vid-2",
            snippet: {
              title: "YOMOO 每日AI快送 — 2026-03-24",
              publishedAt: "2026-03-24T08:00:00Z",
              description:
                "YOMOO 每日AI快送 — 2026-03-24\n\n今日快送：2条重点新闻\n1. Google Gemini update\n2. Nvidia new GPU\n\n🔗 网页版: https://example.com",
            },
            statistics: { viewCount: "8200", likeCount: "210", commentCount: "15" },
          },
        ],
      }),
    })

    const videos = await listChannelVideos("access-token-123", 10)

    expect(videos).toHaveLength(2)
    expect(videos[0]).toEqual({
      videoId: "vid-1",
      title: "YOMOO 每日AI快送 — 2026-03-25",
      publishedAt: "2026-03-25T08:00:00Z",
      description: expect.stringContaining("GPT-5 released"),
      viewCount: 12500,
      likeCount: 340,
      commentCount: 28,
    })
    expect(videos[1]!.viewCount).toBe(8200)

    // Verify API calls
    const [channelsUrl] = mockFetch.mock.calls[0]
    expect(channelsUrl).toContain("youtube.googleapis.com/youtube/v3/channels")
    expect(channelsUrl).toContain("mine=true")

    const [playlistUrl] = mockFetch.mock.calls[1]
    expect(playlistUrl).toContain("youtube.googleapis.com/youtube/v3/playlistItems")
    expect(playlistUrl).toContain("UU_playlist_123")

    const [videosUrl] = mockFetch.mock.calls[2]
    expect(videosUrl).toContain("youtube.googleapis.com/youtube/v3/videos")
    expect(videosUrl).toContain("vid-1")
    expect(videosUrl).toContain("vid-2")
  })

  it("should return empty array if channel has no uploads", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    })

    const videos = await listChannelVideos("access-token", 10)
    expect(videos).toEqual([])
  })

  it("should throw on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    })

    await expect(listChannelVideos("bad-token", 10)).rejects.toThrow("Failed to list channel")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/simple-reader && npx vitest run main/__tests__/youtube.test.ts`
Expected: FAIL — `listChannelVideos` is not exported from `../youtube`

- [ ] **Step 3: Implement `listChannelVideos`**

Add to `apps/simple-reader/main/youtube.ts`:

```typescript
// Add near the top with other URL constants:
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels"
const PLAYLIST_ITEMS_URL = "https://www.googleapis.com/youtube/v3/playlistItems"
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"

export interface ChannelVideo {
  videoId: string
  title: string
  publishedAt: string
  description: string
  viewCount: number
  likeCount: number
  commentCount: number
}

// --- Analytics ---

export async function listChannelVideos(
  accessToken: string,
  maxResults = 30,
): Promise<ChannelVideo[]> {
  // Step 1: Get the channel's "uploads" playlist ID
  const channelsResp = await fetch(`${CHANNELS_URL}?part=contentDetails&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!channelsResp.ok) {
    const err = await channelsResp.text()
    throw new Error(`Failed to list channel: HTTP ${channelsResp.status} — ${err}`)
  }

  const channelsData = await channelsResp.json()
  if (!channelsData.items || channelsData.items.length === 0) {
    return []
  }

  const uploadsPlaylistId = channelsData.items[0].contentDetails.relatedPlaylists.uploads as string

  // Step 2: List recent videos from the uploads playlist
  const playlistResp = await fetch(
    `${PLAYLIST_ITEMS_URL}?part=snippet&playlistId=${encodeURIComponent(uploadsPlaylistId)}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!playlistResp.ok) {
    const err = await playlistResp.text()
    throw new Error(`Failed to list playlist items: HTTP ${playlistResp.status} — ${err}`)
  }

  const playlistData = await playlistResp.json()
  if (!playlistData.items || playlistData.items.length === 0) {
    return []
  }

  const videoIds = playlistData.items.map((item: any) => item.snippet.resourceId.videoId as string)

  // Step 3: Get statistics + full snippet for each video (batch by 50 max)
  const videosResp = await fetch(`${VIDEOS_URL}?part=snippet,statistics&id=${videoIds.join(",")}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!videosResp.ok) {
    const err = await videosResp.text()
    throw new Error(`Failed to get video details: HTTP ${videosResp.status} — ${err}`)
  }

  const videosData = await videosResp.json()

  return (videosData.items || []).map((item: any) => ({
    videoId: item.id as string,
    title: item.snippet.title as string,
    publishedAt: item.snippet.publishedAt as string,
    description: item.snippet.description as string,
    viewCount: Number(item.statistics.viewCount || 0),
    likeCount: Number(item.statistics.likeCount || 0),
    commentCount: Number(item.statistics.commentCount || 0),
  }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/simple-reader && npx vitest run main/__tests__/youtube.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/simple-reader/main/youtube.ts apps/simple-reader/main/__tests__/youtube.test.ts
git commit -m "feat(simple-reader): add listChannelVideos for YouTube analytics"
```

---

### Task 2: `parseDescriptionHeadlines` and `formatYouTubeInsights` — data formatting

**Files:**

- Modify: `apps/simple-reader/main/ai-report.ts`
- Create: `apps/simple-reader/main/__tests__/ai-report-youtube.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/simple-reader/main/__tests__/ai-report-youtube.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest"

import { formatYouTubeInsights, parseDescriptionHeadlines } from "../ai-report"

// Mock database module — formatYouTubeInsights calls queryAll for fallback
vi.mock("../database", () => ({
  queryAll: vi.fn(() => []),
  queryOne: vi.fn(),
  execute: vi.fn(),
}))

// Mock skills module
vi.mock("../skills", () => ({
  loadAllSkills: vi.fn(() => []),
  formatSkillsPrompt: vi.fn(() => ""),
}))

// Mock workspace module
vi.mock("../workspace", () => ({
  getWorkspacePath: vi.fn(() => "/tmp"),
}))

describe("parseDescriptionHeadlines", () => {
  it("should extract numbered headlines from video description", () => {
    const description = `YOMOO 每日AI快送 — 2026-03-25

今日快送：3条重点新闻
1. GPT-5 officially released with major improvements
2. Apple unveils custom AI chip for on-device inference
3. Anthropic raises $5B in Series D funding

🔗 网页版: https://example.com
🎧 播客音频: https://example.com/audio.mp3
📧 订阅邮件: https://daily.yomoo.net/subscribe/index.html

#AI #每日AI快送 #YOMOO #科技新闻`

    const headlines = parseDescriptionHeadlines(description)

    expect(headlines).toEqual([
      "GPT-5 officially released with major improvements",
      "Apple unveils custom AI chip for on-device inference",
      "Anthropic raises $5B in Series D funding",
    ])
  })

  it("should return empty array for description without numbered headlines", () => {
    const description = "Just a regular video description with no numbered items."
    expect(parseDescriptionHeadlines(description)).toEqual([])
  })

  it("should handle description with only some numbered lines", () => {
    const description = `Some intro text
1. First headline
2. Second headline
Some trailing text`

    const headlines = parseDescriptionHeadlines(description)
    expect(headlines).toEqual(["First headline", "Second headline"])
  })
})

describe("formatYouTubeInsights", () => {
  it("should format top videos sorted by views with headlines from description", () => {
    const videos = [
      {
        videoId: "v1",
        title: "YOMOO 每日AI快送 — 2026-03-25",
        publishedAt: "2026-03-25T08:00:00Z",
        description:
          "YOMOO 每日AI快送 — 2026-03-25\n\n今日快送：2条重点新闻\n1. GPT-5 released\n2. Apple AI chip\n\n🔗 网页版: https://example.com",
        viewCount: 12500,
        likeCount: 340,
        commentCount: 28,
      },
      {
        videoId: "v2",
        title: "YOMOO 每日AI快送 — 2026-03-24",
        publishedAt: "2026-03-24T08:00:00Z",
        description:
          "YOMOO 每日AI快送 — 2026-03-24\n\n今日快送：1条重点新闻\n1. Nvidia new GPU\n\n🔗 网页版: https://example.com",
        viewCount: 8200,
        likeCount: 210,
        commentCount: 15,
      },
    ]

    const result = formatYouTubeInsights(videos)

    // Should be sorted by views (highest first)
    expect(result).toContain("2026-03-25")
    expect(result).toContain("Views: 12500")
    expect(result).toContain("GPT-5 released")
    expect(result).toContain("Apple AI chip")
    expect(result).toContain("Nvidia new GPU")
    // Should contain the soft-preference instruction
    expect(result).toContain("audience")
  })

  it("should return empty string for empty video list", () => {
    expect(formatYouTubeInsights([])).toBe("")
  })

  it("should limit to top 10 videos", () => {
    const videos = Array.from({ length: 15 }, (_, i) => ({
      videoId: `v${i}`,
      title: `Video ${i}`,
      publishedAt: `2026-03-${String(i + 1).padStart(2, "0")}T08:00:00Z`,
      description: `1. Topic ${i}`,
      viewCount: 1000 - i * 50,
      likeCount: 100,
      commentCount: 10,
    }))

    const result = formatYouTubeInsights(videos)

    // Should only include top 10
    expect(result).toContain("Topic 0") // highest views
    expect(result).toContain("Topic 9") // 10th highest
    expect(result).not.toContain("Topic 10") // 11th — excluded
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/simple-reader && npx vitest run main/__tests__/ai-report-youtube.test.ts`
Expected: FAIL — `parseDescriptionHeadlines` and `formatYouTubeInsights` are not exported

- [ ] **Step 3: Implement `parseDescriptionHeadlines` and `formatYouTubeInsights`**

Add to `apps/simple-reader/main/ai-report.ts`, and export both functions:

```typescript
import type { ChannelVideo } from "./youtube"

// Add near other imports at the top:
import type { TopicEntry } from "./database"

/**
 * Extract numbered headlines (e.g. "1. GPT-5 released") from a YouTube video description.
 */
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

/**
 * Format YouTube video performance data into a screening prompt section.
 * Sorts by viewCount descending, takes top 10, and extracts topics from
 * video descriptions. Falls back to report_topics DB for videos without
 * description headlines.
 */
export function formatYouTubeInsights(videos: ChannelVideo[]): string {
  if (videos.length === 0) return ""

  const sorted = [...videos].sort((a, b) => b.viewCount - a.viewCount)
  const top = sorted.slice(0, 10)

  const lines = top.map((v) => {
    const date = v.publishedAt.slice(0, 10)
    let headlines = parseDescriptionHeadlines(v.description)

    // Fallback: query report_topics by date
    if (headlines.length === 0) {
      headlines = getTopicsFromDatabase(date)
    }

    const topicsStr = headlines.length > 0 ? `   Topics: ${headlines.join(", ")}` : ""

    return `- ${date} | Views: ${v.viewCount} | Likes: ${v.likeCount} | Comments: ${v.commentCount}${topicsStr ? "\n" + topicsStr : ""}`
  })

  return `## YouTube Audience Insights (recent videos, sorted by views)

${lines.join("\n\n")}

When screening entries, consider that topics similar to high-performing episodes may resonate better with the audience. This is a soft preference — news value still takes priority.`
}

function getTopicsFromDatabase(date: string): string[] {
  try {
    // Match reports created on this date
    const dayStart = Math.floor(new Date(date).getTime() / 1000)
    const dayEnd = dayStart + 86400
    const rows = queryAll<{ topics_json: string }>(
      `SELECT topics_json FROM report_topics WHERE created_at >= ? AND created_at < ? LIMIT 1`,
      [dayStart, dayEnd],
    )
    if (rows.length === 0) return []
    const topics = JSON.parse(rows[0]!.topics_json) as TopicEntry[]
    return topics.map((t) => t.name)
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/simple-reader && npx vitest run main/__tests__/ai-report-youtube.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/simple-reader/main/ai-report.ts apps/simple-reader/main/__tests__/ai-report-youtube.test.ts
git commit -m "feat(simple-reader): add YouTube insights formatting for screening prompt"
```

---

### Task 3: Inject YouTube insights into `buildScreeningPrompt`

**Files:**

- Modify: `apps/simple-reader/main/ai-report.ts`
- Modify: `apps/simple-reader/main/__tests__/ai-report-youtube.test.ts`

- [ ] **Step 1: Write failing test for `buildScreeningPrompt` with YouTube insights**

Add to `apps/simple-reader/main/__tests__/ai-report-youtube.test.ts`:

```typescript
import {
  buildScreeningPrompt,
  formatYouTubeInsights,
  parseDescriptionHeadlines,
} from "../ai-report"

describe("buildScreeningPrompt with youtubeInsights", () => {
  it("should include YouTube insights section when provided", () => {
    const entries = [
      {
        id: "e1",
        title: "Test Entry",
        feed_title: "Test Feed",
        feed_category: null,
        description: "A test entry",
        content: null,
        url: null,
        author: null,
        guid: "g1",
        feed_id: "f1",
        published_at: 1000,
        inserted_at: 1000,
        read: 0,
        original_content: null,
      },
    ]
    const prefs = {
      language: "zh-CN",
      interests: ["AI"],
      reportStyle: "detailed" as const,
      timeRange: 24,
      minimaxApiKey: "",
      ttsVoiceId: "",
      ttsModel: "",
      githubToken: "",
      githubOwner: "",
      pipelineSchedule: "",
      workerUrl: "",
      workerSecret: "",
      deepgramApiKey: "",
      youtubeClientId: "",
      youtubeClientSecret: "",
      youtubeRefreshToken: "",
      youtubeEnabled: false,
    }

    const youtubeInsights =
      "## YouTube Audience Insights\n- 2026-03-25 | Views: 12500\n   Topics: GPT-5, Apple AI chip"

    const prompt = buildScreeningPrompt(entries, prefs, youtubeInsights)

    expect(prompt).toContain("YouTube Audience Insights")
    expect(prompt).toContain("GPT-5")
    expect(prompt).toContain("[0] Test Entry")
  })

  it("should work without YouTube insights", () => {
    const entries = [
      {
        id: "e1",
        title: "Test Entry",
        feed_title: "Test Feed",
        feed_category: null,
        description: "A test entry",
        content: null,
        url: null,
        author: null,
        guid: "g1",
        feed_id: "f1",
        published_at: 1000,
        inserted_at: 1000,
        read: 0,
        original_content: null,
      },
    ]
    const prefs = {
      language: "zh-CN",
      interests: [],
      reportStyle: "detailed" as const,
      timeRange: 24,
      minimaxApiKey: "",
      ttsVoiceId: "",
      ttsModel: "",
      githubToken: "",
      githubOwner: "",
      pipelineSchedule: "",
      workerUrl: "",
      workerSecret: "",
      deepgramApiKey: "",
      youtubeClientId: "",
      youtubeClientSecret: "",
      youtubeRefreshToken: "",
      youtubeEnabled: false,
    }

    const prompt = buildScreeningPrompt(entries, prefs)

    expect(prompt).toContain("[0] Test Entry")
    expect(prompt).not.toContain("YouTube")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/simple-reader && npx vitest run main/__tests__/ai-report-youtube.test.ts`
Expected: FAIL — `buildScreeningPrompt` is not exported / doesn't accept third argument

- [ ] **Step 3: Modify `buildScreeningPrompt` to accept and inject YouTube insights**

In `apps/simple-reader/main/ai-report.ts`:

1. Export the function and add the optional parameter:

Change:

```typescript
function buildScreeningPrompt(entries: EntryWithFeed[], prefs: UserPreferences): string {
```

To:

```typescript
export function buildScreeningPrompt(entries: EntryWithFeed[], prefs: UserPreferences, youtubeInsights?: string): string {
```

2. Inject the insights into the prompt. Change the return statement from:

```typescript
  return `${skillsSection}

Your task: Screen RSS entries and select valuable ones, and identify 1-2 "hot topics" that deserve deeper investigation.

${interestsStr}
```

To:

```typescript
  const youtubeSection = youtubeInsights ? `\n${youtubeInsights}\n` : ""

  return `${skillsSection}

Your task: Screen RSS entries and select valuable ones, and identify 1-2 "hot topics" that deserve deeper investigation.

${interestsStr}
${youtubeSection}
```

3. Update the call site in `generateReport` (line ~111). Change:

```typescript
const screeningPrompt = buildScreeningPrompt(entriesToScreen, effectivePrefs)
```

To:

```typescript
const screeningPrompt = buildScreeningPrompt(entriesToScreen, effectivePrefs, youtubeInsights)
```

4. Add `youtubeInsights` as an optional parameter to `generateReport`. Change the function signature from:

```typescript
export async function generateReport(
  onChunk: (text: string) => void,
  onStatus: (status: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  groupId?: string,
): Promise<void> {
```

To:

```typescript
export async function generateReport(
  onChunk: (text: string) => void,
  onStatus: (status: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  groupId?: string,
  youtubeInsights?: string,
): Promise<void> {
```

5. Similarly update `generateReportToString` to pass through `youtubeInsights`. Change:

```typescript
export async function generateReportToString(
  onStatus: (status: string) => void,
  groupId?: string,
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
    ).catch(reject)
  })
}
```

To:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/simple-reader && npx vitest run main/__tests__/ai-report-youtube.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/simple-reader/main/ai-report.ts apps/simple-reader/main/__tests__/ai-report-youtube.test.ts
git commit -m "feat(simple-reader): inject YouTube insights into screening prompt"
```

---

### Task 4: Wire YouTube analytics into `pipeline.ts`

**Files:**

- Modify: `apps/simple-reader/main/pipeline.ts`

- [ ] **Step 1: Write the pipeline integration**

In `apps/simple-reader/main/pipeline.ts`, add the YouTube analytics fetch before the report generation stage.

Add import at top:

```typescript
import {
  buildVideoDescription,
  listChannelVideos,
  refreshAccessToken,
  setThumbnail,
  uploadVideo,
} from "./youtube"
import { formatYouTubeInsights } from "./ai-report"
```

Note: `refreshAccessToken` is already imported. Update the existing import line to also include `listChannelVideos`:

Change:

```typescript
import { buildVideoDescription, refreshAccessToken, setThumbnail, uploadVideo } from "./youtube"
```

To:

```typescript
import {
  buildVideoDescription,
  listChannelVideos,
  refreshAccessToken,
  setThumbnail,
  uploadVideo,
} from "./youtube"
```

Add the `formatYouTubeInsights` import:

```typescript
import {
  generatePodcastScriptToString,
  generateReportToString,
  generateSeoDescription,
  formatYouTubeInsights,
} from "./ai-report"
```

Then, inside `runPipeline`, after the `ensureRepo` block and before Stage 1 (Generate AI Report), add:

```typescript
// Pre-stage: Fetch YouTube audience insights (non-fatal)
let youtubeInsights: string | undefined
if (prefs.youtubeEnabled && prefs.youtubeRefreshToken) {
  try {
    callbacks.onStatus("Fetching YouTube audience insights...")
    const accessToken = await refreshAccessToken(
      prefs.youtubeRefreshToken,
      prefs.youtubeClientId,
      prefs.youtubeClientSecret,
    )
    const videos = await listChannelVideos(accessToken)
    youtubeInsights = formatYouTubeInsights(videos) || undefined
    if (youtubeInsights) {
      console.info("[pipeline] YouTube insights loaded:", videos.length, "videos analyzed")
      callbacks.onStatus(`YouTube insights loaded: ${videos.length} videos analyzed`)
    }
  } catch (err) {
    console.info("[pipeline] YouTube insights fetch failed (non-fatal):", err)
  }
}
```

Then update the `generateReportToString` call to pass `youtubeInsights`. Change:

```typescript
reportContent = await generateReportToString((status) => {
  callbacks.onStatus(status)
}, groupId)
```

To:

```typescript
reportContent = await generateReportToString(
  (status) => {
    callbacks.onStatus(status)
  },
  groupId,
  youtubeInsights,
)
```

- [ ] **Step 2: Run all tests to verify nothing is broken**

Run: `cd apps/simple-reader && npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/main/pipeline.ts
git commit -m "feat(simple-reader): wire YouTube analytics into pipeline screening"
```

---

### Task 5: Final integration test and cleanup

**Files:**

- Modify: `apps/simple-reader/main/__tests__/ai-report-youtube.test.ts`

- [ ] **Step 1: Write integration test for `formatYouTubeInsights` with database fallback**

Add to `apps/simple-reader/main/__tests__/ai-report-youtube.test.ts`:

```typescript
import { queryAll } from "../database"

describe("formatYouTubeInsights with database fallback", () => {
  it("should fall back to report_topics when description has no headlines", () => {
    // Mock queryAll to return topics for this date
    vi.mocked(queryAll).mockReturnValueOnce([
      {
        topics_json: JSON.stringify([
          { name: "GPT-5", keywords: ["gpt", "openai"], summary: "GPT-5 released" },
          { name: "Apple AI", keywords: ["apple", "chip"], summary: "New AI chip" },
        ]),
      },
    ])

    const videos = [
      {
        videoId: "v1",
        title: "YOMOO 每日AI快送 — 2026-03-25",
        publishedAt: "2026-03-25T08:00:00Z",
        description: "No numbered headlines here, just a plain description.",
        viewCount: 10000,
        likeCount: 200,
        commentCount: 20,
      },
    ]

    const result = formatYouTubeInsights(videos)

    expect(result).toContain("GPT-5")
    expect(result).toContain("Apple AI")
  })

  it("should handle database query failure gracefully", () => {
    vi.mocked(queryAll).mockImplementationOnce(() => {
      throw new Error("DB error")
    })

    const videos = [
      {
        videoId: "v1",
        title: "YOMOO 每日AI快送 — 2026-03-25",
        publishedAt: "2026-03-25T08:00:00Z",
        description: "No headlines.",
        viewCount: 5000,
        likeCount: 100,
        commentCount: 5,
      },
    ]

    // Should not throw, just skip topics
    const result = formatYouTubeInsights(videos)
    expect(result).toContain("Views: 5000")
    expect(result).not.toContain("Topics:")
  })
})
```

- [ ] **Step 2: Run the full test suite**

Run: `cd apps/simple-reader && npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Run typecheck**

Run: `cd apps/simple-reader && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run lint**

Run: `pnpm run lint:fix`
Expected: No errors

- [ ] **Step 5: Final commit**

```bash
git add apps/simple-reader/main/__tests__/ai-report-youtube.test.ts
git commit -m "test(simple-reader): add database fallback tests for YouTube insights"
```
