import fs from "node:fs"
import os from "node:os"

import path from "pathe"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createContext, loadContext, saveContext } from "../context"

vi.mock("electron", () => ({ app: { getPath: () => os.tmpdir() } }))
vi.mock("../../preferences", () => ({
  loadPreferences: vi.fn(() => ({
    language: "en",
    interests: [],
    reportStyle: "detailed",
    timeRange: 24,
    minimaxApiKey: "test",
    ttsVoiceId: "English_Graceful_Lady",
    ttsModel: "speech-2.8-hd",
    githubToken: "ghp_test",
    githubOwner: "test-owner",
    pipelineSchedule: "",
    workerUrl: "",
    workerSecret: "",
    deepgramApiKey: "dg_test",
    youtubeClientId: "",
    youtubeClientSecret: "",
    youtubeRefreshToken: "",
    youtubeEnabled: false,
    youtubeShortsEnabled: true,
  })),
}))

describe("PipelineContext", () => {
  const tmpDir = path.join(os.tmpdir(), "pipeline-ctx-test")

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  it("should create a context with defaults", () => {
    const ctx = createContext()
    expect(ctx.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(ctx.prefs.githubToken).toBe("ghp_test")
  })

  it("should create a context with overrides", () => {
    const ctx = createContext({
      date: "2026-01-01",
      reportContent: "test report",
    })
    expect(ctx.date).toBe("2026-01-01")
    expect(ctx.reportContent).toBe("test report")
  })

  it("should serialize and deserialize context to JSON", () => {
    const ctx = createContext({
      reportContent: "# Test Report\nSome content here",
      podcastScript: "Hello listeners...",
      audioFilePath: "/tmp/test.mp3",
    })

    fs.mkdirSync(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, "ctx.json")

    saveContext(ctx, filePath)
    const loaded = loadContext(filePath)

    expect(loaded.date).toBe(ctx.date)
    expect(loaded.reportContent).toBe(ctx.reportContent)
    expect(loaded.podcastScript).toBe(ctx.podcastScript)
    expect(loaded.audioFilePath).toBe(ctx.audioFilePath)
  })
})
