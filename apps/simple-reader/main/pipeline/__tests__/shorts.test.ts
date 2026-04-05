import os from "node:os"

import { describe, expect, it, vi } from "vitest"

import { createContext } from "../context"
import { shortsStage } from "../stages/shorts"

// Mock electron
vi.mock("electron", () => ({ app: { getPath: () => os.tmpdir(), getAppPath: () => "/tmp" } }))

// Mock preferences
vi.mock("../../preferences", () => ({
  loadPreferences: vi.fn(() => ({
    language: "zh-CN",
    interests: [],
    reportStyle: "detailed",
    timeRange: 24,
    minimaxApiKey: "test-minimax-key",
    ttsVoiceId: "Chinese_Male_1",
    ttsModel: "speech-2.8-hd",
    githubToken: "ghp_test",
    githubOwner: "test-owner",
    pipelineSchedule: "",
    workerUrl: "",
    workerSecret: "",
    deepgramApiKey: "",
    youtubeClientId: "yt-client",
    youtubeClientSecret: "yt-secret",
    youtubeRefreshToken: "yt-refresh",
    youtubeEnabled: true,
    youtubeShortsEnabled: true,
  })),
}))

// Mock external services
vi.mock("../../ai-report", () => ({
  generateShortsScripts: vi.fn(async () => [
    {
      title: "AI自动写代码了！GitHub Copilot大升级",
      headline: "Copilot大升级",
      script: "你知道吗，GitHub Copilot 现在可以自动写代码了。关注看更多每日AI快送。",
      ogImageUrl: "https://example.com/og.jpg",
      keyPoints: ["自动写代码", "实时补全", "多语言支持"],
    },
  ]),
}))

vi.mock("../../tts", () => ({
  generateAudioToFile: vi.fn(async () => ({
    filePath: "/tmp/shorts-audio.mp3",
    subtitles: [
      { text: "你知道吗", start: 0, end: 1.5 },
      { text: "GitHub Copilot 现在可以自动写代码了", start: 1.5, end: 4 },
      { text: "关注看更多每日AI快送", start: 4, end: 6 },
    ],
  })),
}))

vi.mock("../../video-render", () => ({
  downloadShortsOGImage: vi.fn(async () => "images/shorts-og.jpg"),
  renderShorts: vi.fn(async () => "/tmp/shorts.mp4"),
}))

vi.mock("../../youtube", () => ({
  refreshAccessToken: vi.fn(async () => "mock-access-token"),
  uploadVideo: vi.fn(async () => "mock-video-id"),
}))

describe("shorts stage in isolation", () => {
  it("should run shorts stage with pre-filled context", async () => {
    const ctx = createContext({
      date: "2026-04-03",
      reportContent: "# AI快送\n\n## GitHub Copilot 大升级\n\nGitHub今天宣布Copilot获得重大更新...",
      pageUrl: "https://test-owner.github.io/yomoo-daily/episodes/2026-04-03/",
      videoPath: "/tmp/video.mp4",
      youtubeAccessToken: "existing-token",
    })

    const statuses: string[] = []
    const result = await shortsStage.run(ctx, {
      onStatus: (s) => statuses.push(s),
    })

    expect(result.shortsUrl).toBe("https://www.youtube.com/shorts/mock-video-id")
    expect(statuses.some((s) => s.includes("Generating") && s.includes("scripts"))).toBe(true)
    expect(statuses).toContain("[1] Generating Shorts audio...")
  })

  it("shouldRun returns true when youtube + shorts enabled", () => {
    const ctx = createContext()
    expect(shortsStage.shouldRun(ctx)).toBe(true)
  })
})
