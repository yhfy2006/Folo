import fs from "node:fs"
import os from "node:os"

import path from "pathe"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Channel } from "../channel-types"
import { loadChannelContext } from "../prompt-loader"

vi.mock("electron", () => ({ app: { getPath: () => os.tmpdir() } }))
vi.mock("../../preferences", () => ({
  loadPreferences: vi.fn(() => ({
    language: "en",
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
    youtubeClientId: "",
    youtubeClientSecret: "",
    youtubeRefreshToken: "",
    youtubeEnabled: false,
    youtubeShortsEnabled: false,
  })),
}))

function makeTestChannel(tmpDir: string): Channel {
  const promptDir = path.join(tmpDir, "prompts")
  fs.mkdirSync(promptDir, { recursive: true })
  return {
    id: "test-channel",
    name: "Test",
    language: "en",
    groupId: "g1",
    tts: { provider: "minimax", voiceId: "", model: "speech-02-hd" },
    stages: ["verify", "report"],
    promptDir,
    skillsDir: path.join(tmpDir, "skills"),
  } as Channel
}

describe("loadChannelContext", () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("returns empty string when context/ directory does not exist", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-test-"))
    const channel = makeTestChannel(tmpDir)
    expect(loadChannelContext(channel)).toBe("")
  })

  it("returns empty string when context/ directory is empty", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-test-"))
    const channel = makeTestChannel(tmpDir)
    fs.mkdirSync(path.join(tmpDir, "context"), { recursive: true })
    expect(loadChannelContext(channel)).toBe("")
  })

  it("loads and wraps .md files in context tags", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-test-"))
    const channel = makeTestChannel(tmpDir)
    const contextDir = path.join(tmpDir, "context")
    fs.mkdirSync(contextDir, { recursive: true })
    fs.writeFileSync(path.join(contextDir, "audience.md"), "# Audience\nDevelopers", "utf-8")
    fs.writeFileSync(path.join(contextDir, "style.md"), "# Style\nCasual", "utf-8")

    const result = loadChannelContext(channel)
    expect(result).toContain('<context name="audience">')
    expect(result).toContain("# Audience\nDevelopers")
    expect(result).toContain("</context>")
    expect(result).toContain('<context name="style">')
    expect(result).toContain("# Style\nCasual")
  })

  it("ignores non-.md files", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-test-"))
    const channel = makeTestChannel(tmpDir)
    const contextDir = path.join(tmpDir, "context")
    fs.mkdirSync(contextDir, { recursive: true })
    fs.writeFileSync(path.join(contextDir, "audience.md"), "# Audience", "utf-8")
    fs.writeFileSync(path.join(contextDir, "notes.txt"), "ignore me", "utf-8")

    const result = loadChannelContext(channel)
    expect(result).toContain("audience")
    expect(result).not.toContain("ignore me")
  })

  it("sorts files alphabetically for deterministic output", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-test-"))
    const channel = makeTestChannel(tmpDir)
    const contextDir = path.join(tmpDir, "context")
    fs.mkdirSync(contextDir, { recursive: true })
    fs.writeFileSync(path.join(contextDir, "z-last.md"), "last", "utf-8")
    fs.writeFileSync(path.join(contextDir, "a-first.md"), "first", "utf-8")

    const result = loadChannelContext(channel)
    const firstIdx = result.indexOf("a-first")
    const lastIdx = result.indexOf("z-last")
    expect(firstIdx).toBeLessThan(lastIdx)
  })
})
