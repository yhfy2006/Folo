import fs from "node:fs"
import os from "node:os"

import path from "pathe"
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
  runClaude: vi.fn(async () =>
    JSON.stringify({
      contentStrategy: `---
name: content-strategy
description: Auto-generated content strategy based on YouTube performance data
---

## 选题偏好
- OpenAI/GPT 相关话题表现好 (Views: 1200)

## Shorts 策略
- 数字类标题效果好 (Views: 5000)

## 更新日期
2026-04-06`,
      audienceInsights: `# 受众画像

## 最近话题表现
- OpenAI 相关话题最受欢迎 (播放: 1200)
- Shorts 获得更高播放 (5000 vs 1200)

## 更新时间
2026-04-06`,
      styleInsights: `# 内容风格

## 标题风格
- 数字类标题表现更好（如 "3个你必须知道的..."）

## 内容结构
- 深度分析类视频完播率高

## 更新时间
2026-04-06`,
    }),
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
  it("shouldRun returns true when youtube enabled and accessToken present and channel set", () => {
    const tmpChannel = fs.mkdtempSync(path.join(os.tmpdir(), "reflect-sr-"))
    const channel = {
      id: "test-ch",
      name: "Test",
      language: "zh-CN",
      groupId: "g1",
      tts: { provider: "minimax" as const, voiceId: "", model: "speech-02-hd" },
      stages: ["verify", "reflect", "report"] as any[],
      promptDir: path.join(tmpChannel, "prompts"),
      skillsDir: path.join(tmpChannel, "skills"),
    }
    const ctx = createContext({
      youtubeAccessToken: "test-token",
      channel,
    })
    expect(reflectStage.shouldRun(ctx)).toBe(true)
    fs.rmSync(tmpChannel, { recursive: true, force: true })
  })

  it("shouldRun returns false when no accessToken", () => {
    const ctx = createContext()
    expect(reflectStage.shouldRun(ctx)).toBe(false)
  })

  it("shouldRun requires channel", () => {
    const ctx = createContext({
      youtubeAccessToken: "test-token",
    })
    // No channel set — should return false
    expect(reflectStage.shouldRun(ctx)).toBe(false)
  })

  it("writes audience.md and style.md to channel context dir", async () => {
    // Create a temp channel dir structure
    const tmpChannel = fs.mkdtempSync(path.join(os.tmpdir(), "reflect-ch-"))
    const promptDir = path.join(tmpChannel, "prompts")
    const skillsDir = path.join(tmpChannel, "skills")
    const contextDir = path.join(tmpChannel, "context")
    fs.mkdirSync(promptDir, { recursive: true })
    fs.mkdirSync(skillsDir, { recursive: true })
    fs.mkdirSync(contextDir, { recursive: true })

    const channel = {
      id: "test-ch",
      name: "Test",
      language: "zh-CN",
      groupId: "g1",
      tts: { provider: "minimax" as const, voiceId: "", model: "speech-02-hd" },
      stages: ["verify", "reflect", "report"] as any[],
      promptDir,
      skillsDir,
    }

    const ctx = createContext({
      youtubeAccessToken: "test-token",
      channel,
    })

    await reflectStage.run(ctx, { onStatus: () => {} })

    // Should have written content-strategy.md to skills dir
    const strategyPath = path.join(skillsDir, "content-strategy.md")
    expect(fs.existsSync(strategyPath)).toBe(true)
    expect(fs.readFileSync(strategyPath, "utf-8")).toContain("选题偏好")

    // Should have written audience.md to context dir
    const audiencePath = path.join(contextDir, "audience.md")
    expect(fs.existsSync(audiencePath)).toBe(true)
    expect(fs.readFileSync(audiencePath, "utf-8")).toContain("受众画像")

    // Should have written style.md to context dir
    const stylePath = path.join(contextDir, "style.md")
    expect(fs.existsSync(stylePath)).toBe(true)
    expect(fs.readFileSync(stylePath, "utf-8")).toContain("内容风格")

    // Cleanup
    fs.rmSync(tmpChannel, { recursive: true, force: true })
  })
})
