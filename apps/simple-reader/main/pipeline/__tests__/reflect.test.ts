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
    const p = `${os.tmpdir()}/test-workspace`
    fs.mkdirSync(`${p}/.claude/skills`, { recursive: true })
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

  it("shouldRun returns false when no accessToken", () => {
    const ctx = createContext()
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
    const skillPath = `${os.tmpdir()}/test-workspace/.claude/skills/content-strategy.md`
    expect(fs.existsSync(skillPath)).toBe(true)
    const content = fs.readFileSync(skillPath, "utf-8")
    expect(content).toContain("content-strategy")
    expect(content).toContain("选题偏好")

    // Cleanup
    fs.rmSync(`${os.tmpdir()}/test-workspace`, { recursive: true, force: true })
  })
})
