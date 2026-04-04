import { describe, expect, it, vi } from "vitest"

import {
  buildScreeningPrompt,
  formatYouTubeInsights,
  parseDescriptionHeadlines,
} from "../ai-report"
import { queryAll } from "../database"

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
        duration: "PT8M30S",
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
        duration: "PT7M0S",
      },
    ]

    const result = formatYouTubeInsights(videos)

    expect(result).toContain("2026-03-25")
    expect(result).toContain("Views: 12500")
    expect(result).toContain("GPT-5 released")
    expect(result).toContain("Apple AI chip")
    expect(result).toContain("Nvidia new GPU")
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
      duration: "PT5M0S",
    }))

    const result = formatYouTubeInsights(videos)

    expect(result).toContain("Topic 0")
    expect(result).toContain("Topic 9")
    expect(result).not.toContain("Topic 10")
  })
})

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
      youtubeShortsEnabled: false,
      youtubeShortsCount: 1,
      shortsBgmPath: "",
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
      youtubeShortsEnabled: false,
      youtubeShortsCount: 1,
      shortsBgmPath: "",
    }

    const prompt = buildScreeningPrompt(entries, prefs)

    expect(prompt).toContain("[0] Test Entry")
    expect(prompt).not.toContain("YouTube")
  })
})

describe("formatYouTubeInsights with database fallback", () => {
  it("should fall back to report_topics when description has no headlines", () => {
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
        duration: "PT8M0S",
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
        duration: "PT6M0S",
      },
    ]

    const result = formatYouTubeInsights(videos)
    expect(result).toContain("Views: 5000")
    expect(result).not.toContain("Topics:")
  })
})
